import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import * as crypto from 'crypto';
import { Model } from 'mongoose';
import axios, { AxiosError } from 'axios';
import { BoldCheckoutIntent } from './entities/bold-checkout-intent.entity';
import type { BoldCheckoutSource } from './entities/bold-checkout-intent.entity';
import { PlansService } from 'src/plans/plans.service';
import { MembershipsService } from 'src/memberships/memberships.service';
import { User } from 'src/users/entities/user.entity';
import { EmailService } from 'src/email/email.service';
import { getBoldMinTotalAmount } from 'src/common/catalog/plan-currencies.catalog';
import {
  formatMoneyAmount,
  normalizePlanCurrency,
} from 'src/common/utils/money.util';

const PAID_STATUSES = new Set(['APPROVED', 'PAID', 'paid', 'approved']);

function isPaidStatus(status: unknown): boolean {
  if (status == null) return false;
  const s = String(status).trim();
  return PAID_STATUSES.has(s) || PAID_STATUSES.has(s.toUpperCase());
}

@Injectable()
export class BoldPaymentService {
  private readonly logger = new Logger(BoldPaymentService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(BoldCheckoutIntent.name)
    private readonly intentModel: Model<BoldCheckoutIntent>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    private readonly plansService: PlansService,
    private readonly membershipsService: MembershipsService,
    private readonly emailService: EmailService,
  ) {}

  private getSecretKey(): string {
    const k =
      this.configService.get<string>('boldSecretKey')?.trim() ||
      this.configService.get<string>('BOLD_SECRET_KEY')?.trim() ||
      '';
    if (!k) {
      throw new ServiceUnavailableException(
        'Pagos Bold no configurados (BOLD_SECRET_KEY).',
      );
    }
    return k;
  }

  private getApiKey(): string {
    const k =
      this.configService.get<string>('boldApiKey')?.trim() ||
      this.configService.get<string>('BOLD_API_KEY')?.trim() ||
      '';
    if (!k) {
      throw new ServiceUnavailableException(
        'Pagos Bold no configurados (BOLD_API_KEY).',
      );
    }
    return k;
  }

  /**
   * Prefijo oficial API Link (`…/online/link/v1`).
   * Acepta en env solo el host (recomendado) o la URL ya terminada en `/online/link/v1`.
   * @see https://developers.bold.co/pagos-en-linea/api-integration
   */
  private resolveBoldOnlineLinkPrefix(): string {
    const raw =
      this.configService.get<string>('boldApiLinkBaseUrl')?.trim() ||
      this.configService.get<string>('BOLD_API_LINK_URL')?.trim() ||
      this.configService.get<string>('BOLD_API_LINK_URI')?.trim() ||
      '';
    if (!raw) {
      throw new ServiceUnavailableException(
        'Pagos Bold no configurados (BOLD_API_LINK_URL).',
      );
    }
    const trimmed = raw.replace(/\/+$/, '');
    const suffix = '/online/link/v1';
    return trimmed.endsWith(suffix) ? trimmed : `${trimmed}${suffix}`;
  }

  private callbackBaseForSource(source: BoldCheckoutSource): string {
    if (source === 'landing') {
      const u =
        this.configService.get<string>('publicLandingUrl')?.trim() ||
        this.configService.get<string>('PUBLIC_LANDING_URL')?.trim() ||
        this.configService.get<string>('LANDING_URL')?.trim() ||
        '';
      if (!u) {
        throw new BadRequestException(
          'Configure PUBLIC_LANDING_URL (URL absoluta de la landing) para el retorno de Bold.',
        );
      }
      return u.replace(/\/$/, '');
    }
    const u =
      this.configService.get<string>('publicWebAppUrl')?.trim() ||
      this.configService.get<string>('frontendUrl')?.trim() ||
      this.configService.get<string>('PUBLIC_WEB_APP_URL')?.trim() ||
      this.configService.get<string>('FRONTEND_URL')?.trim() ||
      '';
    if (!u) {
      throw new BadRequestException(
        'Configure PUBLIC_WEB_APP_URL o FRONTEND_URL para el retorno de Bold.',
      );
    }
    return u.replace(/\/$/, '');
  }

  /** SHA256(orderId + amount + currency + secret) — compatible con BoldCheckout integrity. */
  generateIntegrityHash(orderId: string, amount: string, currency: string): string {
    const secretKey = this.getSecretKey();
    const data = `${orderId}${amount}${currency}${secretKey}`;
    return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
  }

