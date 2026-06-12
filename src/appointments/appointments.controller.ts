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

  /** Configuración pública del sistema de citas. */
  @Get('config')
  getConfig() {
    return this.appointmentsService.getPublicConfig();
  }

  /** Slots disponibles para un mes y duración dados. */
  @Get('available-slots')
  getAvailableSlots(
    @Query('month') month: string,
    @Query('duration') duration: string,
  ) {
    const dur = parseInt(duration, 10) || 30;
    return this.appointmentsService.getAvailableSlotsForMonth(month, dur);
  }

  /** Agendar una cita. */
  @Post('book')
  book(@Body() dto: CreateAppointmentDto) {
    return this.appointmentsService.book(dto);
  }
}
