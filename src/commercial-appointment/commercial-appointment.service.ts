import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';

import { CommercialAppointment } from './entities/commercial-appointment.entity';
import { AppointmentConfig } from './entities/appointment-config.entity';
import { BookAppointmentDto } from './dto/book-appointment.dto';
import { GetAvailableSlotsDto } from './dto/get-available-slots.dto';
import { UpdateAppointmentConfigDto } from './dto/update-appointment-config.dto';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto';
import { UpdateMeetingLinkDto } from './dto/update-meeting-link.dto';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import { BlockDateDto } from './dto/block-date.dto';
import { EmailService } from 'src/email/email.service';
import {
  appointmentConfirmationEmailTemplate,
  appointmentNotificationEmailTemplate,
  appointmentCancellationEmailTemplate,
  getEmailLogoAttachment,
} from 'src/email/email-templates.helper';
import { generateIcsEvent } from './utils/ics-generator.util';
import { PaginationQueryDto, DEFAULT_PAGE, DEFAULT_LIMIT } from 'src/common/dto/pagination-query.dto';
import { CaldavCalendarService } from './calendar/caldav-calendar.service';
import type { BusyInterval } from './calendar/parse-ics-busy.util';

/** Antispam: mismo IP no puede crear otra cita antes de este intervalo (ms) */
const RATE_WINDOW_MS = 120_000;
const DEFAULT_APPOINTMENT_START = '09:00';
const DEFAULT_APPOINTMENT_END = '18:00';

@Injectable()
export class CommercialAppointmentService implements OnModuleInit {
  private readonly logger = new Logger(CommercialAppointmentService.name);
  private readonly lastBookByIp = new Map<string, number>();

  constructor(
    @InjectModel(CommercialAppointment.name)
    private readonly appointmentModel: Model<CommercialAppointment>,
    @InjectModel(AppointmentConfig.name)
    private readonly configModel: Model<AppointmentConfig>,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
    private readonly caldavCalendarService: CaldavCalendarService,
  ) {}

  async onModuleInit() {
    const hours = this.getBusinessHours();
    const result = await this.configModel.updateMany(
      {},
      {
        $set: {
          startHour: hours.startHour,
          endHour: hours.endHour,
          slotDuration: 60,
          allowedDurations: [60],
        },
      },
    );
    this.logger.log(
      `Horario comercial citas: ${hours.startHour}-${hours.endHour} (America/Bogota). Configs sync: ${result.modifiedCount}`,
    );
  }

  /** Horario hábil: env (Dokploy) > default 09:00-18:00. Siempre prevalece sobre MongoDB. */
  private getBusinessHours(): { startHour: string; endHour: string } {
    const startHour =
      process.env.APPOINTMENT_START_HOUR?.trim() ||
      this.configService.get<string>('APPOINTMENT_START_HOUR')?.trim() ||
      DEFAULT_APPOINTMENT_START;
    const endHour =
      process.env.APPOINTMENT_END_HOUR?.trim() ||
      this.configService.get<string>('APPOINTMENT_END_HOUR')?.trim() ||
      DEFAULT_APPOINTMENT_END;
    return { startHour, endHour };
  }

  // ─── Helpers ───────────────────────────────────────────────

  private async getConfig(): Promise<AppointmentConfig> {
    let config = await this.configModel.findOne().exec();
    const hours = this.getBusinessHours();

    if (!config) {
      config = await this.configModel.create({
        startHour: hours.startHour,
        endHour: hours.endHour,
        allowedDurations: [60],
      });
      return config;
    }

    // Env/default siempre gana — evita quedar pegado a 08:00 en MongoDB
    config.startHour = hours.startHour;
    config.endHour = hours.endHour;
    return config;
  }