  /**
   * Bold documenta la expiración en nanosegundos; ese valor supera MAX_SAFE_INTEGER y se corrompe
   * como `number` IEEE-754 → la API puede ignorar `amount` u operar como monto abierto (OPEN).
   */
  private boldLinkExpirationNanosAsString(): string {
    const ms = BigInt(Date.now());
    const tenMinutesNs = BigInt(10 * 60) * BigInt(1_000_000_000);
    return (ms * BigInt(1_000_000) + tenMinutesNs).toString();
  }

  private assertBoldMinimumCharge(totalAmount: number, currency: string): void {
    const cur = normalizePlanCurrency(currency);
    const min = getBoldMinTotalAmount(cur);
    if (totalAmount < min) {
      throw new BadRequestException(
        `El total a cobrar (${formatMoneyAmount(totalAmount, cur)}) es menor al mínimo de Bold (${formatMoneyAmount(min, cur)}). Ajusta el precio del plan o contacta a tu vendedor.`,
      );
    }
  }

  private formatBoldApiError(error: unknown): string {
    const ax = error as AxiosError<Record<string, unknown>>;
    const data = ax.response?.data;
    if (data && typeof data === 'object') {
      const message = data.message;
      if (typeof message === 'string' && message.trim()) {
        return message.trim();
      }
      if (Array.isArray(message)) {
        return message.map((m) => String(m)).join('. ');
      }
      const err = data.error;
      if (typeof err === 'string' && err.trim()) {
        return err.trim();
      }
      const errors = data.errors;
      if (Array.isArray(errors)) {
        return errors
          .map((item) =>
            typeof item === 'string'
              ? item
              : typeof item === 'object' && item && 'message' in item
                ? String((item as { message?: unknown }).message)
                : JSON.stringify(item),
          )
          .join('. ');
      }
    }
    if (ax.response?.status === 400) {
      return 'Bold rechazó el cobro (HTTP 400). Revisa monto y moneda del plan (debe ser una moneda soportada por tu cuenta Bold).';
    }
    return ax.message || 'No se pudo crear el enlace de pago en Bold.';
  }

