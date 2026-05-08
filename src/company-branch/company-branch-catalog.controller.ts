import { Controller, Get, Query } from '@nestjs/common';
import { CompanyBranchService } from './company-branch.service';
import { Auth, GetUser } from 'src/auth/decorators';
import { ValidRoles } from 'src/auth/interfaces';
import { User } from 'src/users/entities/user.entity';
import { BranchCatalogQueryDto } from './dto/branch-catalog-query.dto';

@Controller('company-branches/catalog')
@Auth(ValidRoles.superAdmin, ValidRoles.admin)
export class CompanyBranchCatalogController {
  constructor(private readonly companyBranchService: CompanyBranchService) {}

  @Get()
  findCatalog(
    @Query() query: BranchCatalogQueryDto,
    @GetUser() actor: User,
  ) {
    return this.companyBranchService.findCatalog(actor, query);
  }
}
