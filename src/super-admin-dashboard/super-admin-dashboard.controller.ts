import { Controller, Get, Query } from '@nestjs/common';
import { SuperAdminDashboardService } from './super-admin-dashboard.service';
import { Auth } from 'src/auth/decorators';
import { ValidRoles } from 'src/auth/interfaces';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';

@Controller('super-admin/dashboard')
export class SuperAdminDashboardController {
  constructor(
    private readonly superAdminDashboardService: SuperAdminDashboardService,
  ) {}

  @Get('stats')
  @Auth(ValidRoles.superAdmin)
  getStats() {
    return this.superAdminDashboardService.getStats();
  }

  @Get('memberships')
  @Auth(ValidRoles.superAdmin)
  getMemberships(@Query() paginationQuery: PaginationQueryDto) {
    return this.superAdminDashboardService.getMembershipTable(paginationQuery);
  }
}
