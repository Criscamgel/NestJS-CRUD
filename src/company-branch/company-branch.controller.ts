import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CompanyBranchService } from './company-branch.service';
import { CreateCompanyBranchDto, UpdateCompanyBranchDto } from './dto';
import { Auth, GetUser } from 'src/auth/decorators';
import { ValidRoles } from 'src/auth/interfaces';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { User } from 'src/users/entities/user.entity';

@Controller('company/:companyId/branches')
@Auth(ValidRoles.superAdmin, ValidRoles.admin)
export class CompanyBranchController {
  constructor(private readonly companyBranchService: CompanyBranchService) {}

  @Post()
  create(
    @Param('companyId') companyId: string,
    @Body() dto: CreateCompanyBranchDto,
    @GetUser() actor: User,
  ) {
    return this.companyBranchService.create(companyId, dto, actor);
  }

  @Get()
  findAll(
    @Param('companyId') companyId: string,
    @Query() paginationQuery: PaginationQueryDto,
    @GetUser() actor: User,
  ) {
    return this.companyBranchService.findAllForCompany(
      companyId,
      paginationQuery,
      actor,
    );
  }

  @Get(':branchId')
  findOne(
    @Param('companyId') companyId: string,
    @Param('branchId') branchId: string,
    @GetUser() actor: User,
  ) {
    return this.companyBranchService.findOne(companyId, branchId, actor);
  }

  @Patch(':branchId')
  update(
    @Param('companyId') companyId: string,
    @Param('branchId') branchId: string,
    @Body() dto: UpdateCompanyBranchDto,
    @GetUser() actor: User,
  ) {
    return this.companyBranchService.update(companyId, branchId, dto, actor);
  }

  @Patch(':branchId/toggle-status')
  toggleStatus(
    @Param('companyId') companyId: string,
    @Param('branchId') branchId: string,
    @GetUser() actor: User,
  ) {
    return this.companyBranchService.toggleStatus(companyId, branchId, actor);
  }
}
