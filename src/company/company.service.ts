import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Company } from './entities/company.entity';
import { CounterId } from 'src/common/entities/counter-id.entity';
import { isMongoDuplicateKeyError } from 'src/common/utils/mongo-errors';

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

      const company = await this.companyModel.create({
        ...createCompanyDto,
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

  async findAll() {
    return this.companyModel.find({ isActive: true });
  }

  async findOne(id: string) {
    const company = await this.companyModel.findOne({ id, isActive: true });
    if (!company) {
      throw new NotFoundException(`Compañía con id ${id} no encontrada`);
    }
    return company;
  }

  async update(id: string, updateCompanyDto: UpdateCompanyDto) {
    const company = await this.companyModel.findOneAndUpdate({ id }, updateCompanyDto, { new: true });
    if (!company) {
      throw new NotFoundException(`Compañía con id ${id} no encontrada`);
    }
    return company;
  }

  async remove(id: string) {
    const company = await this.companyModel.findOneAndUpdate({ id }, { isActive: false }, { new: true });
    if (!company) {
      throw new NotFoundException(`Compañía con id ${id} no encontrada`);
    }
    return { message: 'Compañía eliminada exitosamente' };
  }
}
