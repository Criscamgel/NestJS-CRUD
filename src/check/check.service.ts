import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateCheckDto } from './dto/create-check.dto';
import { UpdateCheckDto } from './dto/update-check.dto';
import { Model } from 'mongoose';
import { Check } from './entities/check.entity';
import { AxiosAdapter } from 'src/common/adapters/axios.adapter';
import { FootPrint } from './interfaces/footPrint.interface';
import { InjectModel } from '@nestjs/mongoose';
import { CounterId } from 'src/common/entities/counter-id.entity';
import { User } from 'src/users/entities/user.entity';
import { CompanyBranch } from 'src/company-branch/entities/company-branch.entity';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import {
  buildPaginationMeta,
  resolvePagination,
} from 'src/common/utils/pagination';
import { buildRegexOrFilter } from 'src/common/utils/mongo-search';
import { MembershipsService } from 'src/memberships/memberships.service';
import {
  buildRiskSealNewReportBody,
  phoneForRiskSeal,
  resolveRiskSealScoringUrl,
} from 'src/check/utils/riskseal-request.util';
import { trustScorePercentFromSnapshot } from 'src/check/utils/trust-score-from-snapshot.util';
import { applyCheckSensitiveMask } from 'src/check/utils/check-sensitive-data.util';

@Injectable()
export class CheckService {

  constructor(
    @InjectModel(Check.name)
    private readonly checkModel: Model<Check>,
    @InjectModel(CounterId.name)
    private readonly counterIdModel: Model<any>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    @InjectModel(CompanyBranch.name)
    private readonly companyBranchModel: Model<CompanyBranch>,
    private readonly http: AxiosAdapter,
    private readonly membershipsService: MembershipsService,
  ) {}

  private isSuperAdminActor(actor: User): boolean {
    const actorRoles = actor.roles || [];
    const actorLegacy = (actor as { role?: string }).role;
    return actorRoles.includes('superAdmin') || actorLegacy === 'superAdmin';
  }

  private isCompanyAdminActor(actor: User): boolean {
    const actorRoles = actor.roles || [];
    const actorLegacy = (actor as { role?: string }).role;
    const isAdmin =
      actorRoles.includes('admin') || actorLegacy === 'admin';
    return isAdmin && !this.isSuperAdminActor(actor);
  }

  private normalizeCompanyId(companyId: string | undefined | null): string {
    if (companyId == null) return '';
    return String(companyId).trim();
  }

  /** Usuarios de la empresa con rol operativo `user` (sin admin ni superAdmin). */
  private normalCheckOperatorsUserFilter(
    companyId: string,
  ): Record<string, unknown> {
    const cid = this.normalizeCompanyId(companyId);
    if (!cid) return { company: '__invalid_company__' };
    const companyPart = /^\d+$/.test(cid)
      ? { company: { $in: [cid, Number(cid)] } }
      : { company: cid };
    return {
      ...companyPart,
      isActive: { $ne: false },
      $nor: [
        { roles: 'admin' },
        { roles: 'superAdmin' },
        { roles: { $in: ['admin', 'superAdmin'] } },
      ],
      $or: [{ roles: { $in: ['user'] } }, { role: 'user' }],
    };
  }

  private maskCheckRecord<T extends Record<string, unknown>>(check: T) {
    return applyCheckSensitiveMask({
      ...check,
      email: typeof check.email === 'string' ? check.email : undefined,
      documentNumber:
        typeof check.documentNumber === 'string'
          ? check.documentNumber
          : undefined,
      createdAt: check.createdAt as Date | string | undefined,
    });
  }

  private buildSearchFilter(
    paginationQuery: PaginationQueryDto,
  ): Record<string, unknown> {
    return buildRegexOrFilter<Check>(paginationQuery.search, [
      'name',
      'lastName',
      'email',
      'mobile',
      'documentNumber',
    ]);
  }

  /** Filtro por empresa en documentos de check (string / número legacy). */
  private companyIdOnCheckFilter(companyId: string): Record<string, unknown> {
    const cid = this.normalizeCompanyId(companyId);
    if (!cid) return { companyId: '__invalid_company__' };
    if (/^\d+$/.test(cid)) {
      return { companyId: { $in: [cid, Number(cid)] } };
    }
    return { companyId: cid };
  }

