import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Membership } from './entities/membership.entity';
import { MembershipStatus } from './membership-status.enum';
import { CreateMembershipDto } from './dto/create-membership.dto';
import { CounterId } from 'src/common/entities/counter-id.entity';
import { Company } from 'src/company/entities/company.entity';
import { User } from 'src/users/entities/user.entity';
import { PlansService } from 'src/plans/plans.service';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import {
  buildPaginationMeta,
  resolvePagination,
} from 'src/common/utils/pagination';
import { buildRegexOrFilter } from 'src/common/utils/mongo-search';

function monthKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}

@Injectable()
export class MembershipsService {
  constructor(
    @InjectModel(Membership.name)
    private readonly membershipModel: Model<Membership>,
    @InjectModel(Company.name)
    private readonly companyModel: Model<Company>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    @InjectModel(CounterId.name)
    private readonly counterIdModel: Model<CounterId>,
    private readonly plansService: PlansService,
  ) {}

  async create(dto: CreateMembershipDto, actor: User) {
    const company = await this.companyModel.findOne({ id: dto.companyId }).exec();
    if (!company) {
      throw new NotFoundException(`Compañía con id ${dto.companyId} no encontrada`);
    }

    const plan = await this.plansService.findOneById(dto.planId);
    if (!plan) {
      throw new NotFoundException(`Plan con id ${dto.planId} no encontrado`);
    }
    if (!plan.isActive) {
      throw new BadRequestException('El plan no está activo');
    }

    const actorRoles = actor.roles || [];
    const actorLegacy = (actor as { role?: string }).role;
    const isSuperAdmin =
      actorRoles.includes('superAdmin') || actorLegacy === 'superAdmin';
    const isCompanyAdmin =
      (actorRoles.includes('admin') || actorLegacy === 'admin') &&
      !isSuperAdmin;

    if (isCompanyAdmin) {
      const actorCompany = actor.company?.trim();
      if (!actorCompany || actorCompany !== String(dto.companyId).trim()) {
        throw new ForbiddenException(
          'Solo puedes contratar planes para tu propia empresa',
        );
      }
      if (plan.isVisible === false) {
        throw new ForbiddenException(
          'Este plan no está disponible en el catálogo',
        );
      }
    }

    const maxChecksForPeriodSnapshot = plan.maxChecksPerMonth * plan.durationMonths;
    if (maxChecksForPeriodSnapshot < 1) {
      throw new BadRequestException('Configuración de plan inválida');
    }

    const startedAt = new Date();
    const expiresAt = addMonths(startedAt, plan.durationMonths);
    const mk = monthKey(startedAt);

    await this.membershipModel.updateMany(
      {
        companyId: dto.companyId,
        status: MembershipStatus.ACTIVE,
      },
      {
        $set: {
          status: MembershipStatus.CANCELLED,
          deactivatedAt: new Date(),
          deactivatedBy: actor.id,
          deactivationReason: 'replaced_by_new_membership',
        },
      },
    );

    const counter = await this.counterIdModel.findByIdAndUpdate(
      'memberships',
      { $inc: { seq: 1 } },
      { new: true, upsert: true },
    );

    const membership = await this.membershipModel.create({
      id: counter.seq.toString(),
      companyId: dto.companyId,
      planId: plan.id,
      status: MembershipStatus.ACTIVE,
      startedAt,
      expiresAt,
      durationMonthsSnapshot: plan.durationMonths,
      maxUsersSnapshot: plan.maxUsers,
      maxChecksPerMonthSnapshot: plan.maxChecksPerMonth,
      maxChecksForPeriodSnapshot,
      checksUsedInCurrentMonth: 0,
      currentMonthKey: mk,
      checksUsedInPeriod: 0,
    });

    return {
      message: 'Membresía creada exitosamente',
      membership,
    };
  }

