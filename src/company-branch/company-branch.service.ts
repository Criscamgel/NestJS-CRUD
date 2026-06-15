import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CompanyBranch } from './entities/company-branch.entity';
import { CounterId } from 'src/common/entities/counter-id.entity';
import { Company } from 'src/company/entities/company.entity';
import { CreateCompanyBranchDto } from './dto/create-company-branch.dto';
import { UpdateCompanyBranchDto } from './dto/update-company-branch.dto';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import {
  buildPaginationMeta,
  resolvePagination,
} from 'src/common/utils/pagination';
import { buildRegexOrFilter } from 'src/common/utils/mongo-search';
import type { User } from 'src/users/entities/user.entity';
import { BranchCatalogQueryDto } from './dto/branch-catalog-query.dto';
import { MembershipsService } from 'src/memberships/memberships.service';

@Injectable()
export class CompanyBranchService {
  constructor(
    @InjectModel(CompanyBranch.name)
    private readonly branchModel: Model<CompanyBranch>,
    @InjectModel(Company.name)
    private readonly companyModel: Model<Company>,
    @InjectModel(CounterId.name)
    private readonly counterIdModel: Model<CounterId>,
    private readonly membershipsService: MembershipsService,
  ) {}

  private isSuper(actor: User): boolean {
    const roles = actor.roles || [];
    const legacy = (actor as { role?: string }).role;
    return roles.includes('superAdmin') || legacy === 'superAdmin';
  }

  /**
   * SuperAdmin cualquier empresa; admin de empresa solo la suya.
   */
  assertManageCompany(actor: User, companyId: string): void {
    if (this.isSuper(actor)) return;
    const roles = actor.roles || [];
    const legacy = (actor as { role?: string }).role;
    const isAdmin = roles.includes('admin') || legacy === 'admin';
    const cid = companyId.trim();
    if (!isAdmin || !actor.company || String(actor.company).trim() !== cid) {
      throw new ForbiddenException(
        'No tienes permisos para administrar sedes de esta empresa.',
      );
    }
  }

  /**
   * Valida opcionalmente que la sede exista en la empresa. Devuelve `undefined` si no se envía id.
   */
  async findBranchNamesByIds(ids: string[]): Promise<Map<string, string>> {
    const uniq = [...new Set(ids.map((x) => String(x).trim()).filter(Boolean))];
    if (!uniq.length) return new Map();
    const rows = await this.branchModel
      .find({ id: { $in: uniq } })
      .select('id name')
      .lean();
    return new Map(rows.map((r) => [String(r.id), String(r.name ?? '')]));
  }

  async ensureBranchBelongsToCompany(
    branchId: string | null | undefined,
    companyId: string,
  ): Promise<string | undefined> {
    const cid = String(companyId).trim();
    if (branchId == null || branchId === '') return undefined;
    const bid = String(branchId).trim();
    const b = await this.branchModel
      .findOne({ id: bid, companyId: cid })
      .exec();
    if (!b) {
      throw new BadRequestException(
        'La sede no existe o no pertenece a la empresa indicada.',
      );
    }
    return bid;
  }

  private async assertCompanyExists(companyId: string): Promise<void> {
    const c = await this.companyModel.findOne({ id: companyId.trim() }).exec();
    if (!c) {
      throw new NotFoundException(`Compañía con id ${companyId} no encontrada`);
    }
  }

  async create(companyId: string, dto: CreateCompanyBranchDto, actor: User) {
    this.assertManageCompany(actor, companyId);
    await this.assertCompanyExists(companyId);
    await this.membershipsService.assertCanAddBranch(companyId);

    const counter = await this.counterIdModel.findByIdAndUpdate(
      'company_branches',
      { $inc: { seq: 1 } },
      { new: true, upsert: true },
    );

    const branch = await this.branchModel.create({
      id: counter.seq.toString(),
      companyId: companyId.trim(),
      name: dto.name.trim(),
      address: dto.address.trim(),
      city: dto.city.trim(),
      isActive: true,
    });

    return {
      message: 'Sede creada exitosamente',
      branch,
    };
  }

