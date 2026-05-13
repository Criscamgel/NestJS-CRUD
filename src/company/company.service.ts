import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Company } from './entities/company.entity';
import { CounterId } from 'src/common/entities/counter-id.entity';
import { isMongoDuplicateKeyError } from 'src/common/utils/mongo-errors';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import {
  buildPaginationMeta,
  resolvePagination,
} from 'src/common/utils/pagination';
import { buildRegexOrFilter } from 'src/common/utils/mongo-search';

@Injectable()
export class CompanyService {
  constructor(
    @InjectModel(Company.name)
    private readonly companyModel: Model<Company>,
    @InjectModel(CounterId.name)
    private readonly counterIdModel: Model<CounterId>,
  ) {}

  async create(createCompanyDto: CreateCompanyDto) {
    try {
      const counter = await this.counterIdModel.findByIdAndUpdate(
        'companies',
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );

      const {
        chamberOfCommerceRenewalDate,
        email,
        name,
        nit,
        city,
        sector,
        legalRepresentativeName,
        idNumber,
        phoneNumber,
      } = createCompanyDto;

      const company = await this.companyModel.create({
        name: name.trim(),
        nit: nit.trim(),
        city: city.trim(),
        sector: sector.trim(),
        legalRepresentativeName: legalRepresentativeName.trim(),
        idNumber: idNumber.trim(),
        phoneNumber: phoneNumber.trim(),
        email: email.trim().toLowerCase(),
        chamberOfCommerceRenewalDate: new Date(chamberOfCommerceRenewalDate),
        id: counter.seq.toString(),
      });

      return {
        message: 'Compañía creada exitosamente',
        company,
      };
    } catch (error) {
      if (isMongoDuplicateKeyError(error)) {
        throw new BadRequestException('Ya existe una compañía con este NIT.');
      }
      throw new BadRequestException('Error al crear la compañía');
    }
  }

  async findAll(paginationQuery: PaginationQueryDto) {
    const { page, limit, skip } = resolvePagination(paginationQuery);
    const filter = buildRegexOrFilter<Company>(paginationQuery.search, [
      'name',
      'nit',
      'legalRepresentativeName',
    ]);
    const [data, total] = await Promise.all([
      this.companyModel.find(filter).skip(skip).limit(limit).exec(),
      this.companyModel.countDocuments(filter),
    ]);
    return {
      data,
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  async findOne(id: string) {
    const company = await this.companyModel.findOne({ id, isActive: { $ne: false } }).exec();
    if (!company) {
      throw new NotFoundException(`Compañía con id ${id} no encontrada`);
    }
    return company;
  }

  async update(id: string, updateCompanyDto: UpdateCompanyDto) {
    const patch: Record<string, unknown> = { ...updateCompanyDto };
    if (patch.email !== undefined && typeof patch.email === 'string') {
      patch.email = patch.email.trim().toLowerCase();
    }
    if (
      patch.chamberOfCommerceRenewalDate !== undefined &&
      typeof patch.chamberOfCommerceRenewalDate === 'string'
    ) {
      patch.chamberOfCommerceRenewalDate = new Date(
        patch.chamberOfCommerceRenewalDate,
      );
    }
    const company = await this.companyModel.findOneAndUpdate({ id }, patch, {
      new: true,
    });
    if (!company) {
      throw new NotFoundException(`Compañía con id ${id} no encontrada`);
    }
    return company;
  }

  async toggleStatus(id: string) {
    const company = await this.companyModel.findOne({ id });
    if (!company) {
      throw new NotFoundException(`Compañía con id ${id} no encontrada`);
    }
    
    company.isActive = !company.isActive;
    await company.save();
    
    return { message: `Compañía ${company.isActive ? 'activada' : 'desactivada'} exitosamente` };
  }
}
