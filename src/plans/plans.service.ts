import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MembershipsService } from 'src/memberships/memberships.service';
import { User } from 'src/users/entities/user.entity';
import { Plan } from './entities/plan.entity';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { CounterId } from 'src/common/entities/counter-id.entity';
import { isMongoDuplicateKeyError } from 'src/common/utils/mongo-errors';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import {
  buildPaginationMeta,
  resolvePagination,
} from 'src/common/utils/pagination';
import {
  buildRegexOrFilter,
  escapeRegex,
} from 'src/common/utils/mongo-search';
import { resolvePlanCurrencyCode } from 'src/common/catalog/plan-currencies.catalog';

@Injectable()
export class PlansService {
  constructor(
    @InjectModel(Plan.name)
    private readonly planModel: Model<Plan>,
    @InjectModel(CounterId.name)
    private readonly counterIdModel: Model<CounterId>,
    @Inject(forwardRef(() => MembershipsService))
    private readonly membershipsService: MembershipsService,
  ) {}

  async create(dto: CreatePlanDto) {
    try {
      const counter = await this.counterIdModel.findByIdAndUpdate(
        'plans',
        { $inc: { seq: 1 } },
        { new: true, upsert: true },
      );
      const plan = await this.planModel.create({
        id: counter.seq.toString(),
        name: dto.name,
        maxUsers: dto.maxUsers,
        maxBranches: dto.maxBranches ?? 0,
        maxChecksPerMonth: dto.maxChecks,
        durationMonths: dto.durationMonths,
        monthlyPrice: dto.monthlyPrice,
        currency: resolvePlanCurrencyCode(dto.currency),
        isVisible: dto.isVisible ?? true,
      });
      return {
        message: 'Plan creado exitosamente',
        plan: this.toPublicPlan(plan),
      };
    } catch (error: unknown) {
      if (isMongoDuplicateKeyError(error)) {
        throw new BadRequestException('Ya existe un plan con ese nombre.');
      }
      throw new BadRequestException('Error al crear el plan');
    }
  }

