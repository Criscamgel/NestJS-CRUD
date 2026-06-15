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
import { CompanyBranch } from 'src/company-branch/entities/company-branch.entity';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import {
  buildPaginationMeta,
  resolvePagination,
} from 'src/common/utils/pagination';
import { buildRegexOrFilter } from 'src/common/utils/mongo-search';
import { BoldCheckoutIntent } from 'src/bold-payment/entities/bold-checkout-intent.entity';
import {
  USER_DEACTIVATION_REASON_MEMBERSHIP,
  userFilterReactivatableByMembership,
} from 'src/users/user-account.constants';

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
  maxBranchesSnapshot: number;
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
    @InjectModel(CompanyBranch.name)
    private readonly companyBranchModel: Model<CompanyBranch>,
    @InjectModel(CounterId.name)
    private readonly counterIdModel: Model<CounterId>,
    @InjectModel(BoldCheckoutIntent.name)
    private readonly boldCheckoutIntentModel: Model<BoldCheckoutIntent>,
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

  /** `companyId` en colección de sedes (string / número legacy). */
  private branchCompanyIdFilter(companyId: string): Record<string, unknown> {
    const cid = this.normalizeCompanyId(companyId);
    if (!cid) return { companyId: '__invalid_company__' };
    if (/^\d+$/.test(cid)) {
      return { companyId: { $in: [cid, Number(cid)] } };
    }
    return { companyId: cid };
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

  /**
   * Cupo de sedes según plan. Si el documento no tiene `maxBranches` (planes anteriores),
   * se usa un tope alto para no bloquear operación hasta que el plan se vuelva a guardar.
   */
  private static readonly LEGACY_PLAN_BRANCH_CAP = 999_999;

  private maxBranchesQuotaFromPlan(plan: Plan | null): number {
    if (!plan) {
      return MembershipsService.LEGACY_PLAN_BRANCH_CAP;
    }
    const raw = (plan as unknown as { maxBranches?: number | null }).maxBranches;
    if (raw !== undefined && raw !== null && !Number.isNaN(Number(raw))) {
      return Math.max(0, Math.floor(Number(raw)));
    }
    return MembershipsService.LEGACY_PLAN_BRANCH_CAP;
  }

  private checksTopupBonusOf(m: { checksTopupBonus?: number | null }): number {
    const n = Math.floor(Number(m.checksTopupBonus ?? 0));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  private effectiveMaxChecksPerMonth(m: {
    maxChecksPerMonthSnapshot?: number;
    checksTopupBonus?: number | null;
  }): number {
    return (m.maxChecksPerMonthSnapshot ?? 0) + this.checksTopupBonusOf(m);
  }

  private effectiveMaxChecksForPeriod(m: {
    maxChecksForPeriodSnapshot?: number;
    checksTopupBonus?: number | null;
  }): number {
    return (m.maxChecksForPeriodSnapshot ?? 0) + this.checksTopupBonusOf(m);
  }

  /** Snapshots de membresía alineados con la definición actual del plan en catálogo. */
  private snapshotSetFromPlan(plan: Plan): MembershipPlanSnapshotSet | null {
    const maxPeriod = plan.maxChecksPerMonth * plan.durationMonths;
    if (maxPeriod < 1) return null;
    return {
      maxUsersSnapshot: plan.maxUsers,
      maxBranchesSnapshot: this.maxBranchesQuotaFromPlan(plan),
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
      (m.maxBranchesSnapshot ?? -1) === snap.maxBranchesSnapshot &&
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
    const periodExtra = Math.max(
      0,
      (m.maxChecksForPeriodSnapshot ?? 0) - snap.maxChecksForPeriodSnapshot,
    );
    const monthExtra = Math.max(
      0,
      (m.maxChecksPerMonthSnapshot ?? 0) - snap.maxChecksPerMonthSnapshot,
    );
    const legacyTopup = Math.max(periodExtra, monthExtra);
    const checksTopupBonus = Math.max(this.checksTopupBonusOf(m), legacyTopup);
    await this.membershipModel.updateOne(
      { _id: m._id },
      { $set: { ...snap, checksTopupBonus } },
    );
    const fresh = await this.membershipModel.findById(m._id).exec();
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

    await this.membershipModel.updateMany(
      {
        ...this.planIdFilter(pid),
        status: MembershipStatus.ACTIVE,
        expiresAt: { $gt: now },
      },
      { $set: snap },
    );
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

  /** Usuarios de la empresa (admin + user), sin filtrar por `isActive`. */
  private companyMembersFilter(companyId: string): Record<string, unknown> {
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

  /**
   * Desactiva cuentas de la empresa (solo rol user) cuando no hay membresía vigente.
   * Los administradores mantienen acceso de lectura con restricciones de escritura.
   */
  private async deactivateCompanyUsersWhenMembershipExpired(
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

    if (m != null) {
      return;
    }

    // Solo desactivar usuarios con rol 'user', NO admins ni superAdmins
    await this.userModel.updateMany(
      {
        ...this.normalCheckUserFilter(cid),
      },
      {
        $set: {
          isActive: false,
          deactivationReason: USER_DEACTIVATION_REASON_MEMBERSHIP,
        },
      },
    );
  }

  private async reactivateCompanyUsersForCompany(companyId: string): Promise<void> {
    const cid = this.normalizeCompanyId(companyId);
    if (!cid) return;
    await this.userModel.updateMany(
      {
        ...this.companyMembersFilter(cid),
        ...userFilterReactivatableByMembership(),
      },
      {
        $set: { isActive: true },
        $unset: { deactivationReason: '' },
      },
    );
  }

  /**
   * Corrige cuentas desactivadas por error cuando la membresía sigue vigente
   * (p. ej. tras agotar checks con lógica antigua).
   */
  async ensureCompanyUsersActiveWhenMembershipValid(
    companyId: string,
  ): Promise<void> {
    const m = await this.getActiveMembershipForCompany(companyId);
    if (!m) return;
    await this.reactivateCompanyUsersForCompany(companyId);
  }

  /** @deprecated Use reactivateCompanyUsersForCompany */
  private async reactivateNormalUsersForCompany(companyId: string): Promise<void> {
    await this.reactivateCompanyUsersForCompany(companyId);
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
    }

    const maxChecksForPeriodSnapshot = plan.maxChecksPerMonth * plan.durationMonths;
    if (maxChecksForPeriodSnapshot < 1) {
      throw new BadRequestException('Configuración de plan inválida');
    }

    const startedAt = new Date();
    const expiresAt = addMonths(startedAt, plan.durationMonths);
    const mk = monthKey(startedAt);

    // Preservar checks comprados (topup) y checks no usados de la membresía anterior
    const previousActive = await this.membershipModel
      .findOne({
        ...this.companyIdFilter(companyIdNorm),
        status: MembershipStatus.ACTIVE,
      })
      .sort({ createdAt: -1 })
      .lean();
    const carryOverTopupBonus = this.checksTopupBonusOf(previousActive ?? {});

    // Calcular checks restantes del periodo anterior para acumularlos
    let carryOverRemainingChecks = 0;
    if (previousActive) {
      const prevMaxForPeriod =
        (previousActive.maxChecksForPeriodSnapshot ?? 0) +
        this.checksTopupBonusOf(previousActive);
      const prevUsed = previousActive.checksUsedInPeriod ?? 0;
      carryOverRemainingChecks = Math.max(0, prevMaxForPeriod - prevUsed);
    }

    // maxChecksForPeriod del nuevo plan + checks restantes del plan anterior (acumulable)
    const finalMaxChecksForPeriod = maxChecksForPeriodSnapshot + carryOverRemainingChecks;

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
      maxBranchesSnapshot: this.maxBranchesQuotaFromPlan(plan),
      maxChecksPerMonthSnapshot: plan.maxChecksPerMonth,
      maxChecksForPeriodSnapshot: finalMaxChecksForPeriod,
      checksUsedInCurrentMonth: 0,
      currentMonthKey: mk,
      checksUsedInPeriod: 0,
      checksTopupBonus: carryOverTopupBonus,
    });

    await this.reactivateNormalUsersForCompany(companyIdNorm);

    return {
      message: 'Membresía creada exitosamente',
      membership,
    };
  }

  /**
   * Primera membresía tras registro post-pago en landing (sin actor JWT).
   * Solo debe invocarse desde el flujo verificado de onboarding Bold.
   */
  async createMembershipAfterPaidLanding(companyId: string, planId: string) {
    const companyIdNorm = this.normalizeCompanyId(companyId);
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
    const plan = await this.plansService.findOneById(planId);
    if (!plan) {
      throw new NotFoundException(`Plan con id ${planId} no encontrado`);
    }
    if (!plan.isActive) {
      throw new BadRequestException('El plan no está activo');
    }
    const maxChecksForPeriodSnapshot = plan.maxChecksPerMonth * plan.durationMonths;
    if (maxChecksForPeriodSnapshot < 1) {
      throw new BadRequestException('Configuración de plan inválida');
    }
    const systemActorId = 'landing_onboarding';
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
          deactivatedBy: systemActorId,
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
      maxBranchesSnapshot: this.maxBranchesQuotaFromPlan(plan),
      maxChecksPerMonthSnapshot: plan.maxChecksPerMonth,
      maxChecksForPeriodSnapshot,
      checksUsedInCurrentMonth: 0,
      currentMonthKey: mk,
      checksUsedInPeriod: 0,
    });
    await this.reactivateNormalUsersForCompany(companyIdNorm);
    return { message: 'Membresía creada exitosamente', membership };
  }

  /**
   * Renueva la membresía activa: extiende la fecha de expiración partiendo de la fecha
   * de expiración actual (no desde hoy), suma los checks del nuevo periodo y preserva el topup bonus.
   */
  async renewMembership(companyId: string, months: number, actor: User) {
    const companyIdNorm = this.normalizeCompanyId(companyId);
    if (!companyIdNorm) {
      throw new BadRequestException('companyId inválido');
    }

    const qty = Math.floor(Number(months));
    if (!Number.isFinite(qty) || qty < 1 || qty > 24) {
      throw new BadRequestException('La cantidad de meses debe estar entre 1 y 24.');
    }

    const m = await this.getActiveMembershipForCompany(companyIdNorm);
    if (!m) {
      throw new BadRequestException('No hay una membresía activa para renovar.');
    }

    const plan = await this.plansService.findOneById(m.planId);
    if (!plan) {
      throw new BadRequestException('El plan asociado a la membresía ya no existe.');
    }

    // Calcular nueva expiración a partir de la fecha de expiración actual (no hoy)
    const currentExpiresAt = new Date(m.expiresAt);
    const newExpiresAt = addMonths(currentExpiresAt, qty);

    // Sumar checks del nuevo periodo al periodo total
    const additionalChecks = plan.maxChecksPerMonth * qty;
    const newMaxChecksForPeriod = (m.maxChecksForPeriodSnapshot ?? 0) + additionalChecks;
    const newDurationMonths = (m.durationMonthsSnapshot ?? 0) + qty;

    await this.membershipModel.updateOne(
      { _id: m._id },
      {
        $set: {
          expiresAt: newExpiresAt,
          durationMonthsSnapshot: newDurationMonths,
          maxChecksForPeriodSnapshot: newMaxChecksForPeriod,
        },
      },
    );

    return {
      message: `Plan renovado exitosamente por ${qty} ${qty === 1 ? 'mes' : 'meses'} adicionales.`,
      data: {
        newExpiresAt: newExpiresAt.toISOString(),
        additionalChecks,
        totalDurationMonths: newDurationMonths,
      },
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
  /**
   * Límite de sedes del plan (membresía activa). Usa snapshot; si falta, el plan vigente.
   */
  private resolveMaxBranchesLimit(
    m: Membership,
    plan: Plan | null,
  ): number {
    if (m.maxBranchesSnapshot !== undefined && m.maxBranchesSnapshot !== null) {
      return Number(m.maxBranchesSnapshot);
    }
    return this.maxBranchesQuotaFromPlan(plan);
  }

  /**
   * No crear sede si ya se alcanzó el tope del plan contratado (total de sedes de la empresa).
   */
  async assertCanAddBranch(companyId: string): Promise<void> {
    const cid = this.normalizeCompanyId(companyId);
    if (!cid) {
      throw new BadRequestException('companyId inválido');
    }

    const m = await this.getActiveMembershipForCompany(cid);
    if (!m) {
      throw new ForbiddenException(
        'La compañía no tiene una membresía activa. Contrata un plan para crear sedes.',
      );
    }

    const plan = await this.plansService.findOneById(m.planId);
    const limit = this.resolveMaxBranchesLimit(m, plan);

    const branchCount = await this.companyBranchModel.countDocuments(
      this.branchCompanyIdFilter(cid),
    );

    if (branchCount >= limit) {
      throw new ForbiddenException(
        `Se alcanzó el límite de sedes del plan (${limit}). Amplía el plan o elimina sedes existentes para crear una nueva.`,
      );
    }
  }

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
      await this.deactivateCompanyUsersWhenMembershipExpired(companyId);
      throw new ForbiddenException(
        'La compañía no tiene una membresía activa para registrar checks.',
      );
    }

    const maxMonth = this.effectiveMaxChecksPerMonth(m);
    const maxPeriod = this.effectiveMaxChecksForPeriod(m);
    if (m.checksUsedInCurrentMonth >= maxMonth) {
      throw new ForbiddenException(
        'Agotaste todos los checks del mes de tu plan. Contacta al administrador de tu empresa para mejorar el plan.',
      );
    }
    if (m.checksUsedInPeriod >= maxPeriod) {
      throw new ForbiddenException(
        'Agotaste todos los checks de tu plan. Contacta al administrador de tu empresa para mejorar el plan.',
      );
    }
  }

  private membershipQuotaExhausted(m: {
    checksUsedInCurrentMonth?: number;
    maxChecksPerMonthSnapshot?: number;
    checksUsedInPeriod?: number;
    maxChecksForPeriodSnapshot?: number;
    checksTopupBonus?: number | null;
  }): boolean {
    const maxMonth = this.effectiveMaxChecksPerMonth(m);
    const maxPeriod = this.effectiveMaxChecksForPeriod(m);
    const monthly =
      maxMonth > 0 && (m.checksUsedInCurrentMonth ?? 0) >= maxMonth;
    const period =
      maxPeriod > 0 && (m.checksUsedInPeriod ?? 0) >= maxPeriod;
    return monthly || period;
  }

  /**
   * Tras pago Bold por checks adicionales: amplía cupo mensual y del periodo vigente.
   */
  async addPurchasedChecksToActiveMembership(
    companyId: string,
    quantity: number,
  ): Promise<{ checksAdded: number }> {
    const qty = Math.floor(Number(quantity));
    if (!Number.isFinite(qty) || qty < 1) {
      throw new BadRequestException('Cantidad de checks inválida.');
    }
    await this.syncMonthForCompany(companyId);
    const m = await this.getActiveMembershipForCompany(companyId);
    if (!m) {
      throw new BadRequestException(
        'No hay una membresía activa para acreditar los checks.',
      );
    }
    await this.membershipModel.updateOne(
      { _id: m._id },
      { $inc: { checksTopupBonus: qty } },
    );
    return { checksAdded: qty };
  }

  /** Incremento atómico tras persistir el check. */
  async incrementCheckUsage(
    companyId: string,
  ): Promise<{ checksQuotaExhausted: boolean }> {
    const m = await this.getActiveMembershipForCompany(companyId);
    if (!m) {
      throw new ForbiddenException('Membresía no disponible.');
    }

    const maxMonth = this.effectiveMaxChecksPerMonth(m);
    const maxPeriod = this.effectiveMaxChecksForPeriod(m);
    const result = await this.membershipModel.updateOne(
      {
        _id: m._id,
        status: MembershipStatus.ACTIVE,
        expiresAt: { $gt: new Date() },
        checksUsedInCurrentMonth: { $lt: maxMonth },
        checksUsedInPeriod: { $lt: maxPeriod },
      },
      { $inc: { checksUsedInCurrentMonth: 1, checksUsedInPeriod: 1 } },
    );

    if (result.modifiedCount === 0) {
      throw new ForbiddenException(
        'No se pudo registrar el consumo de checks: límite del plan alcanzado.',
      );
    }

    const after = await this.membershipModel.findById(m._id).lean();
    return {
      checksQuotaExhausted: after ? this.membershipQuotaExhausted(after) : false,
    };
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
    await this.deactivateCompanyUsersWhenMembershipExpired(String(m.companyId));
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
    await this.deactivateCompanyUsersWhenMembershipExpired(companyId);
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

  /** Plan con sedes (>0): habilita analítica por ciudad en el dashboard admin. */
  async isBranchesAnalyticsEnabledForCompany(companyId: string): Promise<boolean> {
    const cid = this.normalizeCompanyId(companyId);
    if (!cid) return false;
    const m = await this.getActiveMembershipForCompany(cid);
    if (!m) return false;
    const plan = await this.plansService.findOneById(m.planId);
    return this.resolveMaxBranchesLimit(m, plan) > 0;
  }

  /**
   * Acredita top-ups pagados en Bold que quedaron `completed` sin `checksTopupAppliedAt`
   * (p. ej. por reconciliación de snapshots que borraba el cupo antes de `checksTopupBonus`).
   */
  private async healUnappliedChecksTopupIntents(companyId: string): Promise<void> {
    const cid = this.normalizeCompanyId(companyId);
    if (!cid) return;
    const intents = await this.boldCheckoutIntentModel
      .find({
        companyId: cid,
        source: 'checks_topup',
        status: 'completed',
        checksQuantity: { $gte: 1 },
        $or: [
          { checksTopupAppliedAt: { $exists: false } },
          { checksTopupAppliedAt: null },
        ],
      })
      .limit(10)
      .exec();
    for (const intent of intents) {
      const qty = Math.floor(Number(intent.checksQuantity ?? 0));
      if (qty < 1) continue;
      await this.addPurchasedChecksToActiveMembership(cid, qty);
      intent.checksTopupAppliedAt = new Date();
      await intent.save();
    }
  }

  /**
   * Información del plan actual para el modal de renovación.
   */
  async getRenewalInfoForCompany(companyId: string) {
    const m = await this.getActiveMembershipForCompany(companyId);
    if (!m) {
      return {
        hasActiveMembership: false,
        planName: null as string | null,
        monthlyPrice: null as number | null,
        currency: null as string | null,
        maxChecksPerMonth: null as number | null,
        membershipExpiresAt: null as string | null,
      };
    }

    const planDoc = await this.plansService.findOneById(m.planId);
    return {
      hasActiveMembership: true,
      planName: planDoc?.name?.trim() || `Plan ${m.planId}`,
      monthlyPrice: planDoc?.monthlyPrice ?? 0,
      currency: planDoc?.currency ?? 'USD',
      maxChecksPerMonth: planDoc?.maxChecksPerMonth ?? m.maxChecksPerMonthSnapshot ?? 0,
      membershipExpiresAt:
        m.expiresAt instanceof Date ? m.expiresAt.toISOString() : String(m.expiresAt),
    };
  }

  /**
   * Resumen para dashboard del administrador de empresa (membresía activa y uso de checks).
   */
  async getDashboardSummaryForCompany(companyId: string) {
    await this.healUnappliedChecksTopupIntents(companyId);
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
        checksUsedInCurrentMonth: null as number | null,
        maxChecksPerMonthSnapshot: null as number | null,
        maxChecksPerMonthEffective: null as number | null,
        maxChecksForPeriodEffective: null as number | null,
        checksTopupBonus: 0,
        checksRemainingInPeriod: null as number | null,
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

    const bonus = this.checksTopupBonusOf(m);
    const maxMonthBase = m.maxChecksPerMonthSnapshot ?? 0;
    const maxMonthEffective = this.effectiveMaxChecksPerMonth(m);
    const maxPeriodBase = m.maxChecksForPeriodSnapshot ?? 0;
    const maxPeriodEffective = this.effectiveMaxChecksForPeriod(m);
    const usedMonth = m.checksUsedInCurrentMonth ?? 0;
    const usedPeriod = m.checksUsedInPeriod ?? 0;

    const checksPendingMonthly = Math.max(0, maxMonthEffective - usedMonth);
    const checksRemainingInPeriod = Math.max(0, maxPeriodEffective - usedPeriod);
    const checksQuotaExhausted = this.membershipQuotaExhausted(m);

    return {
      hasActiveMembership: true,
      planName,
      membershipExpiresAt:
        m.expiresAt instanceof Date ? m.expiresAt.toISOString() : String(m.expiresAt),
      daysUntilExpiry,
      checksUsedInPeriod: usedPeriod,
      checksPendingMonthly,
      checksRemainingInPeriod,
      checksUsedInCurrentMonth: usedMonth,
      maxChecksPerMonthSnapshot: maxMonthBase,
      maxChecksForPeriodSnapshot: maxPeriodBase,
      maxChecksPerMonthEffective: maxMonthEffective,
      maxChecksForPeriodEffective: maxPeriodEffective,
      checksTopupBonus: bonus,
      checksQuotaExhausted,
      companyUsersCount,
      maxUsersSnapshot: m.maxUsersSnapshot ?? null,
      // Datos del plan para el modal de renovación
      planMonthlyPrice: planDoc?.monthlyPrice ?? null,
      planCurrency: planDoc?.currency ?? null,
      planMaxChecksPerMonth: planDoc?.maxChecksPerMonth ?? null,
      planDurationMonths: planDoc?.durationMonths ?? null,
    };
  }

  /**
   * Conteo global para panel superAdmin: membresías vigentes (activas y no vencidas).
   */
  async countGloballyActiveMemberships(): Promise<number> {
    const now = new Date();
    return this.membershipModel.countDocuments({
      status: MembershipStatus.ACTIVE,
      expiresAt: { $gt: now },
    });
  }

  /**
   * Membresías creadas en el mes calendario actual (fecha de creación del registro).
   */
  async countMembershipsCreatedInCurrentMonth(): Promise<number> {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );
    return this.membershipModel.countDocuments({
      createdAt: { $gte: start, $lte: end },
    });
  }
}
