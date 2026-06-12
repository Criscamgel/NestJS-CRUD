import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Auth } from 'src/auth/decorators';
import { ValidRoles } from 'src/auth/interfaces';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { CommercialAppointmentService } from './commercial-appointment.service';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto';
import { UpdateAppointmentConfigDto } from './dto/update-appointment-config.dto';
import { UpdateMeetingLinkDto } from './dto/update-meeting-link.dto';
import { BlockDateDto } from './dto/block-date.dto';

@Controller('appointments')
@Auth(ValidRoles.admin)
export class AppointmentAdminController {
  constructor(
    private readonly appointmentService: CommercialAppointmentService,
  ) {}

  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.appointmentService.findAll(query);
  }

  @Get('config')
  getConfig() {
    return this.appointmentService.getAdminConfig();
  }

  @Put('config')
  updateConfig(@Body() dto: UpdateAppointmentConfigDto) {
    return this.appointmentService.updateConfig(dto);
  }

  @Post('block-date')
  blockDate(@Body() dto: BlockDateDto) {
    return this.appointmentService.blockDate(dto);
  }

  @Delete('block-date/:date')
  unblockDate(@Param('date') date: string) {
    return this.appointmentService.unblockDate(date);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.appointmentService.findOneAdmin(id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentStatusDto,
  ) {
    return this.appointmentService.updateStatus(id, dto);
  }

  @Patch(':id/meeting-link')
  updateMeetingLink(
    @Param('id') id: string,
    @Body() dto: UpdateMeetingLinkDto,
  ) {
    return this.appointmentService.updateMeetingLink(id, dto);
  }
}