  async findAll(paginationQuery: PaginationQueryDto, requester?: User) {
    const { page, limit, skip } = resolvePagination(paginationQuery);
    const searchFilter = buildRegexOrFilter<Plan>(paginationQuery.search, [
      'name',
    ]);

    const requesterRoles = requester?.roles || [];
    const requesterLegacy = (requester as { role?: string } | undefined)?.role;
    const isSuperAdmin =
      requesterRoles.includes('superAdmin') ||
      requesterLegacy === 'superAdmin';

    const clauses: Record<string, unknown>[] = [];

    if (Object.keys(searchFilter).length > 0) {
      clauses.push(searchFilter);
    }

    /** Admin de empresa: catálogo = visibles, activos, sin el plan de una membresía vigente. */
    if (requester && !isSuperAdmin) {
      const catalogClause: Record<string, unknown> = {
        isVisible: true,
        isActive: true,
      };

      const companyId = requester.company?.trim();
      if (companyId) {
        const excludePlanIds =
          await this.membershipsService.getActivePlanIdsExcludedFromCatalog(
            companyId,
          );
        if (excludePlanIds.length > 0) {
          catalogClause['id'] = { $nin: excludePlanIds };
        }
      }

      clauses.push(catalogClause);
    }

    let filter: Record<string, unknown>;
    if (clauses.length === 0) {
      filter = {};
    } else if (clauses.length === 1) {
      filter = clauses[0]!;
    } else {
      filter = { $and: clauses };
    }

    const [data, total] = await Promise.all([
      this.planModel.find(filter).skip(skip).limit(limit).exec(),
      this.planModel.countDocuments(filter),
    ]);
    return {
      data: data.map((p) => this.toPublicPlan(p)),
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  /**
   * Catálogo para la landing y otros clientes públicos: planes activos y visibles en catálogo.
   * Sin autenticación; no aplica exclusión por membresía vigente (eso solo aplica a admins logueados).
   */
  /** Coincidencia exacta por nombre (insensible a mayúsculas). */
  private buildExactNameFilter(name: string): Record<string, unknown> {
    const pattern = `^${escapeRegex(name.trim())}$`;
    return { name: { $regex: pattern, $options: 'i' } };
  }

  /**
   * Plan por nombre para la landing (tarjeta «Plan a tu medida»).
   * Incluye planes ocultos del catálogo (`isVisible: false`); excluye inactivos.
   */
  async findPublicByName(name: string) {
    const filter = {
      $and: [this.buildExactNameFilter(name), { isActive: true }],
    };
    const plan = await this.planModel.findOne(filter).exec();
    if (!plan) {
      throw new NotFoundException('Plan no encontrado');
    }
    return this.toPublicPlan(plan);
  }

  /**
   * Plan por nombre para zona privada (tarjeta «Plan a tu medida»).
   * Incluye planes ocultos del catálogo; excluye inactivos y el plan de membresía vigente (admin empresa).
   */
  async findCatalogByName(name: string, requester: User) {
    const requesterRoles = requester?.roles || [];
    const requesterLegacy = (requester as { role?: string } | undefined)?.role;
    const isSuperAdmin =
      requesterRoles.includes('superAdmin') ||
      requesterLegacy === 'superAdmin';

    const clauses: Record<string, unknown>[] = [
      this.buildExactNameFilter(name),
      { isActive: true },
    ];

    if (!isSuperAdmin) {
      const searchClause: Record<string, unknown> = {};
      const companyId = requester.company?.trim();
      if (companyId) {
        const excludePlanIds =
          await this.membershipsService.getActivePlanIdsExcludedFromCatalog(
            companyId,
          );
        if (excludePlanIds.length > 0) {
          searchClause['id'] = { $nin: excludePlanIds };
        }
      }
      if (Object.keys(searchClause).length > 0) {
        clauses.push(searchClause);
      }
    }

    const filter = { $and: clauses };

    const plan = await this.planModel.findOne(filter).exec();
    if (!plan) {
      throw new NotFoundException('Plan no encontrado');
    }
    return this.toPublicPlan(plan);
  }

  async findPublicCatalog(paginationQuery: PaginationQueryDto) {
    const { page, limit, skip } = resolvePagination(paginationQuery);
    const searchFilter = buildRegexOrFilter<Plan>(paginationQuery.search, [
      'name',
    ]);
    const catalogClause: Record<string, unknown> = {
      isVisible: true,
      isActive: true,
    };
    const filter =
      Object.keys(searchFilter).length > 0
        ? { $and: [catalogClause, searchFilter] }
        : catalogClause;

    const [data, total] = await Promise.all([
      this.planModel
        .find(filter)
        .sort({ monthlyPrice: 1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.planModel.countDocuments(filter),
    ]);
    return {
      data: data.map((p) => this.toPublicPlan(p)),
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  async findOne(id: string) {
    const plan = await this.planModel.findOne({ id }).exec();
    if (!plan) {
      throw new NotFoundException(`Plan con id ${id} no encontrado`);
    }
    return this.toPublicPlan(plan);
  }

  async update(id: string, dto: UpdatePlanDto) {
    const plan = await this.planModel.findOne({ id });
    if (!plan) {
      throw new NotFoundException(`Plan con id ${id} no encontrado`);
    }
    const payload: Record<string, unknown> = {};
    if (dto.name !== undefined) payload.name = dto.name;
    if (dto.maxUsers !== undefined) payload.maxUsers = dto.maxUsers;
    if (dto.maxBranches !== undefined) payload.maxBranches = dto.maxBranches;
    if (dto.maxChecks !== undefined) payload.maxChecksPerMonth = dto.maxChecks;
    if (dto.durationMonths !== undefined) payload.durationMonths = dto.durationMonths;
    if (dto.monthlyPrice !== undefined) payload.monthlyPrice = dto.monthlyPrice;
    if (dto.currency !== undefined) {
      payload.currency = resolvePlanCurrencyCode(dto.currency);
    }
    if (dto.isVisible !== undefined) payload.isVisible = dto.isVisible;

    try {
      const updated = await this.planModel
        .findOneAndUpdate({ id }, payload, { new: true })
        .exec();
      if (updated) {
        await this.membershipsService.syncActiveMembershipSnapshotsFromPlan(
          updated,
        );
      }
      return { message: 'Plan actualizado exitosamente', plan: this.toPublicPlan(updated!) };
    } catch (error: unknown) {
      if (isMongoDuplicateKeyError(error)) {
        throw new BadRequestException('Ya existe un plan con ese nombre.');
      }
      throw new BadRequestException('Error al actualizar el plan');
    }
  }

  async toggleStatus(id: string) {
    const plan = await this.planModel.findOne({ id });
    if (!plan) {
      throw new NotFoundException(`Plan con id ${id} no encontrado`);
    }
    plan.isActive = !plan.isActive;
    await plan.save();
    return {
      message: `Plan ${plan.isActive ? 'activado' : 'desactivado'} exitosamente`,
      plan: this.toPublicPlan(plan),
    };
  }

  async toggleVisibility(id: string) {
    const plan = await this.planModel.findOne({ id });
    if (!plan) {
      throw new NotFoundException(`Plan con id ${id} no encontrado`);
    }
    plan.isVisible = !plan.isVisible;
    await plan.save();
    return {
      message: `Plan ${plan.isVisible ? 'visible en el catálogo' : 'oculto del catálogo'}`,
      plan: this.toPublicPlan(plan),
    };
  }

  /** Plan interno para membresías (sin transformar). */
  async findOneById(id: string): Promise<Plan | null> {
    return this.planModel.findOne({ id }).exec();
  }

  private toPublicPlan(plan: Plan) {
    const o = { ...(plan.toObject() as Record<string, unknown>) };
    const maxChecksPerMonth = o.maxChecksPerMonth;
    delete o.maxChecksPerMonth;
    const isVisible =
      o.isVisible === undefined ? true : Boolean(o.isVisible);
    const maxBranchesRaw = o.maxBranches;
    const maxBranches =
      maxBranchesRaw !== undefined && maxBranchesRaw !== null
        ? Number(maxBranchesRaw)
        : 0;
    const idRaw = o.id;
    const id =
      idRaw !== undefined && idRaw !== null && String(idRaw).trim()
        ? String(idRaw).trim()
        : '';
    return {
      ...o,
      id,
      maxBranches,
      maxChecks: maxChecksPerMonth,
      isVisible,
      currency: resolvePlanCurrencyCode(o.currency as string | undefined),
    };
  }

  /** Estadísticas agregadas para el módulo de planes (solo superAdmin). */
  async getAdminDashboardStats() {
    const [totalPlans, activeMemberships, newMembershipsThisMonth] =
      await Promise.all([
        this.planModel.countDocuments(),
        this.membershipsService.countGloballyActiveMemberships(),
        this.membershipsService.countMembershipsCreatedInCurrentMonth(),
      ]);

    return {
      success: true,
      data: {
        totalPlans,
        activeMemberships,
        newMembershipsThisMonth,
      },
    };
  }
}