  async findAll(paginationQuery: PaginationQueryDto) {
    const { page, limit, skip } = resolvePagination(paginationQuery);
    const filter = buildRegexOrFilter<Membership>(paginationQuery.search, [
      'companyId',
      'planId',
      'id',
    ]);
    const [data, total] = await Promise.all([
      this.membershipModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.membershipModel.countDocuments(filter),
    ]);
    return {
      data,
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  async findOne(id: string) {
    const m = await this.membershipModel.findOne({ id }).exec();
    if (!m) {
      throw new NotFoundException(`Membresía con id ${id} no encontrada`);
    }
    return m;
  }

  /**
   * Valida cupo de usuarios normales (rol `user`) contra la membresía activa.
   * No aplica a admins ni superAdmins.
   */
  async assertCanAddNormalUser(companyId: string): Promise<void> {
    const m = await this.getActiveMembershipForCompany(companyId);
    if (!m) {
      throw new ForbiddenException(
        'La compañía no tiene una membresía activa. Contrata un plan para crear usuarios.',
      );
    }
    await this.lazyExpireIfNeeded(m);

    const fresh = await this.membershipModel.findById(m._id).exec();
    if (!fresh || fresh.status !== MembershipStatus.ACTIVE) {
      throw new ForbiddenException(
        'La membresía de la compañía no está activa. No se pueden crear más usuarios.',
      );
    }

    const count = await this.userModel.countDocuments({
      company: companyId,
      roles: 'user',
    });

    if (count >= fresh.maxUsersSnapshot) {
      throw new ForbiddenException(
        'Se alcanzó el límite de usuarios del plan (solo cuentan usuarios normales, no administradores).',
      );
    }
  }

  /** Alinea el contador mensual si cambió el mes calendario. */
  async syncMonthForCompany(companyId: string): Promise<void> {
    const m = await this.getActiveMembershipForCompany(companyId);
    if (!m) {
      return;
    }
    await this.lazyExpireIfNeeded(m);
    const fresh = await this.membershipModel.findById(m._id).exec();
    if (!fresh || fresh.status !== MembershipStatus.ACTIVE) {
      return;
    }
    const mk = monthKey();
    if (fresh.currentMonthKey === mk) {
      return;
    }
    await this.membershipModel.updateOne(
      { _id: fresh._id },
      { $set: { currentMonthKey: mk, checksUsedInCurrentMonth: 0 } },
    );
  }

  /**
   * Comprueba límites (mes y periodo) sin incrementar. Llamar antes de la API externa.
   * Gana el límite que se agote primero (mensual o del periodo completo).
   */
  async assertCheckLimits(companyId: string): Promise<void> {
    let m = await this.getActiveMembershipForCompany(companyId);
    if (!m) {
      throw new ForbiddenException(
        'La compañía no tiene una membresía activa para registrar checks.',
      );
    }
    await this.lazyExpireIfNeeded(m);
    m = await this.membershipModel.findById(m._id).exec();
    if (!m || m.status !== MembershipStatus.ACTIVE) {
      throw new ForbiddenException('La membresía no está activa.');
    }

    if (m.checksUsedInCurrentMonth >= m.maxChecksPerMonthSnapshot) {
      throw new ForbiddenException(
        'Se alcanzó el límite mensual de checks del plan.',
      );
    }
    if (m.checksUsedInPeriod >= m.maxChecksForPeriodSnapshot) {
      throw new ForbiddenException(
        'Se alcanzó el límite de checks del periodo de membresía.',
      );
    }
  }

  /** Incremento atómico tras persistir el check. */
  async incrementCheckUsage(companyId: string): Promise<void> {
    const m = await this.membershipModel
      .findOne({
        companyId,
        status: MembershipStatus.ACTIVE,
      })
      .exec();
    if (!m) {
      throw new ForbiddenException('Membresía no disponible.');
    }

    const result = await this.membershipModel.updateOne(
      {
        _id: m._id,
        status: MembershipStatus.ACTIVE,
        checksUsedInCurrentMonth: { $lt: m.maxChecksPerMonthSnapshot },
        checksUsedInPeriod: { $lt: m.maxChecksForPeriodSnapshot },
      },
      { $inc: { checksUsedInCurrentMonth: 1, checksUsedInPeriod: 1 } },
    );

    if (result.modifiedCount === 0) {
      throw new ForbiddenException(
        'No se pudo registrar el consumo de checks: límite del plan alcanzado.',
      );
    }
  }

  async suspend(id: string, actorId: string, reason?: string) {
    const m = await this.membershipModel.findOne({ id }).exec();
    if (!m) {
      throw new NotFoundException(`Membresía con id ${id} no encontrada`);
    }
    if (m.status !== MembershipStatus.ACTIVE) {
      throw new BadRequestException('Solo se pueden suspender membresías activas');
    }
    m.status = MembershipStatus.SUSPENDED;
    m.deactivatedAt = new Date();
    m.deactivatedBy = actorId;
    m.deactivationReason = reason ?? 'manual_super_admin';
    await m.save();
    return { message: 'Membresía suspendida exitosamente' };
  }

  async getActiveMembershipForCompany(
    companyId: string,
  ): Promise<Membership | null> {
    return this.membershipModel
      .findOne({
        companyId,
        status: MembershipStatus.ACTIVE,
      })
      .exec();
  }

  private async lazyExpireIfNeeded(m: Membership): Promise<void> {
    if (m.status !== MembershipStatus.ACTIVE) {
      return;
    }
    if (m.expiresAt > new Date()) {
      return;
    }
    await this.membershipModel.updateOne(
      { _id: m._id },
      {
        $set: {
          status: MembershipStatus.EXPIRED,
          deactivationReason: 'expired',
          deactivatedAt: new Date(),
        },
      },
    );
  }

  /**
   * Resumen para dashboard del administrador de empresa (membresía activa y uso de checks).
   */
  async getDashboardSummaryForCompany(companyId: string) {
    let m = await this.getActiveMembershipForCompany(companyId);
    if (m) {
      await this.lazyExpireIfNeeded(m);
    }
    m = await this.getActiveMembershipForCompany(companyId);

    if (
      !m ||
      m.status !== MembershipStatus.ACTIVE ||
      m.expiresAt <= new Date()
    ) {
      return {
        hasActiveMembership: false,
        planName: null as string | null,
        daysUntilExpiry: null as number | null,
        checksUsedInPeriod: 0,
        checksPendingMonthly: null as number | null,
      };
    }

    const planDoc = await this.plansService.findOneById(m.planId);
    const planName =
      planDoc?.name?.trim() || `Plan ${m.planId}`;

    const now = new Date();
    const msPerDay = 86_400_000;
    const daysUntilExpiry = Math.max(
      0,
      Math.ceil(
        (new Date(m.expiresAt).getTime() - now.getTime()) / msPerDay,
      ),
    );

    const checksPendingMonthly = Math.max(
      0,
      (m.maxChecksPerMonthSnapshot ?? 0) -
        (m.checksUsedInCurrentMonth ?? 0),
    );

    return {
      hasActiveMembership: true,
      planName,
      daysUntilExpiry,
      checksUsedInPeriod: m.checksUsedInPeriod ?? 0,
      checksPendingMonthly,
    };
  }
}
