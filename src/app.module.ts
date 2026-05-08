import { join } from 'path';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ServeStaticModule } from '@nestjs/serve-static';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { CommonModule } from './common/common.module';
import { SeedModule } from './seed/seed.module';
import { EnvConfiguration } from './config/env.config';
import { JoiValidationSchema } from './config/joi.validation';
import { AuthModule } from './auth/auth.module';
import { CheckModule } from './check/check.module';
import { CompanyModule } from './company/company.module';
import { EmailModule } from './email/email.module';
import { UsersModule } from './users/users.module';
import { PlansModule } from './plans/plans.module';
import { MembershipsModule } from './memberships/memberships.module';
import { ContactDemoModule } from './contact-demo/contact-demo.module';
import { SuperAdminDashboardModule } from './super-admin-dashboard/super-admin-dashboard.module';
import { BoldPaymentModule } from './bold-payment/bold-payment.module';
import { CompanyBranchModule } from './company-branch/company-branch.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [EnvConfiguration],
      validationSchema: JoiValidationSchema,
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
    }),
    MongooseModule.forRoot(process.env.MONGODB!, {
      dbName: 'chekydb',
      autoCreate: true
    }),
    CommonModule,
    SeedModule,
    AuthModule,
    CheckModule,
    CompanyModule,
    EmailModule,
    UsersModule,
    PlansModule,
    MembershipsModule,
    ContactDemoModule,
    SuperAdminDashboardModule,
    BoldPaymentModule,
    CompanyBranchModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
