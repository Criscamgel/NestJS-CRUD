import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';

/**
 * Endpoints públicos para agendamiento de citas desde la landing.
 * No requieren autenticación.
 */
@Controller('public/appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  /** Configuración pública del scheduler (durations, horario, timezone). */
  @Get('config')
  getConfig() {
    return this.appointmentsService.getPublicConfig();
  }

  /** Slots disponibles para un mes completo. */
  @Get('available-slots')
  getAvailableSlots(
    @Query('month') month: string,
    @Query('duration') duration: string,
  ) {
    return this.appointmentsService.getAvailableSlotsForMonth(
      month,
      parseInt(duration, 10) || 30,
    );
  }

  /** Agendar una cita. */
  @Post('book')
  book(@Body() dto: CreateAppointmentDto) {
    return this.appointmentsService.create(dto);
  }

  /** Verificar si un email puede agendar (límite mensual). */
  @Get('can-schedule')
  canSchedule(@Query('email') email: string) {
    if (!email?.trim()) return { canSchedule: true };
    return this.appointmentsService.canSchedule(email);
  }
}
