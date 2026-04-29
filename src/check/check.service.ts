import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateCheckDto } from './dto/create-check.dto';
import { UpdateCheckDto } from './dto/update-check.dto';
import { Model } from 'mongoose';
import { Check } from './entities/check.entity';
import { AxiosAdapter } from 'src/common/adapters/axios.adapter';
import { FootPrint } from './interfaces/footPrint.interface';
import { InjectModel } from '@nestjs/mongoose';
import { CounterId } from 'src/common/entities/counter-id.entity';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import {
  buildPaginationMeta,
  resolvePagination,
} from 'src/common/utils/pagination';
import { buildRegexOrFilter } from 'src/common/utils/mongo-search';
import { MembershipsService } from 'src/memberships/memberships.service';
import { User } from 'src/users/entities/user.entity';

@Injectable()
export class CheckService {

  constructor(
    @InjectModel(Check.name)
    private readonly checkModel: Model<Check>,
    @InjectModel(CounterId.name)
    private readonly counterIdModel: Model<any>,
    private readonly http: AxiosAdapter,
    private readonly membershipsService: MembershipsService,
  ) {}

  private isSuperAdminActor(actor: User): boolean {
    const actorRoles = actor.roles || [];
    const actorLegacy = (actor as { role?: string }).role;
    return actorRoles.includes('superAdmin') || actorLegacy === 'superAdmin';
  }

  private buildFindAllFilter(
    paginationQuery: PaginationQueryDto,
    actor: User,
  ): Record<string, unknown> {
    const searchFilter = buildRegexOrFilter<Check>(paginationQuery.search, [
      'name',
      'lastName',
      'email',
      'mobile',
    ]);
    const scope = this.isSuperAdminActor(actor)
      ? {}
      : { createdByUserId: actor.id };

    if (!Object.keys(searchFilter).length) {
      return scope;
    }
    if (!Object.keys(scope).length) {
      return searchFilter;
    }
    return { $and: [scope, searchFilter] };
  }

  private assertCanAccessCheck(
    check: (Check & { createdByUserId?: string }) | null,
    actor: User,
  ): Check & { createdByUserId?: string } {
    if (!check) {
      throw new NotFoundException('Check no encontrado.');
    }
    if (this.isSuperAdminActor(actor)) {
      return check;
    }
    const ownerId = check.createdByUserId;
    if (!ownerId) {
      throw new ForbiddenException('No tienes permiso para acceder a este check.');
    }
    if (ownerId !== actor.id) {
      throw new ForbiddenException('No tienes permiso para acceder a este check.');
    }
    return check;
  }

  async create(createCheckDto: CreateCheckDto, actor: User) {
      const isSuperAdmin = this.isSuperAdminActor(actor);

      if (!isSuperAdmin) {
        if (!actor.company) {
          throw new BadRequestException(
            'Tu usuario debe estar asociado a una compañía para crear checks.',
          );
        }
        await this.membershipsService.syncMonthForCompany(actor.company);
        await this.membershipsService.assertCheckLimits(actor.company);
      }

      try {

        const counter = await this.counterIdModel.findByIdAndUpdate(
        'checks',  // ID del contador
        { $inc: { seq: 1 } },  // Incrementa +1
        { new: true, upsert: true },  // Crea si no existe, devuelve nuevo valor
      );

        createCheckDto.id = counter.seq.toString();

        const bodyRiskSeal = {
          id: createCheckDto.id,
          name: createCheckDto.name,
          lastName: createCheckDto.lastName,
          email: createCheckDto.email,
          mobile: createCheckDto.mobile,
        };

        const data = await this.http.post<FootPrint>(
          process.env.REQUEST_RISKSEAL!,
          bodyRiskSeal,
          {
            headers: {
              'X-API-KEY': process.env.KEY_RISKSEAL!,
              'Content-Type': 'application/json',
            },
          },
        );

        const check = await this.checkModel.create({
          ...bodyRiskSeal,
          createdByUserId: actor.id,
        });

        if (!isSuperAdmin && actor.company) {
          try {
            await this.membershipsService.incrementCheckUsage(actor.company);
          } catch (quotaErr) {
            await this.checkModel.deleteOne({ _id: check._id });
            throw quotaErr;
          }
        }

        return {
          message: 'Check creado exitosamente',
          data: { check, data } 
        };

      } catch (error) {
        if (error instanceof HttpException) {
          throw error;
        }
        throw new BadRequestException(`Error externo: ${error}`);
      }
  }

  async findAll(paginationQuery: PaginationQueryDto, actor: User) {
    const { page, limit, skip } = resolvePagination(paginationQuery);
    const filter = this.buildFindAllFilter(paginationQuery, actor);
    const [data, total] = await Promise.all([
      this.checkModel.find(filter).skip(skip).limit(limit).lean().exec(),
      this.checkModel.countDocuments(filter),
    ]);
    return {
      data,
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  async findOneByPublicId(checkId: string, actor: User) {
    const doc = await this.checkModel.findOne({ id: checkId }).exec();
    this.assertCanAccessCheck(doc, actor);
    return {
      message: 'Check obtenido',
      data: doc,
    };
  }

  update(checkId: string, updateCheckDto: UpdateCheckDto) {
    return `This action updates a #${checkId} check`;
  }

  remove(checkId: string) {
    return `This action removes a #${checkId} check`;
  }

  private handleExceptions( error: any ) {
  
      if( error.code === 11000 ) throw new BadRequestException(`Pokemon already exist in db ${ JSON.stringify( error.keyValue ) }`);
        console.log(error);
        throw new InternalServerErrorException(`Can't create Pokemon - Check Server logs`);
  
    }
}
