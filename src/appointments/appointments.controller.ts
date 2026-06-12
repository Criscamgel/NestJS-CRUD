import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { GetAvailableSlotsDto } from './dto/get-available-slots.dto';

/**
 * Endpoints públicos para agendamiento de citas desde la landing.
 * No requieren autenticación.
 */
@Controller('public/appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  /** Obtener slots disponibles para una fecha dada. */
  @Get('slots')
  getAvailableSlots(@Query() query: GetAvailableSlotsDto) {
    return this.appointmentsService.getAvailableSlots(query.date, query.duration);
  }

  /** Agendar una cita. */
  @Post()
  create(@Body() dto: CreateAppointmentDto) {
    return this.appointmentsService.create(dto);
  }

  /** Verificar si un email puede agendar (límite mensual). */
  @Get('can-schedule')
  canSchedule(@Query('email') email: string) {
    if (!email?.trim()) {
      return { canSchedule: true };
    }
    return this.appointmentsService.canSchedule(email);
  }
}
