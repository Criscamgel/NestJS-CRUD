import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { EmailModule } from 'src/email/email.module';
import { TurnstileModule } from 'src/turnstile/turnstile.module';
import { AuthModule } from 'src/auth/auth.module';
import {
  CommercialAppointment,
  CommercialAppointmentSchema,
} from './entities/commercial-appointment.entity';
import {
  AppointmentConfig,
  AppointmentConfigSchema,
} from './entities/appointment-config.entity';
import { CommercialAppointmentService } from './commercial-appointment.service';
import { CaldavCalendarService } from './calendar/caldav-calendar.service';
import { PublicAppointmentController } from './public-appointment.controller';
import { AppointmentAdminController } from './appointment-admin.controller';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: CommercialAppointment.name, schema: CommercialAppointmentSchema },
      { name: AppointmentConfig.name, schema: AppointmentConfigSchema },
    ]),
    EmailModule,
    TurnstileModule,
    AuthModule,
  ],
  controllers: [PublicAppointmentController, AppointmentAdminController],
  providers: [CommercialAppointmentService, CaldavCalendarService],
})
export class CommercialAppointmentModule {}
