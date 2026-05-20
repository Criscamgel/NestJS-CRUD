import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { BoldCheckoutIntent } from './entities/bold-checkout-intent.entity';
import { BlacklistedToken } from 'src/auth/entities/blacklisted-token.entity';
import { AuthService } from 'src/auth/auth.service';
import { EmailService } from 'src/email/email.service';
import {
  getEmailLogoAttachment,
  landingAdminOnboardingEmailTemplate,
  landingPlanThankYouEmailTemplate,
} from 'src/email/email-templates.helper';
import { PlansService } from 'src/plans/plans.service';
import { COMPANY_CITIES_CATALOG } from 'src/common/catalog/company-cities.catalog';
import { COMPANY_SECTORS_CATALOG } from 'src/common/catalog/company-sectors.catalog';
import { CompanyService } from 'src/company/company.service';
import { UsersService } from 'src/users/users.service';
import { MembershipsService } from 'src/memberships/memberships.service';
import { getFrontendBaseUrl, normalizeAuthEmail } from 'src/auth/auth.utils';
import { normalizePlanCurrency } from 'src/common/utils/money.util';
import {
  CompleteLandingOnboardingDto,
  RequestLandingAdminOnboardingDto,
} from './dto/landing-onboarding.dto';

const LANDING_ONBOARDING_JWT_TYP = 'landing_admin_onboarding';

type LandingOnboardingClaims = {
  typ?: string;
  ref?: string;
  email?: string;
  planId?: string;
  jti?: string;
  exp?: number;
};

@Injectable()
export class LandingOnboardingService {
  constructor(
    @InjectModel(BoldCheckoutIntent.name)
    private readonly intentModel: Model<BoldCheckoutIntent>,
    @InjectModel(BlacklistedToken.name)
    private readonly blacklistedTokenModel: Model<BlacklistedToken>,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
    private readonly companyService: CompanyService,
    private readonly usersService: UsersService,
    private readonly membershipsService: MembershipsService,
    private readonly authService: AuthService,
    private readonly plansService: PlansService,
  ) {}

  private catalogLabel(
    catalog: { id: string; label: string }[],
    id: string,
  ): string {
    return catalog.find((o) => o.id === id)?.label ?? id;
  }

  private async assertTokenUsable(token: string): Promise<LandingOnboardingClaims> {
    const bl = await this.blacklistedTokenModel.findOne({ token }).lean();
    if (bl) {
      throw new UnauthorizedException(
        'No tiene los permisos suficientes para acceder a este recurso',
      );
    }
    let decoded: LandingOnboardingClaims;
    try {
      decoded = this.jwtService.verify(token) as LandingOnboardingClaims;
    } catch {
      throw new UnauthorizedException(
        'No tiene los permisos suficientes para acceder a este recurso',
      );
    }
    if (decoded.typ !== LANDING_ONBOARDING_JWT_TYP || !decoded.ref || !decoded.email) {
      throw new UnauthorizedException(
        'No tiene los permisos suficientes para acceder a este recurso',
      );
    }
    return decoded;
  }

  private async loadIntentForOnboarding(
    decoded: LandingOnboardingClaims,
  ): Promise<BoldCheckoutIntent> {
    const intent = await this.intentModel.findOne({ ref: decoded.ref }).exec();
    if (!intent) {
      throw new UnauthorizedException(
        'No tiene los permisos suficientes para acceder a este recurso',
      );
    }
    if (intent.source !== 'landing' || intent.status !== 'completed') {
      throw new UnauthorizedException(
        'No tiene los permisos suficientes para acceder a este recurso',
      );
    }
    if (intent.landingOnboardingCompletedAt) {
      throw new UnauthorizedException(
        'No tiene los permisos suficientes para acceder a este recurso',
      );
    }
    const emailNorm = normalizeAuthEmail(String(decoded.email));
    const stored = intent.landingOnboardingEmail?.trim();
    if (!stored || normalizeAuthEmail(stored) !== emailNorm) {
      throw new UnauthorizedException(
        'No tiene los permisos suficientes para acceder a este recurso',
      );
    }
    if (String(decoded.planId ?? '').trim() !== String(intent.planId).trim()) {
      throw new UnauthorizedException(
        'No tiene los permisos suficientes para acceder a este recurso',
      );
    }
    return intent;
  }

