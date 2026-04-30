import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Membership, MembershipSchema } from 'src/memberships/entities/membership.entity';
import { Company, CompanySchema } from 'src/company/entities/company.entity';
import { Plan, PlanSchema } from 'src/plans/entities/plan.entity';
import { Check, CheckSchema } from 'src/check/entities/check.entity';
import { SuperAdminDashboardService } from './super-admin-dashboard.service';
import { SuperAdminDashboardController } from './super-admin-dashboard.controller';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Membership.name, schema: MembershipSchema },
      { name: Company.name, schema: CompanySchema },
      { name: Plan.name, schema: PlanSchema },
      { name: Check.name, schema: CheckSchema },
    ]),
  ],
  controllers: [SuperAdminDashboardController],
  providers: [SuperAdminDashboardService],
})
export class SuperAdminDashboardModule {}
