import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Check } from './entities/check.entity';
import { MembershipsService } from 'src/memberships/memberships.service';
import {
  riskLevelFromIndex,
  TRUST_SCORE_RELIABLE_MIN,
} from './constants/trust-score.constants';

const COLOMBIA_TZ = 'America/Bogota';
const MS_PER_DAY = 86_400_000;

export type WeeklyRequestPoint = {
  date: string;
  label: string;
  count: number;
};

export type FraudTrendPoint = {
  date: string;
  label: string;
  total: number;
  fraudCount: number;
  fraudRatePercent: number;
};

export type CityRiskItem = {
  city: string;
  checkCount: number;
  averageRiskIndex: number;
  level: 'high' | 'medium' | 'low';
};

export type CompanyCheckAnalytics = {
  weeklyRequests: WeeklyRequestPoint[];
  summary: {
    totalChecks: number;
    checksWithScore: number;
    reliableCount: number;
    reliablePercent: number | null;
    notReliableCount: number;
    notReliablePercent: number | null;
    averageRiskIndex: number | null;
    fraudDetectedCount: number;
    fraudRatePercent: number | null;
    reliableScoreMin: number;
  };
  fraudTrend30d: FraudTrendPoint[];
  citiesRisk: {
    enabled: boolean;
    items: CityRiskItem[];
  };
  lastUpdatedAt: string;
};

@Injectable()
export class CheckAnalyticsService {
  constructor(
    @InjectModel(Check.name)
    private readonly checkModel: Model<Check>,
    private readonly membershipsService: MembershipsService,
  ) {}

  private normalizeCompanyId(companyId: string): string {
    return String(companyId ?? '').trim();
  }

  private companyIdFilter(companyId: string): Record<string, unknown> {
    const cid = this.normalizeCompanyId(companyId);
    if (!cid) return { companyId: '__invalid__' };
    if (/^\d+$/.test(cid)) {
      return { companyId: { $in: [cid, Number(cid)] } };
    }
    return { companyId: cid };
  }

  private calendarDayKeyInBogota(date: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: COLOMBIA_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  private shortDayLabel(date: Date): string {
    const wd = new Intl.DateTimeFormat('en-US', {
      timeZone: COLOMBIA_TZ,
      weekday: 'short',
    }).format(date);
    const map: Record<string, string> = {
      Sun: 'Dom',
      Mon: 'Lun',
      Tue: 'Mar',
      Wed: 'Mié',
      Thu: 'Jue',
      Fri: 'Vie',
      Sat: 'Sáb',
    };
    return map[wd] ?? wd;
  }

  private buildLastNDaysSeries(
    days: number,
    countsByDate: Map<string, number>,
  ): { date: string; label: string; count: number }[] {
    const now = new Date();
    const out: { date: string; label: string; count: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * MS_PER_DAY);
      const key = this.calendarDayKeyInBogota(d);
      out.push({
        date: key,
        label: this.shortDayLabel(d),
        count: countsByDate.get(key) ?? 0,
      });
    }
    return out;
  }

  private roundPercent(part: number, total: number): number | null {
    if (total <= 0) return null;
    return Math.round((part / total) * 1000) / 10;
  }

  async getCompanyAnalytics(companyId: string): Promise<CompanyCheckAnalytics> {
    const cid = this.normalizeCompanyId(companyId);
    const companyMatch = this.companyIdFilter(cid);
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 6 * MS_PER_DAY);
    const thirtyDaysAgo = new Date(now.getTime() - 29 * MS_PER_DAY);