  async requestAdminOnboarding(dto: RequestLandingAdminOnboardingDto) {
    const paymentLink = dto.paymentLink.trim();
    const emailNorm = normalizeAuthEmail(dto.email);

    const intent = await this.intentModel
      .findOne({ boldPaymentLinkId: paymentLink })
      .exec();
    if (!intent) {
      throw new BadRequestException('No hay una orden de pago asociada a este enlace.');
    }
    if (intent.source !== 'landing') {
      throw new BadRequestException('Esta orden no corresponde a un pago desde la landing.');
    }
    if (intent.status !== 'completed') {
      throw new BadRequestException(
        'El pago debe estar confirmado antes de solicitar el correo de registro.',
      );
    }
    if (intent.landingOnboardingCompletedAt) {
      throw new BadRequestException(
        'Este pago ya fue utilizado para crear la cuenta. Inicia sesión en la plataforma.',
      );
    }
    if (
      intent.landingOnboardingEmail &&
      normalizeAuthEmail(intent.landingOnboardingEmail) !== emailNorm
    ) {
      throw new ConflictException(
        'Para este pago ya se indicó otro correo. Usa el mismo correo o contacta soporte.',
      );
    }

    await this.usersService.assertEmailAvailable(emailNorm);

    intent.landingOnboardingEmail = emailNorm;
    await intent.save();

    const token = this.jwtService.sign(
      {
        typ: LANDING_ONBOARDING_JWT_TYP,
        ref: intent.ref,
        email: emailNorm,
        planId: String(intent.planId),
        jti: crypto.randomUUID(),
      },
      { expiresIn: '72h' },
    );

    const base = getFrontendBaseUrl().replace(/\/+$/, '');
    const onboardingLink = `${base}/auth/complete-landing-admin?token=${encodeURIComponent(token)}`;
    const planDoc = await this.plansService.findOneById(String(intent.planId));
    if (!planDoc) {
      throw new BadRequestException(
        'No se encontró el plan asociado al pago. Contacta a ventas@cheky.co.',
      );
    }
    const totalCharge = Math.round(
      Number(planDoc.monthlyPrice) * Number(planDoc.durationMonths),
    );
    const currency = normalizePlanCurrency(planDoc.currency);

    const onboardingHtml = landingAdminOnboardingEmailTemplate(onboardingLink);
    const thankYouHtml = landingPlanThankYouEmailTemplate({
      planName: planDoc.name,
      monthlyPrice: planDoc.monthlyPrice,
      currency,
      durationMonths: planDoc.durationMonths,
      maxUsers: planDoc.maxUsers,
      maxChecksPerMonth: planDoc.maxChecksPerMonth,
      totalCharge,
    });
    const logoAtt = getEmailLogoAttachment();
    const attachments = logoAtt ? [logoAtt] : [];

    const [sentOnboarding, sentThankYou] = await Promise.all([
      this.emailService.sendEmail({
        to: dto.email.trim(),
        subject: 'Cheky — Instrucciones para completar tu registro',
        htmlBody: onboardingHtml,
        attachements: attachments,
      }),
      this.emailService.sendEmail({
        to: dto.email.trim(),
        subject: 'Cheky — Gracias por tu compra',
        htmlBody: thankYouHtml,
        attachements: attachments,
      }),
    ]);

    if (!sentOnboarding || !sentThankYou) {
      throw new BadRequestException(
        'No se pudieron enviar los correos. Intenta de nuevo en unos minutos.',
      );
    }

    return {
      success: true,
      message:
        'Te enviamos dos correos: uno con el enlace de registro y otro con el detalle de tu plan. Revisa también la carpeta de spam.',
      timestamp: new Date().toISOString(),
    };
  }

  async verifyOnboardingToken(token: string) {
    const decoded = await this.assertTokenUsable(token);
    await this.loadIntentForOnboarding(decoded);
    return {
      success: true,
      data: {
        email: normalizeAuthEmail(String(decoded.email)),
        planId: String(decoded.planId ?? '').trim(),
      },
    };
  }

  async completeOnboarding(dto: CompleteLandingOnboardingDto) {
    if (dto.password !== dto.verifyPassword) {
      throw new BadRequestException('Las contraseñas no coinciden');
    }
    const token = dto.token.trim();
    const decoded = await this.assertTokenUsable(token);
    const intent = await this.loadIntentForOnboarding(decoded);

    const emailNorm = normalizeAuthEmail(String(decoded.email));
    await this.usersService.assertEmailAvailable(emailNorm);

    const cityId = dto.company.city.trim();
    const sectorId = dto.company.sector.trim();

    const { company } = await this.companyService.create({
      name: dto.company.name.trim(),
      nit: dto.company.nit.trim(),
      city: this.catalogLabel(COMPANY_CITIES_CATALOG, cityId),
      sector: this.catalogLabel(COMPANY_SECTORS_CATALOG, sectorId),
      legalRepresentativeName: dto.company.legalRepresentativeName.trim(),
      idNumber: dto.company.idNumber.trim(),
      phoneNumber: dto.company.phoneNumber.trim(),
      email: dto.company.email.trim().toLowerCase(),
      chamberOfCommerceRenewalDate: dto.company.chamberOfCommerceRenewalDate.trim(),
    });
    const companyId = String((company as { id?: string }).id ?? '');

    await this.usersService.createLandingPaidAdminUser({
      email: emailNorm,
      document: dto.document.trim(),
      name: dto.name.trim(),
      lastName: dto.lastName.trim(),
      password: dto.password,
      companyId,
    });

    await this.membershipsService.createMembershipAfterPaidLanding(
      companyId,
      String(intent.planId),
    );

    intent.landingOnboardingCompletedAt = new Date();
    await intent.save();

    await this.authService.logout(token);

    return {
      success: true,
      message:
        'Registro completado. Ya puedes iniciar sesión con tu correo y contraseña.',
    };
  }
}