  private timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  private minutesToTime(minutes: number): string {
    const h = Math.floor(minutes / 60) % 24;
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  private generatePublicId(): string {
    return crypto.randomBytes(6).toString('hex');
  }

  private getEffectiveMeetingLink(appointment: CommercialAppointment): string {
    return appointment.meetingLinkOverride || appointment.meetingLink;
  }

  private hasTimeOverlap(
    slotStart: number,
    slotEnd: number,
    busyStart: number,
    busyEnd: number,
  ): boolean {
    return slotStart < busyEnd && slotEnd > busyStart;
  }

  private isSlotBusy(
    dateStr: string,
    slotStart: number,
    slotEnd: number,
    dayAppointments: Array<{ startTime: string; endTime: string }>,
    caldavBusy: BusyInterval[],
  ): boolean {
    const appointmentCollision = dayAppointments.some((a) => {
      const aStart = this.timeToMinutes(a.startTime);
      const aEnd = this.timeToMinutes(a.endTime);
      return this.hasTimeOverlap(slotStart, slotEnd, aStart, aEnd);
    });
    if (appointmentCollision) return true;

    return caldavBusy
      .filter((b) => b.date === dateStr)
      .some((b) => this.hasTimeOverlap(slotStart, slotEnd, b.startMinutes, b.endMinutes));
  }

  // ─── Public: Config ────────────────────────────────────────

  async getPublicConfig() {
    const config = await this.getConfig();
    const hours = this.getBusinessHours();
    return {
      availableDays: config.availableDays,
      startHour: hours.startHour,
      endHour: hours.endHour,
      allowedDurations: [60],
      timezone: config.timezone,
      maxAdvanceDays: config.maxAdvanceDays,
    };
  }

  // ─── Public: Available Slots ───────────────────────────────

  async getAvailableSlots(query: GetAvailableSlotsDto) {
    const config = await this.getConfig();
    const { month, duration } = query;

    const [yearStr, monthStr] = month.split('-');
    const year = parseInt(yearStr, 10);
    const monthIndex = parseInt(monthStr, 10) - 1;

    const startOfMonth = new Date(year, monthIndex, 1);
    const endOfMonth = new Date(year, monthIndex + 1, 0);
    const monthStartStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;
    const monthEndStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(endOfMonth.getDate()).padStart(2, '0')}`;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + config.maxAdvanceDays);
    maxDate.setHours(23, 59, 59, 999);

    // Traer todas las citas del mes que no están canceladas
    const existingAppointments = await this.appointmentModel
      .find({
        date: { $gte: startOfMonth, $lte: endOfMonth },
        status: { $in: ['scheduled', 'confirmed'] },
      })
      .lean()
      .exec();

    const caldavBusy = await this.caldavCalendarService.fetchBusyIntervals(
      monthStartStr,
      monthEndStr,
    );

    const hours = this.getBusinessHours();
    const startMinutes = this.timeToMinutes(hours.startHour);
    const endMinutes = this.timeToMinutes(hours.endHour);
    const slotInterval = config.slotDuration || 60;

    const result: { date: string; slots: string[] }[] = [];

    for (let day = 1; day <= endOfMonth.getDate(); day++) {
      const currentDate = new Date(year, monthIndex, day);

      // Saltar si es pasado
      if (currentDate < today) continue;

      // Saltar si excede maxAdvanceDays
      if (currentDate > maxDate) continue;

      // Saltar si no es día hábil (getDay: 0=dom, 1=lun ... 6=sab)
      const dayOfWeek = currentDate.getDay();
      // Convertir a formato lun=1 ... dom=7
      const isoDay = dayOfWeek === 0 ? 7 : dayOfWeek;
      if (!config.availableDays.includes(isoDay)) continue;

      // Saltar si está bloqueado
      const dateStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (config.blockedDates.includes(dateStr)) continue;

      // Obtener citas del día
      const dayAppointments = existingAppointments.filter((a) => {
        const aDate = new Date(a.date);
        return aDate.getDate() === day;
      });

      // Generar slots
      const slots: string[] = [];
      for (let m = startMinutes; m + duration <= endMinutes; m += slotInterval) {
        const slotStart = m;
        const slotEnd = m + duration;

        if (!this.isSlotBusy(dateStr, slotStart, slotEnd, dayAppointments, caldavBusy)) {
          slots.push(this.minutesToTime(m));
        }
      }

      // Si es hoy, filtrar los slots que ya pasaron
      if (currentDate.toDateString() === today.toDateString()) {
        const now = new Date();
        // Hora actual en Colombia (UTC-5)
        const nowColombia = new Date(now.getTime() - 5 * 60 * 60 * 1000);
        const nowMinutes = nowColombia.getUTCHours() * 60 + nowColombia.getUTCMinutes();
        const filtered = slots.filter((s) => this.timeToMinutes(s) > nowMinutes);
        if (filtered.length > 0) {
          result.push({ date: dateStr, slots: filtered });
        }
      } else if (slots.length > 0) {
        result.push({ date: dateStr, slots });
      }
    }

    return { month, duration, days: result };
  }

  // ─── Public: Book ──────────────────────────────────────────

  async book(dto: BookAppointmentDto, clientIp: string) {
    // Rate limiting
    const now = Date.now();
    const last = this.lastBookByIp.get(clientIp);
    if (last !== undefined && now - last < RATE_WINDOW_MS) {
      throw new HttpException(
        'Ya recibimos una solicitud reciente. Intenta de nuevo en unos minutos.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const config = await this.getConfig();

    // Validar duración
    if (!config.allowedDurations.includes(dto.duration)) {
      throw new BadRequestException('Duración no permitida.');
    }

    // Validar fecha
    const [yearStr, monthStr, dayStr] = dto.date.split('-');
    const appointmentDate = new Date(
      parseInt(yearStr, 10),
      parseInt(monthStr, 10) - 1,
      parseInt(dayStr, 10),
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (appointmentDate < today) {
      throw new BadRequestException('No se puede agendar en una fecha pasada.');
    }

    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + config.maxAdvanceDays);
    if (appointmentDate > maxDate) {
      throw new BadRequestException(
        `Solo se puede agendar hasta ${config.maxAdvanceDays} días en el futuro.`,
      );
    }

    // Validar día hábil
    const dayOfWeek = appointmentDate.getDay();
    const isoDay = dayOfWeek === 0 ? 7 : dayOfWeek;
    if (!config.availableDays.includes(isoDay)) {
      throw new BadRequestException('El día seleccionado no es hábil.');
    }

    // Validar fecha no bloqueada
    if (config.blockedDates.includes(dto.date)) {
      throw new BadRequestException('El día seleccionado no está disponible.');
    }

    // Validar horario dentro de jornada
    const startMinutes = this.timeToMinutes(dto.startTime);
    const endMinutes = startMinutes + dto.duration;
    const journeyStart = this.timeToMinutes(config.startHour);
    const journeyEnd = this.timeToMinutes(config.endHour);

    if (startMinutes < journeyStart || endMinutes > journeyEnd) {
      throw new BadRequestException(
        `El horario debe estar entre ${config.startHour} y ${config.endHour}.`,
      );
    }

    // Verificar colisión atómica: buscar si hay overlap y solo crear si no existe
    const startOfDay = new Date(appointmentDate);
    const endOfDay = new Date(appointmentDate);
    endOfDay.setHours(23, 59, 59, 999);

    const endTime = this.minutesToTime(endMinutes);

    const collision = await this.appointmentModel.findOne({
      date: { $gte: startOfDay, $lte: endOfDay },
      status: { $in: ['scheduled', 'confirmed'] },
      $expr: {
        $and: [
          {
            $lt: [
              {
                $add: [
                  { $multiply: [{ $toInt: { $substr: ['$startTime', 0, 2] } }, 60] },
                  { $toInt: { $substr: ['$startTime', 3, 2] } },
                ],
              },
              endMinutes,
            ],
          },
          {
            $gt: [
              {
                $add: [
                  { $multiply: [{ $toInt: { $substr: ['$endTime', 0, 2] } }, 60] },
                  { $toInt: { $substr: ['$endTime', 3, 2] } },
                ],
              },
              startMinutes,
            ],
          },
        ],
      },
    }).exec();

    if (collision) {
      throw new BadRequestException(
        'Este horario ya no está disponible. Selecciona otro.',
      );
    }

    const caldavBusyOnDay = await this.caldavCalendarService.fetchBusyIntervals(
      dto.date,
      dto.date,
    );
    if (
      this.isSlotBusy(
        dto.date,
        startMinutes,
        endMinutes,
        [],
        caldavBusyOnDay,
      )
    ) {
      throw new BadRequestException(
        'Este horario ya no está disponible. Selecciona otro.',
      );
    }

    const publicId = this.generatePublicId();
    const cancellationToken = crypto.randomUUID();
    const meetingLink = `${config.defaultMeetingLinkBase}${publicId}`;

    const appointment = await this.appointmentModel.create({
      publicId,
      name: dto.name.trim(),
      email: dto.email.trim().toLowerCase(),
      company: dto.company.trim(),
      phone: dto.phone?.trim() || undefined,
      date: appointmentDate,
      startTime: dto.startTime,
      endTime,
      duration: dto.duration,
      meetingLink,
      timezone: config.timezone,
      status: 'scheduled',
      cancellationToken,
    });

    this.lastBookByIp.set(clientIp, Date.now());

    // Sincronizar con calendario Namecheap (CalDAV)
    try {
      await this.syncAppointmentToCalendar(appointment, config);
    } catch (err) {
      this.logger.error('Error sincronizando cita con CalDAV', err);
    }

    // Enviar emails (no bloquear la respuesta si falla)
    this.sendBookingEmails(appointment, config).catch((err) => {
      this.logger.error('Error enviando emails de cita', err);
    });

    return {
      success: true,
      message: 'Tu cita fue agendada exitosamente. Revisa tu correo para los detalles.',
      data: {
        publicId: appointment.publicId,
        date: dto.date,
        startTime: dto.startTime,
        endTime,
        duration: dto.duration,
        meetingLink,
      },
    };
  }

  private async syncAppointmentToCalendar(
    appointment: CommercialAppointment,
    config: AppointmentConfig,
  ) {
    if (!this.caldavCalendarService.isEnabled()) return;

    const inbox =
      this.configService.get<string>('APPOINTMENT_INBOX') || 'ventas@cheky.co';
    const effectiveLink = this.getEffectiveMeetingLink(appointment);
    const cancelBaseUrl =
      this.configService.get<string>('PUBLIC_LANDING_URL') || 'https://cheky.co';
    const cancelLink = `${cancelBaseUrl.replace(/\/+$/, '')}/cita/${appointment.publicId}/cancelar?token=${encodeURIComponent(appointment.cancellationToken)}`;

    const eventUrl = await this.caldavCalendarService.createEvent({
      date: this.formatDateStr(appointment.date),
      startTime: appointment.startTime,
      duration: appointment.duration,
      summary: `Cita comercial — ${appointment.company}`,
      description: [
        `Lead: ${appointment.name}`,
        `Email: ${appointment.email}`,
        appointment.phone ? `Tel: ${appointment.phone}` : null,
        `Empresa: ${appointment.company}`,
        `Enlace reunión: ${effectiveLink}`,
        `Cancelar: ${cancelLink}`,
      ]
        .filter(Boolean)
        .join('\n'),
      location: effectiveLink,
      organizerEmail: inbox,
      organizerName: 'Team Cheky',
      attendeeEmail: appointment.email,
      attendeeName: appointment.name,
      uid: `${appointment.publicId}@cheky.co`,
    });

    if (eventUrl) {
      appointment.caldavEventUrl = eventUrl;
      await appointment.save();
      this.logger.log(
        `Cita ${appointment.publicId} sincronizada al calendario: ${eventUrl}`,
      );
    } else {
      this.logger.error(
        `Cita ${appointment.publicId} NO se sincronizó al calendario CalDAV. Revisa logs de CaldavCalendarService.`,
      );
    }
  }

  private async sendBookingEmails(
    appointment: CommercialAppointment,
    config: AppointmentConfig,
  ) {
    const effectiveLink = this.getEffectiveMeetingLink(appointment);
    const inbox =
      this.configService.get<string>('APPOINTMENT_INBOX') || 'ventas@cheky.co';

    const cancelBaseUrl = this.configService.get<string>('PUBLIC_LANDING_URL') || 'https://cheky.co';
    const cancelLink = `${cancelBaseUrl.replace(/\/+$/, '')}/cita/${appointment.publicId}/cancelar?token=${encodeURIComponent(appointment.cancellationToken)}`;

    // Generar .ics
    const icsContent = generateIcsEvent({
      date: this.formatDateStr(appointment.date),
      startTime: appointment.startTime,
      duration: appointment.duration,
      summary: 'Reunión comercial con Team Cheky',
      description: `Enlace de reunión: ${effectiveLink}\n\nPara cancelar: ${cancelLink}`,
      location: effectiveLink,
      organizerEmail: inbox,
      organizerName: 'Team Cheky',
      attendeeEmail: appointment.email,
      attendeeName: appointment.name,
      uid: `${appointment.publicId}@cheky.co`,
    });

    const logoAtt = getEmailLogoAttachment();
    const baseAttachments = logoAtt ? [logoAtt] : [];

    // Email al usuario
    const userHtml = appointmentConfirmationEmailTemplate({
      name: appointment.name,
      date: this.formatReadableDate(appointment.date),
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      duration: appointment.duration,
      meetingLink: effectiveLink,
      cancelLink,
    });

    await this.emailService.sendEmail({
      to: appointment.email,
      subject: 'Cheky — Tu cita comercial fue agendada',
      htmlBody: userHtml,
      attachements: [
        ...baseAttachments,
        {
          filename: 'reunion-cheky.ics',
          content: Buffer.from(icsContent, 'utf-8'),
          contentType: 'text/calendar; method=REQUEST',
        },
      ],
    });

    // Email al equipo
    const teamHtml = appointmentNotificationEmailTemplate({
      name: appointment.name,
      email: appointment.email,
      company: appointment.company,
      phone: appointment.phone,
      date: this.formatReadableDate(appointment.date),
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      duration: appointment.duration,
      meetingLink: effectiveLink,
    });

    await this.emailService.sendEmail({
      to: inbox,
      subject: `Nueva cita comercial — ${appointment.company} (${appointment.startTime})`,
      htmlBody: teamHtml,
      attachements: [
        ...baseAttachments,
        {
          filename: 'reunion-cheky.ics',
          content: Buffer.from(icsContent, 'utf-8'),
          contentType: 'text/calendar; method=REQUEST',
        },
      ],
    });
  }

  // ─── Public: Get by publicId ───────────────────────────────

  async findByPublicId(publicId: string) {
    const appointment = await this.appointmentModel
      .findOne({ publicId })
      .lean()
      .exec();
    if (!appointment) {
      throw new NotFoundException('Cita no encontrada.');
    }
    return {
      publicId: appointment.publicId,
      name: appointment.name,
      company: appointment.company,
      date: this.formatDateStr(appointment.date),
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      duration: appointment.duration,
      meetingLink: appointment.meetingLinkOverride || appointment.meetingLink,
      status: appointment.status,
      timezone: appointment.timezone,
    };
  }

  // ─── Public: Cancel ────────────────────────────────────────

  async cancel(publicId: string, dto: CancelAppointmentDto) {
    const appointment = await this.appointmentModel
      .findOne({ publicId })
      .exec();
    if (!appointment) {
      throw new NotFoundException('Cita no encontrada.');
    }
    if (appointment.status === 'cancelled') {
      throw new BadRequestException('Esta cita ya fue cancelada.');
    }
    if (appointment.status === 'completed') {
      throw new BadRequestException('No se puede cancelar una cita ya completada.');
    }
    if (appointment.cancellationToken !== dto.cancellationToken) {
      throw new BadRequestException('Token de cancelación inválido.');
    }

    appointment.status = 'cancelled';
    appointment.cancelledAt = new Date();
    appointment.cancellationReason = dto.reason || undefined;
    await appointment.save();

    if (appointment.caldavEventUrl) {
      this.caldavCalendarService
        .deleteEvent(appointment.caldavEventUrl)
        .catch((err) => {
          this.logger.error('Error eliminando evento CalDAV', err);
        });
    }

    // Notificar al equipo
    this.sendCancellationEmail(appointment).catch((err) => {
      this.logger.error('Error enviando email de cancelación', err);
    });

    return {
      success: true,
      message: 'Tu cita fue cancelada exitosamente.',
    };
  }

  private async sendCancellationEmail(appointment: CommercialAppointment) {
    const inbox =
      this.configService.get<string>('APPOINTMENT_INBOX') || 'ventas@cheky.co';
    const logoAtt = getEmailLogoAttachment();
    const attachments = logoAtt ? [logoAtt] : [];

    const html = appointmentCancellationEmailTemplate({
      name: appointment.name,
      email: appointment.email,
      company: appointment.company,
      date: this.formatReadableDate(appointment.date),
      startTime: appointment.startTime,
      reason: appointment.cancellationReason,
    });

    await this.emailService.sendEmail({
      to: inbox,
      subject: `Cita cancelada — ${appointment.company}`,
      htmlBody: html,
      attachements: attachments,
    });
  }

  // ─── Admin: List ───────────────────────────────────────────

  async findAll(query: PaginationQueryDto) {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (query.search) {
      const regex = new RegExp(query.search, 'i');
      filter.$or = [
        { name: regex },
        { email: regex },
        { company: regex },
      ];
    }

    const [data, total] = await Promise.all([
      this.appointmentModel
        .find(filter)
        .sort({ date: -1, startTime: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.appointmentModel.countDocuments(filter).exec(),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─── Admin: Get by id ──────────────────────────────────────

  async findOneAdmin(id: string) {
    const appointment = await this.appointmentModel.findById(id).lean().exec();
    if (!appointment) {
      throw new NotFoundException('Cita no encontrada.');
    }
    return appointment;
  }

  // ─── Admin: Update Status ──────────────────────────────────

  async updateStatus(id: string, dto: UpdateAppointmentStatusDto) {
    const appointment = await this.appointmentModel.findById(id).exec();
    if (!appointment) {
      throw new NotFoundException('Cita no encontrada.');
    }
    appointment.status = dto.status as any;
    if (dto.status === 'cancelled') {
      appointment.cancelledAt = new Date();
    }
    await appointment.save();
    return appointment;
  }

  // ─── Admin: Update Meeting Link ────────────────────────────

  async updateMeetingLink(id: string, dto: UpdateMeetingLinkDto) {
    const appointment = await this.appointmentModel.findById(id).exec();
    if (!appointment) {
      throw new NotFoundException('Cita no encontrada.');
    }
    appointment.meetingLinkOverride = dto.meetingLink;
    await appointment.save();
    return appointment;
  }

  // ─── Admin: Config ─────────────────────────────────────────

  async updateConfig(dto: UpdateAppointmentConfigDto) {
    const config = await this.getConfig();
    Object.assign(config, dto);
    await config.save();
    return config;
  }

  async getAdminConfig() {
    return this.getConfig();
  }

  // ─── Admin: Block/Unblock Date ─────────────────────────────

  async blockDate(dto: BlockDateDto) {
    const config = await this.getConfig();
    if (!config.blockedDates.includes(dto.date)) {
      config.blockedDates.push(dto.date);
      await config.save();
    }
    return { blockedDates: config.blockedDates };
  }

  async unblockDate(date: string) {
    const config = await this.getConfig();
    config.blockedDates = config.blockedDates.filter((d) => d !== date);
    await config.save();
    return { blockedDates: config.blockedDates };
  }

  // ─── Date formatting ──────────────────────────────────────

  private formatDateStr(date: Date): string {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private formatReadableDate(date: Date): string {
    const d = new Date(date);
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const months = [
      'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
      'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
    ];
    return `${days[d.getDay()]} ${d.getDate()} de ${months[d.getMonth()]} de ${d.getFullYear()}`;
  }
}