    const [weeklyAgg, summaryAgg, fraudAgg, branchesEnabled] = await Promise.all([
      this.checkModel
        .aggregate<{ _id: string; count: number }>([
          {
            $match: {
              ...companyMatch,
              createdAt: { $gte: sevenDaysAgo },
            },
          },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$createdAt',
                  timezone: COLOMBIA_TZ,
                },
              },
              count: { $sum: 1 },
            },
          },
        ])
        .exec(),
      this.checkModel
        .aggregate<{
          total: number;
          withScore: number;
          reliable: number;
          riskSum: number;
        }>([
          { $match: companyMatch },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              withScore: {
                $sum: {
                  $cond: [{ $ne: ['$trustScore', null] }, 1, 0],
                },
              },
              reliable: {
                $sum: {
                  $cond: [
                    { $gte: ['$trustScore', TRUST_SCORE_RELIABLE_MIN] },
                    1,
                    0,
                  ],
                },
              },
              riskSum: {
                $sum: {
                  $cond: [
                    { $ne: ['$trustScore', null] },
                    '$trustScore',
                    0,
                  ],
                },
              },
            },
          },
        ])
        .exec(),
      this.checkModel
        .aggregate<{
          _id: string;
          total: number;
          fraud: number;
        }>([
          {
            $match: {
              ...companyMatch,
              createdAt: { $gte: thirtyDaysAgo },
            },
          },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$createdAt',
                  timezone: COLOMBIA_TZ,
                },
              },
              total: { $sum: 1 },
              fraud: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $ne: ['$trustScore', null] },
                        { $lt: ['$trustScore', TRUST_SCORE_RELIABLE_MIN] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ])
        .exec(),
      this.membershipsService.isBranchesAnalyticsEnabledForCompany(cid),
    ]);

    const weeklyMap = new Map(
      weeklyAgg.map((r) => [String(r._id), r.count] as const),
    );
    const weeklyRequests = this.buildLastNDaysSeries(7, weeklyMap);

    const s = summaryAgg[0];
    const totalChecks = s?.total ?? 0;
    const checksWithScore = s?.withScore ?? 0;
    const reliableCount = s?.reliable ?? 0;
    const notReliableCount = Math.max(0, checksWithScore - reliableCount);
    const averageRiskIndex =
      checksWithScore > 0
        ? Math.round((s?.riskSum ?? 0) / checksWithScore)
        : null;

    const fraudByDate = new Map(
      fraudAgg.map((r) => [String(r._id), r] as const),
    );
    const fraudTrend30d: FraudTrendPoint[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * MS_PER_DAY);
      const key = this.calendarDayKeyInBogota(d);
      const row = fraudByDate.get(key);
      const total = row?.total ?? 0;
      const fraudCount = row?.fraud ?? 0;
      fraudTrend30d.push({
        date: key,
        label: new Intl.DateTimeFormat('es-CO', {
          timeZone: COLOMBIA_TZ,
          day: 'numeric',
          month: 'short',
        }).format(d),
        total,
        fraudCount,
        fraudRatePercent: total > 0 ? Math.round((fraudCount / total) * 1000) / 10 : 0,
      });
    }

    let citiesRisk: CompanyCheckAnalytics['citiesRisk'] = {
      enabled: branchesEnabled,
      items: [],
    };

    if (branchesEnabled) {
      const cityAgg = await this.checkModel
        .aggregate<{
          _id: string;
          checkCount: number;
          riskSum: number;
          scored: number;
        }>([
          { $match: companyMatch },
          {
            $lookup: {
              from: 'users',
              localField: 'createdByUserId',
              foreignField: 'id',
              as: 'creator',
            },
          },
          { $unwind: { path: '$creator', preserveNullAndEmptyArrays: false } },
          {
            $match: {
              'creator.branchId': { $exists: true, $nin: [null, ''] },
            },
          },
          {
            $lookup: {
              from: 'companybranches',
              localField: 'creator.branchId',
              foreignField: 'id',
              as: 'branch',
            },
          },
          { $unwind: { path: '$branch', preserveNullAndEmptyArrays: false } },
          {
            $group: {
              _id: '$branch.city',
              checkCount: { $sum: 1 },
              riskSum: {
                $sum: {
                  $cond: [
                    { $ne: ['$trustScore', null] },
                    '$trustScore',
                    0,
                  ],
                },
              },
              scored: {
                $sum: {
                  $cond: [{ $ne: ['$trustScore', null] }, 1, 0],
                },
              },
            },
          },
          { $match: { _id: { $ne: null } } },
          {
            $addFields: {
              averageRiskIndex: {
                $cond: [
                  { $gt: ['$scored', 0] },
                  { $round: [{ $divide: ['$riskSum', '$scored'] }, 0] },
                  0,
                ],
              },
            },
          },
          { $sort: { avgRisk: -1, checkCount: -1 } },
          { $limit: 10 },
        ])
        .exec();

      citiesRisk = {
        enabled: true,
        items: cityAgg.map((c) => {
          const avg =
            c.scored > 0 ? Math.round(c.riskSum / c.scored) : 0;
          return {
            city: String(c._id).trim(),
            checkCount: c.checkCount,
            averageRiskIndex: avg,
            level: riskLevelFromIndex(avg),
          };
        }),
      };
    }

    return {
      weeklyRequests,
      summary: {
        totalChecks,
        checksWithScore,
        reliableCount,
        reliablePercent: this.roundPercent(reliableCount, checksWithScore),
        notReliableCount,
        notReliablePercent: this.roundPercent(notReliableCount, checksWithScore),
        averageRiskIndex,
        fraudDetectedCount: notReliableCount,
        fraudRatePercent: this.roundPercent(notReliableCount, checksWithScore),
        reliableScoreMin: TRUST_SCORE_RELIABLE_MIN,
      },
      fraudTrend30d,
      citiesRisk,
      lastUpdatedAt: now.toISOString(),
    };
  }
}
