import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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

  async findAll(paginationQuery: PaginationQueryDto) {
    const { page, limit, skip } = resolvePagination(paginationQuery);
    const filter = buildRegexOrFilter<Plan>(paginationQuery.search, ['name']);
    const [data, total] = await Promise.all([
      this.planModel.find(filter).skip(skip).limit(limit).exec(),
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
