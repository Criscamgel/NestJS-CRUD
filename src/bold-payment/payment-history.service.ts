import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BoldCheckoutIntent } from './entities/bold-checkout-intent.entity';
import { Plan } from 'src/plans/entities/plan.entity';
import { User } from 'src/users/entities/user.entity';
import { Company } from 'src/company/entities/company.entity';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import {
  buildPaginationMeta,
  resolvePagination,
} from 'src/common/utils/pagination';
import { buildRegexOrFilter } from 'src/common/utils/mongo-search';

type PaymentHistoryRow = {
  ref: string;
  productName: string;
  characteristics: string;
  paidAt: string;
  amountTotal: number;
  currency: string;
  source: string;
  status: string;
  hasInvoice: boolean;
  companyName: string;
};

/**
 * Servicio para el historial de pagos administrativo.
 */
@Injectable()
export class PaymentHistoryService {
  constructor(
    @InjectModel(BoldCheckoutIntent.name)
    private readonly intentModel: Model<BoldCheckoutIntent>,
    @InjectModel(Plan.name)
    private readonly planModel: Model<Plan>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    @InjectModel(Company.name)
    private readonly companyModel: Model<Company>,
  ) {}

  /** Listado paginado de pagos completados. */
  async findAll(paginationQuery: PaginationQueryDto, requester: User) {
    const { page, limit, skip } = resolvePagination(paginationQuery);

    const requesterRoles = requester.roles || [];
    const isSuperAdmin = requesterRoles.includes('superAdmin');
    const isAdmin = requesterRoles.includes('admin');

    // Admin solo ve pagos de su empresa
    const companyFilter: Record<string, unknown> =
      isAdmin && !isSuperAdmin && requester.company
        ? { companyId: requester.company }
        : {};

    // Solo mostrar pagos completados
    const baseFilter: Record<string, unknown> = {
      status: 'completed',
      ...companyFilter,
    };

    // Buscar por referencia, planId y (solo superAdmin) nombre de empresa
    let searchFilter: Record<string, unknown> = {};
    const searchTerm = paginationQuery.search?.trim();
    if (searchTerm) {
      const regex = new RegExp(searchTerm, 'i');
      const orClauses: Record<string, unknown>[] = [
        { ref: regex },
        { planId: regex },
      ];

      if (isSuperAdmin) {
        const matchingCompanies = await this.companyModel
          .find({ name: regex })
          .select('id')
          .lean();
        const matchingCompanyIds = matchingCompanies.map((c) => c.id);
        if (matchingCompanyIds.length > 0) {
          orClauses.push({ companyId: { $in: matchingCompanyIds } });
        }
      }

      searchFilter = { $or: orClauses };
    }

    const filter =
      Object.keys(searchFilter).length > 0
        ? { $and: [baseFilter, searchFilter] }
        : baseFilter;

    const [data, total] = await Promise.all([
      this.intentModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.intentModel.countDocuments(filter),
    ]);

    // Enriquecer con nombres de plan
    const planIds = [...new Set(data.map((d) => d.planId).filter(Boolean))];
    const plans = await this.planModel
      .find({ id: { $in: planIds } })
      .select('id name maxChecksPerMonth durationMonths')
      .lean();
    const planMap = new Map(plans.map((p) => [p.id, p]));

    // Enriquecer con nombres de empresa
    const companyIds = [...new Set(data.map((d) => d.companyId).filter(Boolean))] as string[];
    const companies = await this.companyModel
      .find({ id: { $in: companyIds } })
      .select('id name')
      .lean();
    const companyMap = new Map(companies.map((c) => [c.id, c.name]));

    const rows: PaymentHistoryRow[] = data.map((intent) => {
      const plan = planMap.get(intent.planId);
      return {
        ref: intent.ref,
        productName: this.buildProductName(intent, plan),
        characteristics: this.buildCharacteristics(intent, plan),
        paidAt: (intent as { createdAt?: Date }).createdAt?.toISOString() ?? '',
        amountTotal: intent.amountTotal,
        currency: intent.currency ?? 'USD',
        source: intent.source,
        status: intent.status,
        hasInvoice: intent.status === 'completed',
        companyName: intent.companyId ? (companyMap.get(intent.companyId) ?? '—') : '—',
      };
    });

    return {
      data: rows,
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  /** Genera un PDF de factura para un pago. */
  async generateInvoicePdf(
    ref: string,
    requester: User,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const intent = await this.intentModel.findOne({ ref }).lean();
    if (!intent) {
      throw new NotFoundException('Pago no encontrado.');
    }

    // Validar acceso: admin solo su empresa
    const requesterRoles = requester.roles || [];
    const isSuperAdmin = requesterRoles.includes('superAdmin');
    if (!isSuperAdmin && intent.companyId !== requester.company) {
      throw new ForbiddenException('No tienes permiso para descargar esta factura.');
    }

    const plan = await this.planModel.findOne({ id: intent.planId }).lean();
    const productName = this.buildProductName(intent, plan);
    const characteristics = this.buildCharacteristics(intent, plan);

    // Generar PDF simple con la información de la factura
    const pdfContent = this.buildInvoiceHtml({
      ref: intent.ref,
      productName,
      characteristics,
      amount: intent.amountTotal,
      currency: intent.currency ?? 'USD',
      date: (intent as { createdAt?: Date }).createdAt ?? new Date(),
    });

    // Convertir HTML a un buffer PDF básico (texto plano formateado como PDF)
    const buffer = Buffer.from(pdfContent, 'utf-8');
    const filename = `factura-${ref}.pdf`;

    return { buffer, filename };
  }

  private buildProductName(
    intent: { source: string; planId: string; checksQuantity?: number; renewalMonths?: number },
    plan: { name?: string; durationMonths?: number } | null | undefined,
  ): string {
    const planName = plan?.name ?? `Plan ${intent.planId}`;

    switch (intent.source) {
      case 'checks_topup':
        return `Pack adicional de ${intent.checksQuantity ?? 0} checks`;
      case 'renewal': {
        const months = intent.renewalMonths ?? 1;
        return `${planName} — Renovación ${months} ${months === 1 ? 'mes' : 'meses'}`;
      }
      case 'company_admin':
      case 'landing': {
        const dur = plan?.durationMonths ?? 1;
        return `${planName} ${dur} ${dur === 1 ? 'mes' : 'meses'}`;
      }
      default:
        return planName;
    }
  }

  private buildCharacteristics(
    intent: { source: string; checksQuantity?: number; renewalMonths?: number },
    plan: { maxChecksPerMonth?: number; durationMonths?: number } | null | undefined,
  ): string {
    switch (intent.source) {
      case 'checks_topup':
        return `${intent.checksQuantity ?? 0} checks adicionales, sin vencimiento`;
      case 'renewal': {
        const months = intent.renewalMonths ?? 1;
        const checks = (plan?.maxChecksPerMonth ?? 0) * months;
        return `${checks} checks, ${months} ${months === 1 ? 'mes' : 'meses'}`;
      }
      case 'company_admin':
      case 'landing': {
        const dur = plan?.durationMonths ?? 1;
        const checks = (plan?.maxChecksPerMonth ?? 0) * dur;
        return `${checks} checks, ${dur} ${dur === 1 ? 'mes' : 'meses'}`;
      }
      default:
        return '—';
    }
  }

  private buildInvoiceHtml(params: {
    ref: string;
    productName: string;
    characteristics: string;
    amount: number;
    currency: string;
    date: Date;
  }): string {
    const dateStr = params.date.toLocaleDateString('es-CO', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return `
%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj
4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
5 0 obj
<</Length 600>>
stream
BT
/F1 24 Tf
50 720 Td
(FACTURA - CHEKY) Tj
/F1 12 Tf
0 -40 Td
(Referencia: ${params.ref}) Tj
0 -25 Td
(Fecha: ${dateStr}) Tj
0 -25 Td
(Producto: ${params.productName}) Tj
0 -25 Td
(Caracteristicas: ${params.characteristics}) Tj
0 -40 Td
/F1 16 Tf
(Total: $${params.amount.toLocaleString()} ${params.currency}) Tj
0 -40 Td
/F1 10 Tf
(Estado: Pagado) Tj
0 -25 Td
(Cheky - Verificacion de confiabilidad) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000340 00000 n 
trailer<</Size 6/Root 1 0 R>>
startxref
993
%%EOF`.trim();
  }
}
