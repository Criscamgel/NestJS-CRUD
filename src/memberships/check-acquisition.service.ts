import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Membership } from './entities/membership.entity';
import { SubscriptionPeriod } from './entities/subscription-period.entity';
import { ExtraChecksWallet } from './entities/extra-checks-wallet.entity';
import { ExtraChecksPurchase } from './entities/extra-checks-purchase.entity';
import { ScheduledPlanChange } from './entities/scheduled-plan-change.entity';
import { MembershipStatus } from './membership-status.enum';
import { Plan } from 'src/plans/entities/plan.entity';

function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function startOfDay(date: Date): Date {
  const d = new Date(date.getTime());
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Servicio de adquisición de checks — orquesta renovaciones, cambios de plan y topups.
 *
 * Principios:
 * - Renovación/cambio de plan: se programan para después del vencimiento actual
 * - Checks adicionales: acreditación inmediata, sin vencimiento, acumulables
 * - Idempotencia: paymentRef único previene duplicados
 * - Política de consumo: plan primero, luego extras
 */
@Injectable()
export class CheckAcquisitionService {
  private readonly logger = new Logger(CheckAcquisitionService.name);

  constructor(
    @InjectModel(Membership.name)
    private readonly membershipModel: Model<Membership>,
    @InjectModel(SubscriptionPeriod.name)
    private readonly periodModel: Model<SubscriptionPeriod>,
    @InjectModel(ExtraChecksWallet.name)
    private readonly walletModel: Model<ExtraChecksWallet>,
    @InjectModel(ExtraChecksPurchase.name)
    private readonly purchaseModel: Model<ExtraChecksPurchase>,
    @InjectModel(ScheduledPlanChange.name)
    private readonly scheduledChangeModel: Model<ScheduledPlanChange>,
    @InjectModel(Plan.name)
    private readonly planModel: Model<Plan>,
  ) {}

  // ─── RENOVACIÓN / CAMBIO DE PLAN ───────────────────────────────────────────

  /**
   * Programa una renovación o cambio de plan tras pago exitoso.
   * Si hay plan activo: programa para el día siguiente al vencimiento.
   * Si no hay plan activo: activa inmediatamente.
   */
  async scheduleRenewalOrPlanChange(params: {
    companyId: string;
    planId: string;
    durationMonths: number;
    type: 'renewal' | 'plan_change';
    paymentRef: string;
    amountPaid: number;
    currency: string;
    initiatedByUserId?: string;
  }): Promise<{ message: string; startsAt: Date; immediate: boolean }> {
    // Idempotencia: verificar si ya se procesó este pago
    const existing = await this.scheduledChangeModel.findOne({
      paymentRef: params.paymentRef,
    });
    if (existing) {
      return {
        message: 'Este pago ya fue procesado.',
        startsAt: existing.startsAt,
        immediate: existing.status === 'activated',
      };
    }

    const plan = await this.planModel.findOne({ id: params.planId });
    if (!plan) {
      throw new BadRequestException('Plan no encontrado.');
    }

    const activeMembership = await this.getActiveMembership(params.companyId);

    let startsAt: Date;
    let immediate = false;

    if (activeMembership) {
      // Hay plan activo: programar para el día siguiente al vencimiento
      startsAt = startOfDay(addDays(new Date(activeMembership.expiresAt), 1));
    } else {
      // Sin plan activo: inicia inmediatamente
      startsAt = startOfDay(new Date());
      immediate = true;
    }

    const scheduled = await this.scheduledChangeModel.create({
      companyId: params.companyId,
      planId: params.planId,
      durationMonths: params.durationMonths,
      startsAt,
      type: params.type,
      status: immediate ? 'activated' : 'pending',
      paymentRef: params.paymentRef,
      amountPaid: params.amountPaid,
      currency: params.currency,
      initiatedByUserId: params.initiatedByUserId,
      activatedAt: immediate ? new Date() : undefined,
    });

    // Si es inmediato, crear la membresía y períodos ahora
    if (immediate) {
      await this.activateScheduledChange(scheduled);
    }

    const msg = immediate
      ? 'Plan activado exitosamente.'
      : `Plan programado para iniciar el ${startsAt.toISOString().split('T')[0]}.`;

    return { message: msg, startsAt, immediate };
  }

  /**
   * Activa un plan programado: crea membresía + períodos mensuales.
   */
  private async activateScheduledChange(scheduled: ScheduledPlanChange): Promise<void> {
    const plan = await this.planModel.findOne({ id: scheduled.planId });
    if (!plan) {
      this.logger.error(`Plan ${scheduled.planId} no encontrado al activar scheduled change`);
      return;
    }

    const expiresAt = addMonths(scheduled.startsAt, scheduled.durationMonths);

    // Cancelar membresía activa anterior (si existe)
    await this.membershipModel.updateMany(
      { companyId: scheduled.companyId, status: MembershipStatus.ACTIVE },
      {
        $set: {
          status: MembershipStatus.EXPIRED,
          deactivatedAt: new Date(),
          deactivationReason: 'replaced_by_scheduled_plan',
        },
      },
    );

    // Crear nueva membresía
    const membership = await this.membershipModel.create({
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      companyId: scheduled.companyId,
      planId: scheduled.planId,
      status: MembershipStatus.ACTIVE,
      startedAt: scheduled.startsAt,
      expiresAt,
      durationMonthsSnapshot: scheduled.durationMonths,
      maxUsersSnapshot: plan.maxUsers,
      maxBranchesSnapshot: plan.maxBranches ?? 0,
      maxChecksPerMonthSnapshot: plan.maxChecksPerMonth,
      maxChecksForPeriodSnapshot: plan.maxChecksPerMonth * scheduled.durationMonths,
      checksUsedInCurrentMonth: 0,
      currentMonthKey: '',
      checksUsedInPeriod: 0,
      checksTopupBonus: 0,
    });

    // Generar períodos mensuales
    await this.generatePeriods(
      scheduled.companyId,
      membership.id,
      scheduled.planId,
      scheduled.startsAt,
      scheduled.durationMonths,
      plan.maxChecksPerMonth,
    );
  }

  /**
   * Genera períodos mensuales consecutivos para una membresía.
   */
  private async generatePeriods(
    companyId: string,
    membershipId: string,
    planId: string,
    startDate: Date,
    durationMonths: number,
    checksPerMonth: number,
  ): Promise<void> {
    const now = new Date();
    const periods = [];

    for (let i = 0; i < durationMonths; i++) {
      const periodStart = addMonths(startDate, i);
      const periodEnd = addMonths(startDate, i + 1);
      const isActive = periodStart <= now && now < periodEnd;
      const isExpired = periodEnd <= now;

      let periodStatus: 'active' | 'upcoming' | 'expired' = 'upcoming';
      if (isExpired) periodStatus = 'expired';
      else if (isActive) periodStatus = 'active';

      periods.push({
        companyId,
        membershipId,
        planId,
        startDate: periodStart,
        endDate: periodEnd,
        checksAssigned: checksPerMonth,
        checksUsed: 0,
        status: periodStatus,
      });
    }

    await this.periodModel.insertMany(periods);
  }

  // ─── CHECKS ADICIONALES ────────────────────────────────────────────────────

  /**
   * Acredita checks adicionales tras pago exitoso.
   * Idempotente: si el paymentRef ya existe, no duplica.
   */
  async creditExtraChecks(params: {
    companyId: string;
    quantity: number;
    paymentRef: string;
    amountPaid: number;
    currency: string;
  }): Promise<{ message: string; newBalance: number }> {
    // Idempotencia: verificar si ya se procesó este pago
    const existing = await this.purchaseModel.findOne({
      paymentRef: params.paymentRef,
    });
    if (existing) {
      const wallet = await this.getOrCreateWallet(params.companyId);
      return {
        message: 'Este pago ya fue procesado.',
        newBalance: wallet.totalPurchased - wallet.totalUsed,
      };
    }

    // Registrar compra en ledger
    await this.purchaseModel.create({
      companyId: params.companyId,
      quantity: params.quantity,
      purchasedAt: new Date(),
      paymentRef: params.paymentRef,
      amountPaid: params.amountPaid,
      currency: params.currency,
    });

    // Acreditar en wallet
    const wallet = await this.walletModel.findOneAndUpdate(
      { companyId: params.companyId },
      { $inc: { totalPurchased: params.quantity } },
      { upsert: true, new: true },
    );

    this.logger.log(
      `Extra checks credited: companyId=${params.companyId} qty=${params.quantity} ref=${params.paymentRef} newBalance=${wallet.totalPurchased - wallet.totalUsed}`,
    );

    return {
      message: `${params.quantity} checks adicionales acreditados exitosamente.`,
      newBalance: wallet.totalPurchased - wallet.totalUsed,
    };
  }

  // ─── CONSUMO DE CHECKS ─────────────────────────────────────────────────────

  /**
   * Valida que la empresa pueda consumir un check.
   * Política: plan primero, luego extras.
   */
  async assertCanConsume(companyId: string): Promise<void> {
    const membership = await this.getActiveMembership(companyId);
    if (!membership) {
      throw new ForbiddenException(
        'La compañía no tiene un plan activo. Los checks adicionales solo pueden usarse con un plan vigente.',
      );
    }

    // Buscar período activo
    const activePeriod = await this.getActivePeriod(companyId);
    if (activePeriod && activePeriod.checksUsed < activePeriod.checksAssigned) {
      return; // Hay checks disponibles en el período del plan
    }

    // Verificar wallet de checks adicionales
    const wallet = await this.getOrCreateWallet(companyId);
    const extraBalance = wallet.totalPurchased - wallet.totalUsed;
    if (extraBalance > 0) {
      return; // Hay checks adicionales disponibles
    }

    throw new ForbiddenException(
      'Agotaste todos los checks de tu plan y no tienes checks adicionales disponibles.',
    );
  }

  /**
   * Incrementa el contador de checks usados.
   * Política: primero del período activo del plan, luego del wallet extra.
   */
  async consumeCheck(companyId: string): Promise<{ source: 'plan' | 'extra' }> {
    const membership = await this.getActiveMembership(companyId);
    if (!membership) {
      throw new ForbiddenException('No hay plan activo.');
    }

    // Intentar consumir del período activo
    const activePeriod = await this.getActivePeriod(companyId);
    if (activePeriod && activePeriod.checksUsed < activePeriod.checksAssigned) {
      await this.periodModel.updateOne(
        { _id: activePeriod._id },
        { $inc: { checksUsed: 1 } },
      );
      // También incrementar counters legacy en membership para compatibilidad
      await this.membershipModel.updateOne(
        { _id: membership._id },
        {
          $inc: { checksUsedInCurrentMonth: 1, checksUsedInPeriod: 1 },
        },
      );
      return { source: 'plan' };
    }

    // Consumir del wallet de extras
    const wallet = await this.getOrCreateWallet(companyId);
    const extraBalance = wallet.totalPurchased - wallet.totalUsed;
    if (extraBalance > 0) {
      await this.walletModel.updateOne(
        { companyId },
        { $inc: { totalUsed: 1 } },
      );
      return { source: 'extra' };
    }

    throw new ForbiddenException('No hay checks disponibles.');
  }

  // ─── ACTIVACIÓN DE PLANES PROGRAMADOS (CRON/MANUAL) ────────────────────────

  /**
   * Activa los planes programados cuya fecha de inicio ya pasó.
   * Debe ejecutarse periódicamente (cron o al consultar dashboard).
   */
  async activateDuePendingPlans(): Promise<number> {
    const now = new Date();
    const pending = await this.scheduledChangeModel.find({
      status: 'pending',
      startsAt: { $lte: now },
    });

    let activated = 0;
    for (const scheduled of pending) {
      await this.activateScheduledChange(scheduled);
      scheduled.status = 'activated';
      scheduled.activatedAt = now;
      await scheduled.save();
      activated++;
    }

    return activated;
  }

  // ─── QUERIES ───────────────────────────────────────────────────────────────

  /** Membresía activa vigente (no vencida). */
  async getActiveMembership(companyId: string): Promise<Membership | null> {
    const now = new Date();
    return this.membershipModel
      .findOne({
        companyId,
        status: MembershipStatus.ACTIVE,
        expiresAt: { $gt: now },
      })
      .sort({ createdAt: -1 })
      .exec();
  }

  /** Período activo actual (la fecha de hoy cae dentro del rango). */
  async getActivePeriod(companyId: string): Promise<SubscriptionPeriod | null> {
    const now = new Date();
    return this.periodModel.findOne({
      companyId,
      startDate: { $lte: now },
      endDate: { $gt: now },
      status: 'active',
    });
  }

  /** Períodos de una empresa (todos). */
  async getPeriodsForCompany(companyId: string): Promise<SubscriptionPeriod[]> {
    return this.periodModel
      .find({ companyId })
      .sort({ startDate: 1 })
      .exec();
  }

  /** Planes programados pendientes para una empresa. */
  async getScheduledChanges(companyId: string): Promise<ScheduledPlanChange[]> {
    return this.scheduledChangeModel
      .find({ companyId, status: 'pending' })
      .sort({ startsAt: 1 })
      .exec();
  }

  /** Wallet de checks adicionales. */
  async getOrCreateWallet(companyId: string): Promise<ExtraChecksWallet> {
    let wallet = await this.walletModel.findOne({ companyId });
    if (!wallet) {
      wallet = await this.walletModel.create({
        companyId,
        totalPurchased: 0,
        totalUsed: 0,
      });
    }
    return wallet;
  }

  /** Historial de compras de checks adicionales. */
  async getExtraPurchaseHistory(companyId: string): Promise<ExtraChecksPurchase[]> {
    return this.purchaseModel
      .find({ companyId })
      .sort({ purchasedAt: -1 })
      .exec();
  }

  /**
   * Resumen completo para dashboard admin.
   */
  async getDashboardSummary(companyId: string) {
    // Activar planes programados que ya deberían estar activos
    await this.activateDuePendingPlans();

    // Sync período activo
    await this.syncActivePeriodStatus(companyId);

    const membership = await this.getActiveMembership(companyId);
    const activePeriod = await this.getActivePeriod(companyId);
    const wallet = await this.getOrCreateWallet(companyId);
    const scheduledChanges = await this.getScheduledChanges(companyId);
    const periods = await this.getPeriodsForCompany(companyId);

    const extraBalance = wallet.totalPurchased - wallet.totalUsed;

    if (!membership) {
      return {
        hasActivePlan: false,
        currentPlan: null,
        activePeriod: null,
        scheduledChanges: [],
        extraChecksBalance: extraBalance,
        periods: [],
      };
    }

    const plan = await this.planModel.findOne({ id: membership.planId });

    return {
      hasActivePlan: true,
      currentPlan: {
        planId: membership.planId,
        planName: plan?.name ?? `Plan ${membership.planId}`,
        expiresAt: membership.expiresAt,
        maxChecksPerMonth: plan?.maxChecksPerMonth ?? membership.maxChecksPerMonthSnapshot,
        durationMonths: membership.durationMonthsSnapshot,
      },
      activePeriod: activePeriod
        ? {
            startDate: activePeriod.startDate,
            endDate: activePeriod.endDate,
            checksAssigned: activePeriod.checksAssigned,
            checksUsed: activePeriod.checksUsed,
            checksRemaining: activePeriod.checksAssigned - activePeriod.checksUsed,
          }
        : null,
      scheduledChanges: await Promise.all(
        scheduledChanges.map(async (sc) => {
          const scPlan = await this.planModel.findOne({ id: sc.planId });
          return {
            type: sc.type,
            planName: scPlan?.name ?? `Plan ${sc.planId}`,
            startsAt: sc.startsAt,
            durationMonths: sc.durationMonths,
          };
        }),
      ),
      extraChecksBalance: extraBalance,
      periods: periods.map((p) => ({
        startDate: p.startDate,
        endDate: p.endDate,
        checksAssigned: p.checksAssigned,
        checksUsed: p.checksUsed,
        status: p.status,
      })),
    };
  }

  /** Sincroniza el status de los períodos según la fecha actual. */
  private async syncActivePeriodStatus(companyId: string): Promise<void> {
    const now = new Date();

    // Marcar como expired los períodos vencidos
    await this.periodModel.updateMany(
      { companyId, endDate: { $lte: now }, status: { $ne: 'expired' } },
      { $set: { status: 'expired' } },
    );

    // Marcar como active el período actual
    await this.periodModel.updateMany(
      { companyId, startDate: { $lte: now }, endDate: { $gt: now }, status: 'upcoming' },
      { $set: { status: 'active' } },
    );
  }
}
