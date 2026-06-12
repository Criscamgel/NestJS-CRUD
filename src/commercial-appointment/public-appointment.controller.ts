import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { resolveClientIp } from 'src/common/utils/client-ip.util';
import { TurnstileService } from 'src/turnstile/turnstile.service';
import { CommercialAppointmentService } from './commercial-appointment.service';
import { BookAppointmentDto } from './dto/book-appointment.dto';
import { GetAvailableSlotsDto } from './dto/get-available-slots.dto';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';

@Controller('public/appointments')
export class PublicAppointmentController {
  constructor(
    private readonly appointmentService: CommercialAppointmentService,
    private readonly turnstileService: TurnstileService,
  ) {}

  @Get('config')
  getPublicConfig() {
    return this.appointmentService.getPublicConfig();
  }

  @Get('available-slots')
  getAvailableSlots(@Query() query: GetAvailableSlotsDto) {
    return this.appointmentService.getAvailableSlots(query);
  }

  @Post('book')
  async book(@Body() dto: BookAppointmentDto, @Req() req: Request) {
    const ip = resolveClientIp(req);
    await this.turnstileService.assertValid(dto.turnstileToken, ip);
    return this.appointmentService.book(dto, ip);
  }

  @Get(':publicId')
  findByPublicId(@Param('publicId') publicId: string) {
    return this.appointmentService.findByPublicId(publicId);
  }

  @Post(':publicId/cancel')
  cancel(
    @Param('publicId') publicId: string,
    @Body() dto: CancelAppointmentDto,
  ) {
    return this.appointmentService.cancel(publicId, dto);
  }
}
