import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Plan, PlanSchema } from './entities/plan.entity';
import { CounterId, CounterIdSchema } from 'src/common/entities/counter-id.entity';
import { PlansService } from './plans.service';
import { PlansController } from './plans.controller';
import { AuthModule } from 'src/auth/auth.module';
import { CommonModule } from 'src/common/common.module';
import { MembershipsModule } from 'src/memberships/memberships.module';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    CommonModule,
    forwardRef(() => MembershipsModule),
    MongooseModule.forFeature([
      { name: Plan.name, schema: PlanSchema },
      { name: CounterId.name, schema: CounterIdSchema },
    ]),
  ],
  controllers: [PlansController],
  providers: [PlansService],
  exports: [MongooseModule, PlansService],
})
export class PlansModule {}
