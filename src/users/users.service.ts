import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { InjectModel } from '@nestjs/mongoose';
import { User } from './entities/user.entity';
import { Company } from '../company/entities/company.entity';
import { Model } from 'mongoose';
import { CounterId } from 'src/common/entities/counter-id.entity';
import { isMongoDuplicateKeyError } from 'src/common/utils/mongo-errors';
import { getFrontendBaseUrl, normalizeAuthEmail } from 'src/auth/auth.utils';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { EmailService } from 'src/email/email.service';
import {
  getEmailLogoAttachment,
  welcomeEmailTemplate,
} from 'src/email/email-templates.helper';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import {
  buildPaginationMeta,
  resolvePagination,
} from 'src/common/utils/pagination';
import { buildRegexOrFilter } from 'src/common/utils/mongo-search';
import { MembershipsService } from 'src/memberships/memberships.service';
import { USER_DEACTIVATION_REASON_ADMIN, isCompanyAdminActor } from './user-account.constants';
import { ValidRoles } from 'src/auth/interfaces';
import { CompanyBranchService } from 'src/company-branch/company-branch.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    @InjectModel(Company.name)
    private readonly companyModel: Model<Company>,
    @InjectModel(CounterId.name)
    private readonly counterIdModel: Model<any>,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
    private readonly membershipsService: MembershipsService,
    private readonly companyBranchService: CompanyBranchService,
  ) {}

  /** Admin de empresa: exige membresía activa para mutaciones (no aplica a superAdmin). */
  private async assertCompanyAdminWriteMembership(actor: User): Promise<void> {
    if (!isCompanyAdminActor(actor)) return;
    const companyId = actor.company ? String(actor.company).trim() : '';
    if (!companyId) return;
    await this.membershipsService.assertActiveMembershipForWrite(companyId);
  }

  async create(createUserDto: CreateUserDto, creator: User) {
    const creatorRoles = creator.roles || [];
    const creatorLegacyRole = (creator as any).role;
    const isCreatorAdmin = creatorRoles.includes('admin') || creatorLegacyRole === 'admin';
    const isCreatorSuperAdmin = creatorRoles.includes('superAdmin') || creatorLegacyRole === 'superAdmin';

    if (isCreatorAdmin && !isCreatorSuperAdmin) {
      if (createUserDto.role !== 'user') {
        throw new UnauthorizedException(
          'Los admin solo pueden crear usuarios de tipo user',
        );
      }

      // Inherit the company from the admin creator
      if (!creator.company) {
        throw new BadRequestException(
          'El usuario administrador no está vinculado a una compañía válida',
        );
      }
      createUserDto.company = creator.company;

      // Verify that the inherited company actually exists
      const companyExists = await this.companyModel.findOne({
        id: creator.company,
      });
      if (!companyExists) {
        throw new NotFoundException(
          `La compañía con id ${creator.company} asociada al administrador no existe`,
        );
      }
    } else if (isCreatorSuperAdmin) {
      if (createUserDto.role !== 'admin' && createUserDto.role !== 'user') {
        throw new UnauthorizedException(
          'Los superAdmin solo pueden crear usuarios de tipo admin o user',
        );
      }

      if (!createUserDto.company) {
        throw new BadRequestException(
          'Debe especificar la propiedad "company" (empresa) al crear el usuario',
        );
      }

      // Convert to string safely in case an integer was sent by mistake, though the DTO enforces strings
      const companyId = String(createUserDto.company);

      if (!/^\d+$/.test(companyId)) {
        throw new BadRequestException(
          'El id de la compañía no es válido, debe ser un valor entero (ej. "1", "2")',
        );
      }

      const companyExists = await this.companyModel.findOne({ id: companyId });
      if (!companyExists) {
        throw new NotFoundException(
          `La compañía con id ${companyId} no existe`,
        );
      }

      createUserDto.company = companyId;
    } else {
      throw new UnauthorizedException(
        'No tienes permisos suficientes para crear usuarios',
      );
    }

    try {
      if (
        !isCreatorSuperAdmin &&
        createUserDto.role === ValidRoles.user &&
        createUserDto.company
      ) {
        await this.membershipsService.assertCanAddNormalUser(
          String(createUserDto.company),
        );
      }

      const counter = await this.counterIdModel.findByIdAndUpdate(
        'users',
        { $inc: { seq: 1 } },
        { new: true, upsert: true },
      );

      createUserDto.id = counter.seq.toString();
      const { password, role, branchId: rawBranchId, ...userData } = createUserDto;
      const normalizedBranchId =
        await this.companyBranchService.ensureBranchBelongsToCompany(
          rawBranchId,
          String(createUserDto.company ?? ''),
        );

      const temporaryPassword = password || (Math.random().toString(36).substring(2) + Date.now().toString(36) + 'A1!');

      const user = await this.userModel.create({
        ...userData,
        branchId: normalizedBranchId,
        roles: [role],
        password: bcrypt.hashSync(String(temporaryPassword), 10),
      });

      const { password: _p, __v, _id, ...safeUser } = user.toObject();

      const recoveryToken = this.jwtService.sign({ id: user.id });
      const recoveryLink = `${getFrontendBaseUrl()}/auth/reset-password?token=${recoveryToken}`;
      const userName = user.name || user.email;

      const htmlBody = welcomeEmailTemplate(userName, recoveryLink);
      const logoAtt = getEmailLogoAttachment();

      await this.emailService
        .sendEmail({
          to: user.email,
          subject: 'Bienvenido a Cheky - Establece tu contraseña',
          htmlBody: htmlBody,
          attachements: logoAtt ? [logoAtt] : [],
        })
        .catch((e) => {
          console.error('No se pudo enviar el correo de bienvenida', e);
        });

      return {
        message:
          'Usuario creado correctamente. Se le ha enviado un correo para configurar su contraseña.',
        data: {
          user: safeUser,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error: unknown) {
      if (isMongoDuplicateKeyError(error)) {
        const field = error?.keyValue
          ? Object.keys(error.keyValue)[0]
          : 'campo';
        throw new ConflictException(`Ya existe un usuario con ese ${field}`);
      }
      if (error instanceof Error) {
        throw new BadRequestException(
          error.message ?? 'Error al crear usuario',
        );
      }
      throw new BadRequestException('Error desconocido al crear usuario');
    }
  }

  /** Impide registro u onboarding si el correo ya pertenece a una cuenta. */
  async assertEmailAvailable(email: string): Promise<void> {
    const emailNorm = normalizeAuthEmail(email);
    const existing = await this.userModel.findOne({ email: emailNorm }).select('id').lean();
    if (existing) {
      throw new ConflictException(
        'Este correo ya está registrado en Cheky. Inicia sesión con tu cuenta o usa otro correo.',
      );
    }
  }

  /**
   * Alta de admin de empresa tras pago en landing (contraseña ya definida; sin correo de bienvenida).
   */
  async createLandingPaidAdminUser(params: {
    email: string;
    document: string;
    name: string;
    lastName: string;
    password: string;
    companyId: string;
  }) {
    const emailNorm = normalizeAuthEmail(params.email);
    await this.assertEmailAvailable(emailNorm);
    const docNorm = params.document.trim();
    const dupDoc = await this.userModel.findOne({ document: docNorm }).lean();
    if (dupDoc) {
      throw new ConflictException('Ya existe un usuario con este documento');
    }
    const companyExists = await this.companyModel.findOne({ id: params.companyId });
    if (!companyExists) {
      throw new NotFoundException(
        `La compañía con id ${params.companyId} no existe`,
      );
    }
    try {
      const counter = await this.counterIdModel.findByIdAndUpdate(
        'users',
        { $inc: { seq: 1 } },
        { new: true, upsert: true },
      );
      const id = counter.seq.toString();
      const user = await this.userModel.create({
        id,
        email: emailNorm,
        document: docNorm,
        name: params.name.trim(),
        lastName: params.lastName.trim(),
        password: bcrypt.hashSync(params.password, 10),
        roles: ['admin'],
        company: params.companyId,
        isActive: true,
      });
      const { password: _p, __v, _id, ...safeUser } = user.toObject();
      return { user: safeUser };
    } catch (error: unknown) {
      if (isMongoDuplicateKeyError(error)) {
        const field = error?.keyValue
          ? Object.keys(error.keyValue)[0]
          : 'campo';
        throw new ConflictException(`Ya existe un usuario con ese ${field}`);
      }
      if (error instanceof Error) {
        throw new BadRequestException(error.message ?? 'Error al crear usuario');
      }
      throw new BadRequestException('Error desconocido al crear usuario');
    }
  }

  async findAllUsers(paginationQuery: PaginationQueryDto, requester: User) {
    const { page, limit, skip } = resolvePagination(paginationQuery);
    const requesterRoles = requester.roles || [];
    const requesterLegacyRole = (requester as any).role;
    const isSuperAdmin =
      requesterRoles.includes('superAdmin') || requesterLegacyRole === 'superAdmin';
    const isAdmin =
      requesterRoles.includes('admin') || requesterLegacyRole === 'admin';

    const searchFilter = buildRegexOrFilter<User>(paginationQuery.search, [
      'name',
      'lastName',
      'document',
    ]);

    /** Admin de empresa: solo usuarios `user` de su misma compañía. */
    const companyScopeFilter: Record<string, unknown> =
      isAdmin && !isSuperAdmin && requester.company
        ? {
            company: requester.company,
            roles: { $in: ['user'] },
          }
        : {};

    let filter: Record<string, unknown> = {};
    if (
      Object.keys(searchFilter).length > 0 &&
      Object.keys(companyScopeFilter).length > 0
    ) {
      filter = { $and: [searchFilter, companyScopeFilter] };
    } else {
      filter = { ...searchFilter, ...companyScopeFilter };
    }

    const [data, total] = await Promise.all([
      this.userModel
        .find(filter)
        .select('-password')
        .skip(skip)
        .limit(limit)
        .exec(),
      this.userModel.countDocuments(filter),
    ]);

    const objs = data.map((u) => u.toObject() as unknown as Record<string, unknown>);
    const branchIds = [
      ...new Set(
        objs
          .map((o) => o['branchId'] as string | undefined)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    let branchNames = new Map<string, string>();
    if (branchIds.length > 0) {
      try {
        const branches = await this.companyBranchService.findBranchNamesByIds(
          branchIds,
        );
        branchNames = branches;
      } catch {
        /* ignore enrich errors */
      }
    }

    // Enriquecer con nombre de empresa
    const companyIds = [
      ...new Set(
        objs
          .map((o) => o['company'] as string | undefined)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    let companyNames = new Map<string, string>();
    if (companyIds.length > 0) {
      try {
        const companies = await this.companyModel
          .find({ id: { $in: companyIds } })
          .select('id name')
          .lean();
        companyNames = new Map(
          companies.map((c) => [c.id, c.name]),
        );
      } catch {
        /* ignore enrich errors */
      }
    }

    const enriched = objs.map((o) => {
      const bid = o['branchId'] as string | undefined;
      const cid = o['company'] as string | undefined;
      return {
        ...o,
        branchName:
          bid !== undefined ? branchNames.get(String(bid)) ?? '' : '',
        companyName:
          cid !== undefined ? companyNames.get(String(cid)) ?? '' : '',
      };
    });

    return {
      data: enriched,
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  async findOneById(id: string, requester: User) {
    const requesterRoles = requester.roles || [];
    const requesterLegacyRole = (requester as any).role;
    const isSuperAdmin =
      requesterRoles.includes('superAdmin') || requesterLegacyRole === 'superAdmin';
    const isAdmin =
      requesterRoles.includes('admin') || requesterLegacyRole === 'admin';
    const isPlainUser =
      requesterRoles.includes('user') || requesterLegacyRole === 'user';

    if (isPlainUser && !isAdmin && !isSuperAdmin) {
      if (id !== requester.id) {
        throw new UnauthorizedException(
          'Solo puedes consultar la información de tu propio usuario',
        );
      }
    }

    const user = await this.userModel
      .findOne({ id })
      .select('-password')
      .exec();
    if (!user) {
      throw new NotFoundException(`Usuario con id ${id} no encontrado`);
    }

    if (isAdmin && !isSuperAdmin) {
      if (!requester.company || user.company !== requester.company) {
        throw new UnauthorizedException(
          'No puedes ver usuarios de otra compañía',
        );
      }
    }

    return user;
  }

  async toggleUserStatus(id: string, requester: User) {
    const user = await this.userModel.findOne({ id });
    if (!user) {
      throw new NotFoundException(`Usuario con id ${id} no encontrado`);
    }

    const requesterRoles = requester.roles || [];
    const requesterLegacyRole = (requester as any).role;
    const isSuperAdmin =
      requesterRoles.includes('superAdmin') || requesterLegacyRole === 'superAdmin';
    const isAdmin =
      requesterRoles.includes('admin') || requesterLegacyRole === 'admin';

    const targetRoles = user.roles || [];
    const targetLegacyRole = (user as any).role;
    const isTargetUser =
      targetRoles.includes('user') || targetLegacyRole === 'user';

    if (isAdmin && !isSuperAdmin) {
      if (!requester.company || user.company !== requester.company) {
        throw new UnauthorizedException(
          'No puedes cambiar el estado de usuarios de otra compañía',
        );
      }
      if (!isTargetUser) {
        throw new UnauthorizedException(
          'Solo puedes activar o desactivar usuarios con rol user',
        );
      }
      await this.assertCompanyAdminWriteMembership(requester);
    }

    const nextActive = !user.isActive;
    user.isActive = nextActive;
    if (nextActive) {
      user.deactivationReason = undefined;
    } else {
      user.deactivationReason = USER_DEACTIVATION_REASON_ADMIN;
    }
    await user.save();

    return {
      message: `Usuario ${nextActive ? 'activado' : 'desactivado'} exitosamente`,
      isActive: nextActive,
      deactivationReason: user.deactivationReason,
    };
  }

  async updateUser(id: string, updateUserDto: UpdateUserDto, editor: User) {
    const targetUser = await this.userModel.findOne({ id });
    if (!targetUser) {
      throw new NotFoundException(`Usuario con id ${id} no encontrado`);
    }

    const targetRoles = targetUser.roles || [];
    const targetLegacyRole = (targetUser as any).role;
    const isTargetUser = targetRoles.includes('user') || targetLegacyRole === 'user';
    const isTargetAdmin = targetRoles.includes('admin') || targetLegacyRole === 'admin';

    const editorRoles = editor.roles || [];
    const editorLegacyRole = (editor as any).role;
    const isEditorAdmin = editorRoles.includes('admin') || editorLegacyRole === 'admin';
    const isEditorSuperAdmin = editorRoles.includes('superAdmin') || editorLegacyRole === 'superAdmin';

    if (isEditorAdmin && !isEditorSuperAdmin) {
      if (!editor.company || targetUser.company !== editor.company) {
        throw new UnauthorizedException(
          'No puedes editar usuarios de otra compañía',
        );
      }
      if (!isTargetUser || isTargetAdmin) {
        throw new UnauthorizedException(
          `Tu usuario administrador no tiene permisos suficientes para editar a este usuario. Solo puedes editar perfiles de tipo 'user'.`,
        );
      }
      await this.assertCompanyAdminWriteMembership(editor);
    } else if (isEditorSuperAdmin) {
      if (!isTargetAdmin && !isTargetUser) {
        throw new UnauthorizedException(
          'Los superAdmin solo pueden editar usuarios de tipo admin o user',
        );
      }
    } else {
      throw new UnauthorizedException(
        'No tienes permisos suficientes para editar usuarios',
      );
    }

    const asAny = updateUserDto as any;

    if (asAny.password) {
      delete asAny.password;
    }

    if (isEditorAdmin && !isEditorSuperAdmin && asAny.role && asAny.role !== 'user') {
      throw new UnauthorizedException(
        'Como administrador de empresa solo puedes mantener el rol user',
      );
    }

    if (asAny.role) {
      asAny['roles'] = [asAny.role];
    }

    if (asAny.company) {
      const companyId = String(asAny.company);
      if (!/^\d+$/.test(companyId)) {
        throw new BadRequestException(
          'El id de la compañía no es válido, debe ser un valor entero (ej. "1", "2")',
        );
      }
      const companyExists = await this.companyModel.findOne({ id: companyId });
      if (!companyExists) {
        throw new NotFoundException(
          `La compañía con id ${companyId} no existe`,
        );
      }

      if (isEditorAdmin && !isEditorSuperAdmin) {
        if (companyId !== editor.company) {
          throw new UnauthorizedException(
            'Como admin, no tienes permiso para transferir usuarios a una compañía diferente a la tuya',
          );
        }
      }
      
      asAny.company = companyId;
    }

    const newCompanyId = String(
      asAny.company ?? targetUser.company ?? '',
    ).trim();

    if ('branchId' in asAny) {
      const raw = asAny.branchId;
      const norm = await this.companyBranchService.ensureBranchBelongsToCompany(
        raw === null || raw === '' ? undefined : raw,
        newCompanyId,
      );
      asAny.branchId = norm === undefined ? null : norm;
    } else if (asAny.company !== undefined && targetUser.branchId) {
      try {
        const kept = await this.companyBranchService.ensureBranchBelongsToCompany(
          targetUser.branchId,
          newCompanyId,
        );
        asAny.branchId = kept ?? null;
      } catch {
        asAny.branchId = null;
      }
    }

    const { role, ...updatePayload } = asAny;

    const updatedUser = await this.userModel
      .findOneAndUpdate({ id }, updatePayload, { new: true })
      .select('-password')
      .exec();

    return {
      message: 'Usuario actualizado exitosamente',
      user: updatedUser,
    };
  }
}
