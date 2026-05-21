import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Membership, MembershipSchema } from './entities/membership.entity';
import { CounterId, CounterIdSchema } from 'src/common/entities/counter-id.entity';
import { Company, CompanySchema } from 'src/company/entities/company.entity';
import { User, UserSchema } from 'src/users/entities/user.entity';
import { MembershipsService } from './memberships.service';
import { MembershipsController } from './memberships.controller';
import { AuthModule } from 'src/auth/auth.module';
import { CommonModule } from 'src/common/common.module';
import { PlansModule } from 'src/plans/plans.module';
import {
  CompanyBranch,
  CompanyBranchSchema,
} from 'src/company-branch/entities/company-branch.entity';
import {
  BoldCheckoutIntent,
  BoldCheckoutIntentSchema,
} from 'src/bold-payment/entities/bold-checkout-intent.entity';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    CommonModule,
    forwardRef(() => PlansModule),
    MongooseModule.forFeature([
      { name: Membership.name, schema: MembershipSchema },
      { name: CounterId.name, schema: CounterIdSchema },
      { name: Company.name, schema: CompanySchema },
      { name: User.name, schema: UserSchema },
      { name: CompanyBranch.name, schema: CompanyBranchSchema },
      { name: BoldCheckoutIntent.name, schema: BoldCheckoutIntentSchema },
    ]),
  ],
  controllers: [MembershipsController],
  providers: [MembershipsService],
  exports: [MembershipsService, MongooseModule],
})
export class MembershipsModule {}
