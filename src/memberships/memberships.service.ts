import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Membership } from './entities/membership.entity';
import { MembershipStatus } from './membership-status.enum';
import { CreateMembershipDto } from './dto/create-membership.dto';
import { CounterId } from 'src/common/entities/counter-id.entity';
import { Company } from 'src/company/entities/company.entity';
import { User } from 'src/users/entities/user.entity';
import { Plan } from 'src/plans/entities/plan.entity';
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

type MembershipPlanSnapshotSet = {
  maxUsersSnapshot: number;
  maxChecksPerMonthSnapshot: number;
  durationMonthsSnapshot: number;
  maxChecksForPeriodSnapshot: number;
};

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
    @Inject(forwardRef(() => PlansService))
    private readonly plansService: PlansService,
  ) {}

  private normalizeCompanyId(companyId: string | undefined | null): string {
    if (companyId == null) return '';
    return String(companyId).trim();
  }

  /** Coincide `companyId` en membresías guardado como string o número (legacy). */
  private companyIdFilter(companyId: string): Record<string, unknown> {
    const cid = this.normalizeCompanyId(companyId);
    if (!cid) return { companyId: '__invalid_company__' };
    if (/^\d+$/.test(cid)) {
      return { companyId: { $in: [cid, Number(cid)] } };
    }
    return { companyId: cid };
  }

  /** Misma lógica para el campo `company` en usuarios. */
  private userCompanyFilter(companyId: string): Record<string, unknown> {
    const cid = this.normalizeCompanyId(companyId);
    if (!cid) return { company: '__invalid_company__' };
    if (/^\d+$/.test(cid)) {
      return { company: { $in: [cid, Number(cid)] } };
    }
    return { company: cid };
  }

  /** Coincide `planId` en membresías (string / número legacy). */
  private planIdFilter(planId: string): Record<string, unknown> {
    const pid = String(planId ?? '').trim();
    if (!pid) return { planId: '__invalid_plan__' };
    if (/^\d+$/.test(pid)) {
      return { planId: { $in: [pid, Number(pid)] } };
    }
    return { planId: pid };
  }

  /** Snapshots de membresía alineados con la definición actual del plan en catálogo. */
  private snapshotSetFromPlan(plan: Plan): MembershipPlanSnapshotSet | null {
    const maxPeriod = plan.maxChecksPerMonth * plan.durationMonths;
    if (maxPeriod < 1) return null;
    return {
      maxUsersSnapshot: plan.maxUsers,
      maxChecksPerMonthSnapshot: plan.maxChecksPerMonth,
      durationMonthsSnapshot: plan.durationMonths,
      maxChecksForPeriodSnapshot: maxPeriod,
    };
  }

  private snapshotsMatchPlan(
    m: Membership,
    snap: MembershipPlanSnapshotSet,
  ): boolean {
    return (
      m.maxUsersSnapshot === snap.maxUsersSnapshot &&
      m.maxChecksPerMonthSnapshot === snap.maxChecksPerMonthSnapshot &&
      m.durationMonthsSnapshot === snap.durationMonthsSnapshot &&
      m.maxChecksForPeriodSnapshot === snap.maxChecksForPeriodSnapshot
    );
  }

  /**
   * Si el plan en catálogo cambió después de contratar: persiste snapshots
   * actualizados para esta membresía (dashboard + límites de checks).
   */
  private async reconcileMembershipSnapshotsWithPlanIfNeeded(
    m: Membership,
    plan: Plan,
  ): Promise<Membership> {
    const snap = this.snapshotSetFromPlan(plan);
    if (!snap || this.snapshotsMatchPlan(m, snap)) {
      return m;
    }
    await this.membershipModel.updateOne({ _id: m._id }, { $set: snap });
    const fresh = await this.membershipModel.findById(m._id).exec();
    await this.deactivateNormalUsersWhenCheckAccessBlocked(
      String(m.companyId),
    );
    return fresh ?? m;
  }

  /**
   * Tras editar un plan: actualiza snapshots en membresías ACTIVE no vencidas
   * que usan ese plan, para que estadísticas y límites coincidan con el catálogo.
   */
  async syncActiveMembershipSnapshotsFromPlan(plan: Plan): Promise<void> {
    const pid = String(plan.id).trim();
    if (!pid) return;
    const snap = this.snapshotSetFromPlan(plan);
    if (!snap) return;
    const now = new Date();

    const activeList = await this.membershipModel
      .find({
        ...this.planIdFilter(pid),
        status: MembershipStatus.ACTIVE,
        expiresAt: { $gt: now },
      })
      .select('companyId')
      .lean();

    await this.membershipModel.updateMany(
      {
        ...this.planIdFilter(pid),
        status: MembershipStatus.ACTIVE,
        expiresAt: { $gt: now },
      },
      { $set: snap },
    );

    const companyIds = new Set(
      activeList.map((d) => String(d.companyId)),
    );
    for (const cid of companyIds) {
      await this.deactivateNormalUsersWhenCheckAccessBlocked(cid);
    }
  }

  /** Usuarios de empresa con rol `user` (los que pueden registrar checks). */
  private normalUserRoleFilter(): Record<string, unknown> {
    return {
      $or: [{ roles: { $in: ['user'] } }, { role: 'user' }],
    };
  }

  /** Usuarios de empresa con rol `user` (los que pueden registrar checks). */
  private normalCheckUserFilter(companyId: string): Record<string, unknown> {
    return {
      ...this.userCompanyFilter(companyId),
      ...this.normalUserRoleFilter(),
    };
  }

  /**
   * Desactiva usuarios `user` si no hay membresía vigente o ya no quedan checks del periodo.
   * No altera admins; no considera el tope mensual (se renueva cada mes).
   */
  private async deactivateNormalUsersWhenCheckAccessBlocked(
    companyId: string,
  ): Promise<void> {
    const cid = this.normalizeCompanyId(companyId);
    if (!cid) return;
    const now = new Date();
    const m = await this.membershipModel
      .findOne({
        ...this.companyIdFilter(cid),
        status: MembershipStatus.ACTIVE,
        expiresAt: { $gt: now },
      })
      .sort({ createdAt: -1 })
      .lean();

    const maxPeriod = m?.maxChecksForPeriodSnapshot ?? 0;
    const usedPeriod = m?.checksUsedInPeriod ?? 0;
    const periodExhausted = m != null && usedPeriod >= maxPeriod && maxPeriod > 0;
    const blocked = m == null || periodExhausted;

    if (!blocked) {
      return;
    }

    await this.userModel.updateMany(this.normalCheckUserFilter(cid), {
      $set: { isActive: false },
    });
  }

  private async reactivateNormalUsersForCompany(companyId: string): Promise<void> {
    const cid = this.normalizeCompanyId(companyId);
    if (!cid) return;
    await this.userModel.updateMany(this.normalCheckUserFilter(cid), {
      $set: { isActive: true },
    });
  }

  async create(dto: CreateMembershipDto, actor: User) {
    const companyIdNorm = this.normalizeCompanyId(dto.companyId);
    if (!companyIdNorm) {
      throw new BadRequestException('companyId inválido');
    }

    const company = await this.companyModel
      .findOne({ id: companyIdNorm })
      .exec();
    if (!company) {
      throw new NotFoundException(
        `Compañía con id ${companyIdNorm} no encontrada`,
      );
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
      const actorCompany = this.normalizeCompanyId(actor.company);
      if (!actorCompany || actorCompany !== companyIdNorm) {
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
        ...this.companyIdFilter(companyIdNorm),
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
      companyId: companyIdNorm,
      planId: String(plan.id),
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

    await this.reactivateNormalUsersForCompany(companyIdNorm);

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

    const count = await this.userModel.countDocuments({
      ...this.userCompanyFilter(companyId),
      ...this.normalUserRoleFilter(),
    });

    if (count >= m.maxUsersSnapshot) {
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
    const mk = monthKey();
    if (m.currentMonthKey === mk) {
      return;
    }
    await this.membershipModel.updateOne(
      { _id: m._id },
      { $set: { currentMonthKey: mk, checksUsedInCurrentMonth: 0 } },
    );
  }

  /**
   * Comprueba límites (mes y periodo) sin incrementar. Llamar antes de la API externa.
   * Gana el límite que se agote primero (mensual o del periodo completo).
   */
  async assertCheckLimits(companyId: string): Promise<void> {
    const m = await this.getActiveMembershipForCompany(companyId);
    if (!m) {
      await this.deactivateNormalUsersWhenCheckAccessBlocked(companyId);
      throw new ForbiddenException(
        'La compañía no tiene una membresía activa para registrar checks.',
      );
    }

    if (m.checksUsedInCurrentMonth >= m.maxChecksPerMonthSnapshot) {
      throw new ForbiddenException(
        'Se alcanzó el límite mensual de checks del plan.',
      );
    }
    if (m.checksUsedInPeriod >= m.maxChecksForPeriodSnapshot) {
      await this.deactivateNormalUsersWhenCheckAccessBlocked(companyId);
      throw new ForbiddenException(
        'Se alcanzó el límite de checks del periodo de membresía.',
      );
    }
  }

  /** Incremento atómico tras persistir el check. */
  async incrementCheckUsage(companyId: string): Promise<void> {
    const m = await this.getActiveMembershipForCompany(companyId);
    if (!m) {
      throw new ForbiddenException('Membresía no disponible.');
    }

    const result = await this.membershipModel.updateOne(
      {
        _id: m._id,
        status: MembershipStatus.ACTIVE,
        expiresAt: { $gt: new Date() },
        checksUsedInCurrentMonth: { $lt: m.maxChecksPerMonthSnapshot },
        checksUsedInPeriod: { $lt: m.maxChecksForPeriodSnapshot },
      },
      { $inc: { checksUsedInCurrentMonth: 1, checksUsedInPeriod: 1 } },
    );

    if (result.modifiedCount === 0) {
      await this.deactivateNormalUsersWhenCheckAccessBlocked(companyId);
      throw new ForbiddenException(
        'No se pudo registrar el consumo de checks: límite del plan alcanzado.',
      );
    }

    const after = await this.membershipModel.findById(m._id).lean();
    if (
      after &&
      (after.checksUsedInPeriod ?? 0) >=
        (after.maxChecksForPeriodSnapshot ?? 0) &&
      (after.maxChecksForPeriodSnapshot ?? 0) > 0
    ) {
      await this.deactivateNormalUsersWhenCheckAccessBlocked(companyId);
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
    await this.deactivateNormalUsersWhenCheckAccessBlocked(
      String(m.companyId),
    );
    return { message: 'Membresía suspendida exitosamente' };
  }

  async resume(id: string) {
    const m = await this.membershipModel.findOne({ id }).exec();
    if (!m) {
      throw new NotFoundException(`Membresía con id ${id} no encontrada`);
    }
    if (m.status !== MembershipStatus.SUSPENDED) {
      throw new BadRequestException(
        'Solo se pueden reactivar membresías suspendidas',
      );
    }
    const now = new Date();
    if (new Date(m.expiresAt) <= now) {
      throw new BadRequestException(
        'La membresía está vencida. Crea una nueva contratación.',
      );
    }
    m.status = MembershipStatus.ACTIVE;
    m.deactivatedAt = undefined;
    m.deactivatedBy = undefined;
    m.deactivationReason = undefined;
    await m.save();
    await this.reactivateNormalUsersForCompany(String(m.companyId));
    return { message: 'Membresía reactivada exitosamente' };
  }

  async getActiveMembershipForCompany(
    companyId: string,
  ): Promise<Membership | null> {
    const cid = this.normalizeCompanyId(companyId);
    if (!cid) return null;
    await this.expireStaleMembershipsForCompany(cid);
    const now = new Date();
    const m = await this.membershipModel
      .findOne({
        ...this.companyIdFilter(cid),
        status: MembershipStatus.ACTIVE,
        expiresAt: { $gt: now },
      })
      .sort({ createdAt: -1 })
      .exec();
    if (!m) {
      return null;
    }
    const plan = await this.plansService.findOneById(m.planId);
    if (!plan) {
      return m;
    }
    return this.reconcileMembershipSnapshotsWithPlanIfNeeded(m, plan);
  }

  /**
   * Marca como expiradas las membresías ACTIVE con `expiresAt` vencido (misma lógica que el catálogo de planes).
   */
  async expireStaleMembershipsForCompany(companyId: string): Promise<void> {
    const cid = this.normalizeCompanyId(companyId);
    if (!cid) return;
    const now = new Date();
    await this.membershipModel.updateMany(
      {
        ...this.companyIdFilter(cid),
        status: MembershipStatus.ACTIVE,
        expiresAt: { $lte: now },
      },
      {
        $set: {
          status: MembershipStatus.EXPIRED,
          deactivatedAt: now,
          deactivationReason: 'expired',
          deactivatedBy: 'system',
        },
      },
    );
    await this.deactivateNormalUsersWhenCheckAccessBlocked(companyId);
  }

  /** Planes a ocultar del catálogo (membresía vigente no vencida). */
  async getActivePlanIdsExcludedFromCatalog(
    companyId: string,
  ): Promise<string[]> {
    await this.expireStaleMembershipsForCompany(companyId);
    const cid = this.normalizeCompanyId(companyId);
    if (!cid) return [];
    const now = new Date();
    const docs = await this.membershipModel
      .find({
        ...this.companyIdFilter(cid),
        status: MembershipStatus.ACTIVE,
        expiresAt: { $gt: now },
      })
      .select('planId')
      .lean();
    return [...new Set(docs.map((d) => String(d.planId)).filter(Boolean))];
  }

  /**
   * Resumen para dashboard del administrador de empresa (membresía activa y uso de checks).
   */
  async getDashboardSummaryForCompany(companyId: string) {
    const m = await this.getActiveMembershipForCompany(companyId);
    const companyUsersCount = await this.userModel.countDocuments({
      ...this.userCompanyFilter(companyId),
      ...this.normalUserRoleFilter(),
    });

    if (!m) {
      return {
        hasActiveMembership: false,
        planName: null as string | null,
        membershipExpiresAt: null as string | null,
        daysUntilExpiry: null as number | null,
        checksUsedInPeriod: 0,
        checksPendingMonthly: null as number | null,
        companyUsersCount,
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
      membershipExpiresAt:
        m.expiresAt instanceof Date ? m.expiresAt.toISOString() : String(m.expiresAt),
      daysUntilExpiry,
      checksUsedInPeriod: m.checksUsedInPeriod ?? 0,
      checksPendingMonthly,
      companyUsersCount,
    };
  }
}