  async findAllForCompany(
    companyId: string,
    paginationQuery: PaginationQueryDto,
    actor?: User,
  ) {
    if (actor) {
      this.assertManageCompany(actor, companyId);
    }
    await this.assertCompanyExists(companyId);

    const { page, limit, skip } = resolvePagination(paginationQuery);
    const baseFilter: Record<string, unknown> = {
      companyId: companyId.trim(),
    };
    const searchFilter = buildRegexOrFilter<CompanyBranch>(
      paginationQuery.search,
      ['name', 'address', 'city'],
    );
    const filter = { ...baseFilter, ...searchFilter };

    const [data, total] = await Promise.all([
      this.branchModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.branchModel.countDocuments(filter),
    ]);

    return {
      data,
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  /** Listado paginado con filtros; admin limitado a su empresa. Incluye `companyName`. */
  async findCatalog(actor: User, query: BranchCatalogQueryDto) {
    const roles = actor.roles || [];
    const legacy = (actor as { role?: string }).role;
    const isSuper = this.isSuper(actor);
    const isAdmin =
      roles.includes('admin') || legacy === 'admin';

    if (!isSuper && !isAdmin) {
      throw new ForbiddenException('No tienes permisos para ver el catálogo de sedes.');
    }

    let scopedCompanyId: string | undefined;
    if (!isSuper) {
      scopedCompanyId = actor.company?.trim();
      if (!scopedCompanyId) {
        throw new ForbiddenException(
          'Tu cuenta no está vinculada a una empresa.',
        );
      }
      if (
        query.companyId?.trim() &&
        query.companyId.trim() !== scopedCompanyId
      ) {
        throw new ForbiddenException(
          'No puedes filtrar por otra empresa.',
        );
      }
    }

    const { page, limit, skip } = resolvePagination(query);
    const baseFilter: Record<string, unknown> = {};

    if (scopedCompanyId) {
      baseFilter.companyId = scopedCompanyId;
    } else if (query.companyId?.trim()) {
      baseFilter.companyId = query.companyId.trim();
    }

    if (query.city?.trim()) {
      baseFilter.city = query.city.trim();
    }

    const searchFilter = buildRegexOrFilter<CompanyBranch>(query.search, [
      'name',
      'address',
    ]);

    let filter: Record<string, unknown> = {};
    if (
      Object.keys(searchFilter).length > 0 &&
      Object.keys(baseFilter).length > 0
    ) {
      filter = { $and: [baseFilter, searchFilter] };
    } else {
      filter = { ...baseFilter, ...searchFilter };
    }

    const [docs, total] = await Promise.all([
      this.branchModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.branchModel.countDocuments(filter),
    ]);

    const companyIds = [...new Set(docs.map((d) => String(d.companyId)))];
    const companies =
      companyIds.length > 0
        ? await this.companyModel
            .find({ id: { $in: companyIds } })
            .select('id name')
            .lean()
        : [];
    const nameByCompany = new Map(companies.map((c) => [String(c.id), c.name]));

    const data = docs.map((b) => ({
      ...b,
      companyName: nameByCompany.get(String(b.companyId)) ?? '',
    }));

    return {
      data,
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  async findOne(companyId: string, branchId: string, actor: User) {
    this.assertManageCompany(actor, companyId);
    await this.assertCompanyExists(companyId);
    const branch = await this.branchModel
      .findOne({
        id: branchId.trim(),
        companyId: companyId.trim(),
      })
      .exec();
    if (!branch) {
      throw new NotFoundException(
        `Sede con id ${branchId} no encontrada para esta empresa`,
      );
    }
    return branch;
  }

  async update(
    companyId: string,
    branchId: string,
    dto: UpdateCompanyBranchDto,
    actor: User,
  ) {
    this.assertManageCompany(actor, companyId);
    await this.findOne(companyId, branchId, actor);

    const patch: Record<string, unknown> = {};
    if (dto.name !== undefined) patch.name = dto.name.trim();
    if (dto.address !== undefined) patch.address = dto.address.trim();
    if (dto.city !== undefined) patch.city = dto.city.trim();

    const branch = await this.branchModel
      .findOneAndUpdate({ id: branchId.trim(), companyId: companyId.trim() }, patch, {
        new: true,
      })
      .exec();
    if (!branch) {
      throw new NotFoundException(`Sede con id ${branchId} no encontrada`);
    }

    return {
      message: 'Sede actualizada exitosamente',
      branch,
    };
  }

  async toggleStatus(companyId: string, branchId: string, actor: User) {
    this.assertManageCompany(actor, companyId);
    const branch = await this.branchModel
      .findOne({ id: branchId.trim(), companyId: companyId.trim() })
      .exec();
    if (!branch) {
      throw new NotFoundException(`Sede con id ${branchId} no encontrada`);
    }

    branch.isActive = !branch.isActive;
    await branch.save();

    return {
      message: `Sede ${branch.isActive ? 'activada' : 'desactivada'} exitosamente`,
      branch,
    };
  }
}