  private async callBoldCreateLink(params: {
    amount: number;
    currency: string;
    description: string;
    callbackUrl: string;
    reference: string;
  }): Promise<{ url: string; payment_link: string }> {
    const url = this.resolveBoldOnlineLinkPrefix();
    const apiKey = this.getApiKey();
    const totalAmount = Math.round(Number(params.amount));
    if (totalAmount < 1 || !Number.isFinite(totalAmount)) {
      throw new BadRequestException('Monto del cobro inválido.');
    }
    const currency = normalizePlanCurrency(params.currency);
    this.assertBoldMinimumCharge(totalAmount, currency);

    /** Preferimos CLOSE con referencia estable para conciliación (además de texto legible en Bold). */
    const body = {
      amount_type: 'CLOSE' as const,
      amount: {
        currency,
        total_amount: totalAmount,
      },
      reference: params.reference,
      description: params.description.slice(0, 500),
      expiration_date: this.boldLinkExpirationNanosAsString(),
      callback_url: params.callbackUrl,
    };
    this.logger.log(
      `Bold create link: reference=${params.reference} total_amount=${totalAmount} currency=${params.currency} amount_type=CLOSE`,
    );
    try {
      const { data } = await axios.post<{
        payload?: { url?: string; payment_link?: string };
        url?: string;
        payment_link?: string;
      }>(url, body, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `x-api-key ${apiKey}`,
        },
        timeout: 25_000,
      });
      const payload = (data as { payload?: { url?: string; payment_link?: string } })
        ?.payload;
      const outUrl = payload?.url ?? (data as { url?: string }).url;
      const outLink =
        payload?.payment_link ?? (data as { payment_link?: string }).payment_link;
      if (!outUrl || !outLink) {
        this.logger.warn(`Bold create link respuesta inesperada: ${JSON.stringify(data)}`);
        throw new BadRequestException('Bold no devolvió url de pago válida.');
      }
      return { url: outUrl, payment_link: outLink };
    } catch (e) {
      const msg = this.formatBoldApiError(e);
      this.logger.error(
        `Bold create link error: ${msg} | body=${JSON.stringify(
          (e as AxiosError)?.response?.data ?? null,
        )}`,
      );
      throw new BadRequestException(msg);
    }
  }

  async fetchBoldPaymentStatus(paymentLinkId: string): Promise<unknown> {
    const base = this.resolveBoldOnlineLinkPrefix();
    const apiKey = this.getApiKey();
    const { data } = await axios.get(
      `${base}/${encodeURIComponent(paymentLinkId)}`,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `x-api-key ${apiKey}`,
        },
        timeout: 25_000,
      },
    );
    return data;
  }

  private resolvePaidFromBoldPayload(data: unknown): boolean {
    if (!data || typeof data !== 'object') return false;
    const o = data as Record<string, unknown>;
    if (isPaidStatus(o.status)) return true;
    const p = o.payload;
    if (p && typeof p === 'object' && isPaidStatus((p as Record<string, unknown>).status)) {
      return true;
    }
    return false;
  }

  /** Planes ocultos del catálogo (`isVisible: false`) sí pueden contratarse vía «Plan a tu medida». */
  private async loadPlanForPublicCheckout(planId: string) {
    const plan = await this.plansService.findOneById(planId);
    if (!plan) {
      throw new BadRequestException('Plan no encontrado');
    }
    if (!plan.isActive) {
      throw new BadRequestException('Este plan no está disponible para contratación.');
    }
    return plan;
  }

  private computeChargeAmount(plan: {
    monthlyPrice: number;
    durationMonths: number;
  }): number {
    const total = Math.round(
      Number(plan.monthlyPrice) * Number(plan.durationMonths),
    );
    if (!Number.isFinite(total) || total < 1) {
      throw new BadRequestException('Monto del plan inválido');
    }
    return total;
  }

  async startLandingCheckout(planId: string) {
    const normalizedPlanId = planId?.trim();
    if (!normalizedPlanId) {
      throw new BadRequestException('El identificador del plan es obligatorio.');
    }
    const plan = await this.loadPlanForPublicCheckout(normalizedPlanId);
    const amount = this.computeChargeAmount(plan);
    const currency = normalizePlanCurrency(plan.currency);
    const ref = `CHEKY-LAND-${crypto.randomUUID()}`;
    this.logger.log(
      `Bold landing checkout start: planId=${String(plan.id)} planName=${plan.name} monthlyPrice=${plan.monthlyPrice} durationMonths=${plan.durationMonths} chargeAmount=${amount} currency=${currency} ref=${ref}`,
    );
    const callbackBase = this.callbackBaseForSource('landing');
    const callbackUrl = `${callbackBase}/?pagoBold=1`;
    const amountLabel = formatMoneyAmount(amount, currency);
    const boldDescription =
      `${plan.name} — Total ${amountLabel} — Ref. ${ref}`.slice(0, 500);

    const bold = await this.callBoldCreateLink({
      amount,
      currency,
      description: boldDescription,
      callbackUrl,
      reference: ref,
    });

    await this.intentModel.create({
      ref,
      planId: String(plan.id),
      amountTotal: amount,
      currency,
      source: 'landing',
      boldPaymentLinkId: bold.payment_link,
      status: 'pending',
    });

    return {
      message: 'Redirigiendo a Bold',
      data: {
        redirectUrl: bold.url,
        paymentLink: bold.payment_link,
        reference: ref,
      },
    };
  }

  async startCompanyAdminCheckout(planId: string, actor: User) {
    const normalizedPlanId = planId?.trim();
    if (!normalizedPlanId) {
      throw new BadRequestException('El identificador del plan es obligatorio.');
    }
    const plan = await this.loadPlanForPublicCheckout(normalizedPlanId);
    const roles = actor.roles || [];
    const legacy = (actor as { role?: string }).role;
    const isSuper =
      roles.includes('superAdmin') || legacy === 'superAdmin';
    if (isSuper) {
      throw new BadRequestException(
        'Los super administradores no usan el checkout de empresa; use el flujo correspondiente.',
      );
    }
    const companyId = actor.company?.trim();
    if (!companyId) {
      throw new BadRequestException(
        'Tu cuenta no está vinculada a una empresa.',
      );
    }

    const amount = this.computeChargeAmount(plan);
    const currency = normalizePlanCurrency(plan.currency);
    const ref = `CHEKY-CO-${crypto.randomUUID()}`;
    const callbackBase = this.callbackBaseForSource('company_admin');
    const callbackUrl = `${callbackBase}/dashboard?pagoBold=1`;
    const amountLabel = formatMoneyAmount(amount, currency);
    const boldDescription =
      `Cheky empresa — ${plan.name} — Total ${amountLabel} — Ref. ${ref}`.slice(0, 500);

    const bold = await this.callBoldCreateLink({
      amount,
      currency,
      description: boldDescription,
      callbackUrl,
      reference: ref,
    });

    await this.intentModel.create({
      ref,
      planId: String(plan.id),
      amountTotal: amount,
      currency,
      source: 'company_admin',
      companyId,
      initiatedByUserId: actor.id,
      boldPaymentLinkId: bold.payment_link,
      status: 'pending',
    });

    return {
      message: 'Redirigiendo a Bold',
      data: {
        redirectUrl: bold.url,
        paymentLink: bold.payment_link,
        reference: ref,
      },
    };
  }

  async confirmByPaymentLink(paymentLinkId: string) {
    if (!paymentLinkId?.trim()) {
      throw new BadRequestException('paymentLink es obligatorio');
    }
    const remote = await this.fetchBoldPaymentStatus(paymentLinkId.trim());
    const paid = this.resolvePaidFromBoldPayload(remote);
    if (!paid) {
      throw new BadRequestException(
        'El pago aún no figura como aprobado en Bold. Reintenta en unos segundos.',
      );
    }

    const intent = await this.intentModel
      .findOne({ boldPaymentLinkId: paymentLinkId.trim() })
      .exec();
    if (!intent) {
      throw new BadRequestException('No hay una orden interna asociada a este enlace.');
    }
    if (intent.status === 'completed') {
      return {
        message: 'El plan ya estaba activado.',
        data: { fulfilled: true, source: intent.source },
      };
    }

    if (intent.source === 'company_admin') {
      const userId = intent.initiatedByUserId;
      const companyId = intent.companyId;
      if (!userId || !companyId) {
        throw new BadRequestException('Datos de checkout incompletos.');
      }
      const user = await this.userModel.findOne({ id: userId }).exec();
      if (!user) {
        throw new BadRequestException('Usuario que inició el pago no encontrado.');
      }
      await this.membershipsService.create(
        { companyId, planId: intent.planId },
        user,
      );
      intent.status = 'completed';
      await intent.save();
      return {
        message: 'Membresía activada correctamente.',
        data: { fulfilled: true, source: 'company_admin' },
      };
    }

    const inbox =
      this.configService.get<string>('CONTACT_DEMO_INBOX')?.trim() ||
      this.configService.get<string>('MAILER_EMAIL')?.trim();
    if (inbox) {
      await this.emailService.sendEmail({
        to: inbox,
        subject: `[Cheky] Pago landing — plan ${intent.planId} ref ${intent.ref}`,
        htmlBody: `<p>Se registró un pago aprobado desde la landing.</p>
          <ul>
            <li>Ref: ${intent.ref}</li>
            <li>Plan id: ${intent.planId}</li>
            <li>Monto: ${intent.amountTotal} ${intent.currency}</li>
            <li>Bold payment_link: ${intent.boldPaymentLinkId}</li>
          </ul>
          <p>Crea o vincula la empresa en el panel y activa la membresía si aplica.</p>`,
      });
    } else {
      this.logger.warn('Pago landing aprobado pero no hay CONTACT_DEMO_INBOX ni MAILER_EMAIL');
    }
    intent.status = 'completed';
    await intent.save();
    return {
      message:
        'Pago recibido. Nuestro equipo te contactará para activar tu cuenta en la plataforma.',
      data: { fulfilled: true, source: 'landing' },
    };
  }

  verifyWebhookSignature(rawBody: string, receivedSignature: string | undefined): boolean {
    const secretKey = this.getSecretKey();
    const hashed = crypto
      .createHmac('sha256', secretKey)
      .update(rawBody)
      .digest('hex');
    const hashedBuffer = Buffer.from(hashed, 'utf8');
    const signatureBuffer = Buffer.from(receivedSignature || '', 'utf8');
    if (!receivedSignature || hashedBuffer.length !== signatureBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(hashedBuffer, signatureBuffer);
  }

  /** Intenta cumplir el checkout si el webhook trae el id del payment link. */
  async tryFulfillFromWebhookBody(rawBody: string): Promise<void> {
    let paymentLinkId: string | undefined;
    try {
      const j = JSON.parse(rawBody) as Record<string, unknown>;
      paymentLinkId =
        (typeof j.payment_link === 'string' && j.payment_link) ||
        (typeof j.paymentLink === 'string' && j.paymentLink) ||
        undefined;
      const pay = j.payload;
      if (!paymentLinkId && pay && typeof pay === 'object') {
        const p = pay as Record<string, unknown>;
        paymentLinkId =
          (typeof p.payment_link === 'string' && p.payment_link) ||
          (typeof p.paymentLink === 'string' && p.paymentLink) ||
          undefined;
      }
    } catch {
      return;
    }
    if (!paymentLinkId) return;
    try {
      const remote = await this.fetchBoldPaymentStatus(paymentLinkId);
      if (!this.resolvePaidFromBoldPayload(remote)) return;
      await this.confirmByPaymentLink(paymentLinkId);
    } catch (e) {
      this.logger.warn(`Webhook fulfill skip: ${(e as Error).message}`);
    }
  }
}
