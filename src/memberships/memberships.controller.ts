import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { MembershipsService } from './memberships.service';
import { CreateMembershipDto } from './dto';
import { Auth, GetUser } from 'src/auth/decorators';
import { ValidRoles } from 'src/auth/interfaces';
import { User } from 'src/users/entities/user.entity';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';

@Controller('memberships')
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Post()
  @Auth(ValidRoles.superAdmin, ValidRoles.admin)
  create(
    @Body() dto: CreateMembershipDto,
    @GetUser() actor: User,
  ) {
    return this.membershipsService.create(dto, actor);
  }

  /** Debe declararse antes de `@Get(':id')` para no capturarlo como id. */
  @Get('company-dashboard')
  @Auth(ValidRoles.admin)
  getCompanyDashboard(@GetUser() actor: User) {
    const companyId = actor.company?.trim();
    if (!companyId) {
      throw new BadRequestException(
        'El administrador no está vinculado a una empresa',
      );
    }
    return this.membershipsService.getDashboardSummaryForCompany(companyId);
  }

  @Get()
  @Auth(ValidRoles.superAdmin)
  findAll(@Query() paginationQuery: PaginationQueryDto) {
    return this.membershipsService.findAll(paginationQuery);
  }

  @Get(':id')
  @Auth(ValidRoles.superAdmin)
  findOne(@Param('id') id: string) {
    return this.membershipsService.findOne(id);
  }

  @Patch(':id/suspend')
  @Auth(ValidRoles.superAdmin)
  suspend(
    @Param('id') id: string,
    @GetUser() actor: User,
    @Body('reason') reason?: string,
  ) {
    return this.membershipsService.suspend(id, actor.id, reason);
  }

  @Patch(':id/resume')
  @Auth(ValidRoles.superAdmin)
  resume(@Param('id') id: string) {
    return this.membershipsService.resume(id);
  }
}
