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
    ]),
  ],
  controllers: [MembershipsController],
  providers: [MembershipsService],
  exports: [MembershipsService, MongooseModule],
})
export class MembershipsModule {}
