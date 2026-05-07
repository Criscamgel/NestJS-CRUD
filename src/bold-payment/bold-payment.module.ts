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
import { PublicLandingController } from './public-landing.controller';
import { AuthLandingOnboardingController } from './auth-landing-onboarding.controller';
import { LandingOnboardingService } from './landing-onboarding.service';
import { PlansModule } from 'src/plans/plans.module';
import { MembershipsModule } from 'src/memberships/memberships.module';
import { User, UserSchema } from 'src/users/entities/user.entity';
import { EmailModule } from 'src/email/email.module';
import { AuthModule } from 'src/auth/auth.module';
import { CompanyModule } from 'src/company/company.module';
import { UsersModule } from 'src/users/users.module';
import {
  BlacklistedToken,
  BlacklistedTokenSchema,
} from 'src/auth/entities/blacklisted-token.entity';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: BoldCheckoutIntent.name, schema: BoldCheckoutIntentSchema },
      { name: User.name, schema: UserSchema },
      { name: BlacklistedToken.name, schema: BlacklistedTokenSchema },
    ]),
    forwardRef(() => PlansModule),
    forwardRef(() => MembershipsModule),
    EmailModule,
    forwardRef(() => AuthModule),
    forwardRef(() => CompanyModule),
    forwardRef(() => UsersModule),
  ],
  controllers: [
    BoldPublicController,
    BoldWebhookController,
    BoldCompanyPlansController,
    PublicLandingController,
    AuthLandingOnboardingController,
  ],
  providers: [BoldPaymentService, LandingOnboardingService],
  exports: [BoldPaymentService],
})
export class BoldPaymentModule {}