  /** Miembros de la empresa (incluye inactivos) para checks legacy sin `companyId`. */
  private companyMembersUserFilter(
    companyId: string,
  ): Record<string, unknown> {
    const cid = this.normalizeCompanyId(companyId);
    if (!cid) return { company: '__invalid_company__' };
    const companyPart = /^\d+$/.test(cid)
      ? { company: { $in: [cid, Number(cid)] } }
      : { company: cid };
    return {
      ...companyPart,
      $nor: [
        { roles: 'superAdmin' },
        { roles: { $in: ['superAdmin'] } },
      ],
    };
  }

  private async enrichChecksForCompanyAdminList(
    checks: Array<Record<string, unknown>>,
  ): Promise<Array<Record<string, unknown>>> {
    if (checks.length === 0) return checks;

    const creatorIds = [
      ...new Set(
        checks
          .map((c) =>
            c.createdByUserId != null ? String(c.createdByUserId) : '',
          )
          .filter(Boolean),
      ),
    ];
    if (creatorIds.length === 0) {
      return checks.map((c) => ({ ...c, authorEmail: null, branchName: null }));
    }

    const users = await this.userModel
      .find({ id: { $in: creatorIds } })
      .select('id email branchId')
      .lean()
      .exec();
    const userById = new Map(
      users.map((u) => [String((u as { id?: string }).id), u]),
    );

    const branchIds = [
      ...new Set(
        users
          .map((u) =>
            (u as { branchId?: string }).branchId != null
              ? String((u as { branchId?: string }).branchId)
              : '',
          )
          .filter(Boolean),
      ),
    ];
    const branchById = new Map<string, string>();
    if (branchIds.length > 0) {
      const branches = await this.companyBranchModel
        .find({ id: { $in: branchIds } })
        .select('id name')
        .lean()
        .exec();
      for (const b of branches) {
        const id = String((b as { id?: string }).id);
        const name = String((b as { name?: string }).name ?? '').trim();
        if (id && name) branchById.set(id, name);
      }
    }

    return checks.map((c) => {
      const creator = userById.get(String(c.createdByUserId ?? ''));
      const bid =
        creator && (creator as { branchId?: string }).branchId != null
          ? String((creator as { branchId?: string }).branchId)
          : '';
      const branchName = bid ? branchById.get(bid) ?? null : null;
      return {
        ...c,
        authorEmail: (creator as { email?: string })?.email ?? null,
        branchName,
      };
    });
  }

  private assertCanAccessCheck(
    check: (Check & {
      createdByUserId?: string;
      companyId?: string;
    }) | null,
    actor: User,
  ): Check & { createdByUserId?: string; companyId?: string } {
    if (!check) {
      throw new NotFoundException('Check no encontrado.');
    }
    if (this.isSuperAdminActor(actor)) {
      return check;
    }
    if (this.isCompanyAdminActor(actor) && actor.company) {
      const cid = check.companyId != null ? String(check.companyId) : '';
      if (cid && cid === String(actor.company)) {
        return check;
      }
    }
    const ownerId = check.createdByUserId;
    if (!ownerId) {
      throw new ForbiddenException('No tienes permiso para acceder a este check.');
    }
    if (ownerId !== actor.id) {
      throw new ForbiddenException('No tienes permiso para acceder a este check.');
    }
    return check;
  }

