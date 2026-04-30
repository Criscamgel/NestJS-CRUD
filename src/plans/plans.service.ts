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
import { buildRegexOrFilter } from 'src/common/utils/mongo-search';

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
        maxChecksPerMonth: dto.maxChecks,
        durationMonths: dto.durationMonths,
        monthlyPrice: dto.monthlyPrice,
        currency: dto.currency ?? 'COP',
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
    if (dto.maxChecks !== undefined) payload.maxChecksPerMonth = dto.maxChecks;
    if (dto.durationMonths !== undefined) payload.durationMonths = dto.durationMonths;
    if (dto.monthlyPrice !== undefined) payload.monthlyPrice = dto.monthlyPrice;
    if (dto.currency !== undefined) payload.currency = dto.currency;
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
    return {
      ...o,
      maxChecks: maxChecksPerMonth,
      isVisible,
    };
  }
}
