import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import {
  BoldCheckoutIntent,
  BoldCheckoutIntentSchema,
} from './entities/bold-checkout-intent.entity';
import { BoldPaymentService } from './bold-payment.service';
import { BoldPublicController } from './bold-public.controller';
import { BoldWebhookController } from './bold-webhook.controller';
import { BoldCompanyPlansController } from './bold-company-plans.controller';
import { PlansModule } from 'src/plans/plans.module';
import { MembershipsModule } from 'src/memberships/memberships.module';
import { User, UserSchema } from 'src/users/entities/user.entity';
import { EmailModule } from 'src/email/email.module';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: BoldCheckoutIntent.name, schema: BoldCheckoutIntentSchema },
      { name: User.name, schema: UserSchema },
    ]),
    forwardRef(() => PlansModule),
    forwardRef(() => MembershipsModule),
    EmailModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [BoldPublicController, BoldWebhookController, BoldCompanyPlansController],
  providers: [BoldPaymentService],
  exports: [BoldPaymentService],
})
export class BoldPaymentModule {}