  async create(createCheckDto: CreateCheckDto, actor: User) {
      const isSuperAdmin = this.isSuperAdminActor(actor);

      if (!isSuperAdmin) {
        if (!actor.company) {
          throw new BadRequestException(
            'Tu usuario debe estar asociado a una compañía para crear checks.',
          );
        }
        await this.membershipsService.syncMonthForCompany(actor.company);
        await this.membershipsService.assertCheckLimits(actor.company);
      }

      try {
        if (!process.env.KEY_RISKSEAL?.trim()) {
          throw new BadRequestException(
            'Falta configurar KEY_RISKSEAL para consultar RiskSeal.',
          );
        }

        /**
         * RiskSeal `POST …/credit-scoring/v2`: únicamente `first_name`, `last_name`,
         * `email`, `phone` (E.164). Si el JSON incluye `id`, el proveedor asume
         * actualización de informe y responde "Original report not found".
         */
        const riskSealUrl = resolveRiskSealScoringUrl();
        const riskSealBody = buildRiskSealNewReportBody({
          firstName: createCheckDto.name,
          lastName: createCheckDto.lastName,
          email: createCheckDto.email,
          phone: phoneForRiskSeal(createCheckDto.mobile),
        });

        const data = await this.http.post<FootPrint>(riskSealUrl, riskSealBody, {
          headers: {
            'X-API-KEY': process.env.KEY_RISKSEAL!,
            'Content-Type': 'application/json',
          },
        });

        const counter = await this.counterIdModel.findByIdAndUpdate(
          'checks',
          { $inc: { seq: 1 } },
          { new: true, upsert: true },
        );
        const publicId = counter.seq.toString();

        const snapshot =
          typeof data === 'object' && data !== null
            ? (JSON.parse(JSON.stringify(data)) as Record<string, unknown>)
            : {};

        const check = await this.checkModel.create({
          id: publicId,
          name: createCheckDto.name.trim(),
          lastName: createCheckDto.lastName.trim(),
          email: createCheckDto.email.trim().toLowerCase(),
          mobile: createCheckDto.mobile.trim(),
          documentNumber: createCheckDto.documentNumber.trim(),
          createdByUserId: actor.id,
          companyId:
            !isSuperAdmin && actor.company
              ? String(actor.company)
              : undefined,
          riskSealResponse: snapshot,
          trustScore: trustScorePercentFromSnapshot(snapshot),
        });

        let checksQuotaExhausted = false;
        if (!isSuperAdmin && actor.company) {
          try {
            const usage = await this.membershipsService.incrementCheckUsage(
              actor.company,
            );
            checksQuotaExhausted = usage.checksQuotaExhausted;
          } catch (quotaErr) {
            await this.checkModel.deleteOne({ _id: check._id });
            throw quotaErr;
          }
        }

        return {
          message: 'Check creado exitosamente',
          data: { check, data, checksQuotaExhausted },
        };

      } catch (error) {
        if (error instanceof HttpException) {
          throw error;
        }
        const raw =
          error instanceof Error ? error.message : typeof error === 'string' ? error : '';
        const msg = raw.startsWith('Error: ') ? raw.slice(7) : raw;
        throw new BadRequestException(
          msg ? `Error en RiskSeal: ${msg}` : 'Error al consultar RiskSeal.',
        );
      }
  }

  async findAll(paginationQuery: PaginationQueryDto, actor: User) {
    const { page, limit, skip } = resolvePagination(paginationQuery);
    const searchFilter = this.buildSearchFilter(paginationQuery);

    let filter: Record<string, unknown>;

    if (this.isSuperAdminActor(actor)) {
      filter = Object.keys(searchFilter).length ? searchFilter : {};
    } else if (this.isCompanyAdminActor(actor) && actor.company) {
      const cid = this.normalizeCompanyId(actor.company);
      const byCompany = this.companyIdOnCheckFilter(cid);
      const members = await this.userModel
        .find(this.companyMembersUserFilter(cid))
        .select('id')
        .lean()
        .exec();
      const memberIds = members
        .map((u) => String((u as { id?: string }).id))
        .filter(Boolean);
      const legacyScope =
        memberIds.length > 0
          ? {
              companyId: { $exists: false },
              createdByUserId: { $in: memberIds },
            }
          : null;
      const companyScope = legacyScope
        ? { $or: [byCompany, legacyScope] }
        : byCompany;
      filter = Object.keys(searchFilter).length
        ? { $and: [companyScope, searchFilter] }
        : companyScope;
    } else {
      const scope = { createdByUserId: actor.id };
      filter = Object.keys(searchFilter).length
        ? { $and: [scope, searchFilter] }
        : scope;
    }

    const [rawData, total] = await Promise.all([
      this.checkModel
        .find(filter)
        .select('-riskSealResponse')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.checkModel.countDocuments(filter),
    ]);

    const listed =
      this.isCompanyAdminActor(actor) && actor.company
        ? await this.enrichChecksForCompanyAdminList(
            rawData as unknown as Array<Record<string, unknown>>,
          )
        : rawData;

    const data = (listed as Array<Record<string, unknown>>).map((item) =>
      this.maskCheckRecord(item),
    );

    return {
      data,
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  async findOneByPublicId(checkId: string, actor: User) {
    const doc = await this.checkModel.findOne({ id: checkId }).lean().exec();
    this.assertCanAccessCheck(doc as Check | null, actor);
    return {
      message: 'Check obtenido',
      data: this.maskCheckRecord(doc as unknown as Record<string, unknown>),
    };
  }

  update(checkId: string, updateCheckDto: UpdateCheckDto) {
    return `This action updates a #${checkId} check`;
  }

  remove(checkId: string) {
    return `This action removes a #${checkId} check`;
  }

  private handleExceptions( error: any ) {
  
      if( error.code === 11000 ) throw new BadRequestException(`Pokemon already exist in db ${ JSON.stringify( error.keyValue ) }`);
        console.log(error);
        throw new InternalServerErrorException(`Can't create Pokemon - Check Server logs`);
  
    }
}
