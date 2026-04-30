import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Membership } from 'src/memberships/entities/membership.entity';
import { MembershipStatus } from 'src/memberships/membership-status.enum';
import { Company } from 'src/company/entities/company.entity';
import { Plan } from 'src/plans/entities/plan.entity';
import { Check } from 'src/check/entities/check.entity';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import {
  buildPaginationMeta,
  resolvePagination,
} from 'src/common/utils/pagination';
import { escapeRegex } from 'src/common/utils/mongo-search';

export type SuperAdminMembershipRowDto = {
  membershipId: string;
  companyId: string;
  companyName: string;
  nit: string;
  planName: string;
  startedAt: string;
  expiresAt: string;
  status: MembershipStatus;
};

export type SuperAdminDashboardStatsDto = {
  companiesTotal: number;
  checksTotal: number;
  activePlansTotal: number;
  checksThisMonth: number;
  checksLastMonth: number;
  membershipsThisMonth: number;
  membershipsLastMonth: number;
};

@Injectable()
export class SuperAdminDashboardService {
  constructor(
    @InjectModel(Membership.name)
    private readonly membershipModel: Model<Membership>,
    @InjectModel(Company.name)
    private readonly companyModel: Model<Company>,
    @InjectModel(Plan.name)
    private readonly planModel: Model<Plan>,
    @InjectModel(Check.name)
    private readonly checkModel: Model<Check>,
  ) {}

  async getStats(): Promise<SuperAdminDashboardStatsDto> {
    const now = new Date();
    const y = now.getFullYear();
    const mo = now.getMonth();
    const startThisMonth = new Date(y, mo, 1);
    const startLastMonth = new Date(y, mo - 1, 1);
    const endLastMonth = startThisMonth;

    const [
      companiesTotal,
      checksTotal,
      activePlansTotal,
      checksThisMonth,
      checksLastMonth,
      membershipsThisMonth,
      membershipsLastMonth,
    ] = await Promise.all([
      this.companyModel.countDocuments({ isActive: { $ne: false } }),
      this.checkModel.countDocuments({}),
      this.planModel.countDocuments({ isActive: true }),
      this.checkModel.countDocuments({ createdAt: { $gte: startThisMonth } }),
      this.checkModel.countDocuments({
        createdAt: { $gte: startLastMonth, $lt: endLastMonth },
      }),
      this.membershipModel.countDocuments({
        startedAt: { $gte: startThisMonth },
      }),
      this.membershipModel.countDocuments({
        startedAt: { $gte: startLastMonth, $lt: endLastMonth },
      }),
    ]);

    return {
      companiesTotal,
      checksTotal,
      activePlansTotal,
      checksThisMonth,
      checksLastMonth,
      membershipsThisMonth,
      membershipsLastMonth,
    };
  }

  private companyIdMatchVariants(companyId: string): Record<string, unknown> {
    const cid = String(companyId ?? '').trim();
    if (!cid) return { companyId: '__none__' };
    if (/^\d+$/.test(cid)) {
      const n = Number(cid);
      return { companyId: { $in: [cid, n] } };
    }
    return { companyId: cid };
  }

  private async buildMembershipFilter(
    search?: string,
  ): Promise<Record<string, unknown>> {
    const term = search?.trim();
    if (!term) {
      return {};
    }
    const pattern = escapeRegex(term);
    const re = new RegExp(pattern, 'i');

    const companies = await this.companyModel
      .find({
        $or: [{ name: re }, { nit: re }],
      })
      .select('id')
      .lean()
      .exec();

    const orClauses: Record<string, unknown>[] = [
      { id: { $regex: pattern, $options: 'i' } },
    ];

    for (const c of companies) {
      const raw = c.id;
      orClauses.push(this.companyIdMatchVariants(String(raw)));
    }

    return { $or: orClauses };
  }

  async getMembershipTable(paginationQuery: PaginationQueryDto): Promise<{
    data: SuperAdminMembershipRowDto[];
    meta: ReturnType<typeof buildPaginationMeta>;
  }> {
    const { page, limit, skip } = resolvePagination(paginationQuery);
    const filter = await this.buildMembershipFilter(paginationQuery.search);

    const [rawList, total] = await Promise.all([
      this.membershipModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.membershipModel.countDocuments(filter),
    ]);

    const companyKeys = new Set<string>();
    const planKeys = new Set<string>();
    for (const m of rawList) {
      companyKeys.add(String(m.companyId));
      planKeys.add(String(m.planId));
    }

    const companyIds = [...companyKeys];
    const planIds = [...planKeys];

    const [companies, plans] = await Promise.all([
      companyIds.length
        ? this.companyModel.find({ id: { $in: companyIds } }).lean().exec()
        : [],
      planIds.length
        ? this.planModel.find({ id: { $in: planIds } }).lean().exec()
        : [],
    ]);

    const companyById = new Map<string, Company>();
    for (const co of companies) {
      companyById.set(String(co.id), co as Company);
    }
    const planById = new Map<string, Plan>();
    for (const p of plans) {
      planById.set(String(p.id), p as Plan);
    }

    const data: SuperAdminMembershipRowDto[] = rawList.map((m) => {
      const cid = String(m.companyId);
      const co =
        companyById.get(cid) ??
        companyById.get(String(Number(cid))) ??
        null;
      const pid = String(m.planId);
      const pl = planById.get(pid) ?? planById.get(String(Number(pid)));
      return {
        membershipId: String(m.id),
        companyId: cid,
        companyName: co?.name?.trim() || `Empresa ${cid}`,
        nit: co?.nit?.trim() || '—',
        planName: pl?.name?.trim() || `Plan ${pid}`,
        startedAt:
          m.startedAt instanceof Date
            ? m.startedAt.toISOString()
            : new Date(m.startedAt).toISOString(),
        expiresAt:
          m.expiresAt instanceof Date
            ? m.expiresAt.toISOString()
            : new Date(m.expiresAt).toISOString(),
        status: m.status as MembershipStatus,
      };
    });

    return {
      data,
      meta: buildPaginationMeta(total, page, limit),
    };
  }
}
