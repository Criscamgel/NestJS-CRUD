import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { Appointment } from './entities/appointment.entity';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { isBusinessDay } from './colombia-holidays';
import { EmailService } from 'src/email/email.service';

type SlotDay = { date: string; slots: string[] };

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    @InjectModel(Appointment.name)
    private readonly appointmentModel: Model<Appointment>,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  // ─── CONFIG ─────────────────────────────────────────────────────────────────

  private get timezone(): string {
    return this.configService.get<string>('APPOINTMENT_DEFAULT_TIMEZONE') || 'America/Bogota';
  }

  private get startHour(): string {
    return this.configService.get<string>('APPOINTMENT_START_HOUR') || '08:00';
  }

  private get endHour(): string {
    return this.configService.get<string>('APPOINTMENT_END_HOUR') || '18:00';
  }

  private get slotDuration(): number {
    return parseInt(this.configService.get<string>('APPOINTMENT_SLOT_DURATION') || '15', 10);
  }

  private get maxAdvanceDays(): number {
    return parseInt(this.configService.get<string>('APPOINTMENT_MAX_ADVANCE_DAYS') || '30', 10);
  }

  private get meetingLinkBase(): string {
    return this.configService.get<string>('APPOINTMENT_MEETING_LINK_BASE') || 'https://meet.jit.si/cheky-reunion-';
  }

  private get salesInbox(): string {
    return this.configService.get<string>('APPOINTMENT_INBOX') || 'ventas@cheky.co';
  }

  // ─── PUBLIC CONFIG ──────────────────────────────────────────────────────────

  /** Retorna configuración pública para el scheduler del frontend. */
  getPublicConfig() {
    return {
      availableDays: [1, 2, 3, 4, 5], // lun a vie
      startHour: this.startHour,
      endHour: this.endHour,
      allowedDurations: [15, 30, 45, 60],
      timezone: this.timezone,
      maxAdvanceDays: this.maxAdvanceDays,
    };
  }

  // ─── SLOTS POR MES ──────────────────────────────────────────────────────────

  /**
   * Retorna todos los slots disponibles del mes, agrupados por día.
   */
  async getAvailableSlotsForMonth(monthStr: string, durationMinutes: number) {
    const [yearStr, monthNumStr] = (monthStr || '').split('-');
    const year = parseInt(yearStr, 10);
    const monthIdx = parseInt(monthNumStr, 10) - 1;

    if (isNaN(year) || isNaN(monthIdx) || monthIdx < 0 || monthIdx > 11) {
      return { month: monthStr, duration: durationMinutes, days: [] };
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const maxDate = new Date(today.getTime() + this.maxAdvanceDays * 24 * 60 * 60 * 1000);
    const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();

    const startH = parseInt(this.startHour.split(':')[0], 10);
    const endH = parseInt(this.endHour.split(':')[0], 10);
    const startMinutes = startH * 60;
    const endMinutes = endH * 60;

    // Obtener todas las citas del mes
    const monthStart = new Date(year, monthIdx, 1);
    const monthEnd = new Date(year, monthIdx + 1, 0, 23, 59, 59);
    const existingAppointments = await this.appointmentModel.find({
      startAt: { $gte: monthStart, $lte: monthEnd },
      status: { $ne: 'cancelled' },
    }).lean();

    const days: SlotDay[] = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, monthIdx, d);
      if (date < today || date > maxDate) continue;
      if (!isBusinessDay(date)) continue;

      const dateStr = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const slots: string[] = [];

      for (let m = startMinutes; m + durationMinutes <= endMinutes; m += this.slotDuration) {
        const hour = Math.floor(m / 60);
        const min = m % 60;
        const slotLabel = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;

        // Verificar si es pasado (si es hoy)
        if (date.getTime() === today.getTime()) {
          const slotTime = new Date(year, monthIdx, d, hour, min);
          if (slotTime <= now) continue;
        }

        // Verificar overlap con citas existentes
        const slotStartUTC = new Date(Date.UTC(year, monthIdx, d, hour + 5, min)); // +5 para UTC
        const slotEndUTC = new Date(slotStartUTC.getTime() + durationMinutes * 60 * 1000);

        const isOccupied = existingAppointments.some((appt) => {
          const apptStart = new Date(appt.startAt).getTime();
          const apptEnd = new Date(appt.endAt).getTime();
          return slotStartUTC.getTime() < apptEnd && slotEndUTC.getTime() > apptStart;
        });

        if (!isOccupied) {
          slots.push(slotLabel);
        }
      }

      if (slots.length > 0) {
        days.push({ date: dateStr, slots });
      }
    }

    return { month: monthStr, duration: durationMinutes, days };
  }

  // ─── CREAR CITA ─────────────────────────────────────────────────────────────

  async create(dto: CreateAppointmentDto) {
    const [year, month, day] = dto.date.split('-').map(Number);
    const [hour, min] = dto.startTime.split(':').map(Number);

    // Construir fecha en UTC (Colombia es UTC-5)
    const startAt = new Date(Date.UTC(year, month - 1, day, hour + 5, min));
    const endAt = new Date(startAt.getTime() + dto.duration * 60 * 1000);

    // Validar día laborable
    const localDate = new Date(year, month - 1, day);
    if (!isBusinessDay(localDate)) {
      throw new BadRequestException('El día seleccionado no es laborable.');
    }

    // Validar que no sea en el pasado
    if (startAt <= new Date()) {
      throw new BadRequestException('No puedes agendar en una fecha/hora pasada.');
    }

    // Validar límite mensual por email
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const existingThisMonth = await this.appointmentModel.findOne({
      email: dto.email.toLowerCase().trim(),
      monthKey,
      status: { $ne: 'cancelled' },
    });
    if (existingThisMonth) {
      throw new ConflictException(
        'Ya tienes una cita agendada este mes. Podrás agendar nuevamente el próximo mes.',
      );
    }

    // Validar solapamiento
    const overlapping = await this.appointmentModel.findOne({
      startAt: { $lt: endAt },
      endAt: { $gt: startAt },
      status: { $ne: 'cancelled' },
    });
    if (overlapping) {
      throw new ConflictException('Este horario ya fue reservado. Selecciona otro.');
    }

    // Generar link de Jitsi
    const meetingId = crypto.randomUUID().slice(0, 8);
    const meetingLink = `${this.meetingLinkBase}${meetingId}`;

    // Crear cita
    const id = `APT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const appointment = await this.appointmentModel.create({
      id,
      name: dto.name.trim(),
      email: dto.email.toLowerCase().trim(),
      phone: dto.phone?.trim() || '',
      startAt,
      endAt,
      durationMinutes: dto.duration,
      meetingLink,
      status: 'confirmed',
      monthKey,
    });

    // Enviar correos
    await this.sendConfirmationEmails(appointment, dto.company);

    // Calcular endTime label
    const endHour = (hour + Math.floor((min + dto.duration) / 60));
    const endMin = (min + dto.duration) % 60;
    const endTimeLabel = `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;

    return {
      success: true,
      message: 'Cita agendada exitosamente. Revisa tu correo para los detalles.',
      data: {
        publicId: appointment.id,
        date: dto.date,
        startTime: dto.startTime,
        endTime: endTimeLabel,
        duration: dto.duration,
        meetingLink,
      },
    };
  }

  // ─── VERIFICAR LÍMITE MENSUAL ───────────────────────────────────────────────

  async canSchedule(email: string) {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const existing = await this.appointmentModel.findOne({
      email: email.toLowerCase().trim(),
      monthKey,
      status: { $ne: 'cancelled' },
    });

    if (existing) {
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return { canSchedule: false, nextAvailableMonth: nextMonth.toISOString().slice(0, 7) };
    }
    return { canSchedule: true };
  }

  // ─── CORREOS ────────────────────────────────────────────────────────────────

  private async sendConfirmationEmails(appointment: Appointment, company: string): Promise<void> {
    const dateFormatted = appointment.startAt.toLocaleDateString('es-CO', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: this.timezone,
    });
    const timeFormatted = appointment.startAt.toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: this.timezone,
    });

    const clientHtml = `
      <h2>¡Tu cita con Cheky está confirmada! ✅</h2>
      <p>Hola <strong>${appointment.name}</strong>,</p>
      <p>Tu reunión con el equipo de Cheky ha sido agendada:</p>
      <table style="margin: 16px 0; border-collapse: collapse;">
        <tr><td style="padding: 8px 16px; font-weight: bold;">Fecha:</td><td style="padding: 8px 16px;">${dateFormatted}</td></tr>
        <tr><td style="padding: 8px 16px; font-weight: bold;">Hora:</td><td style="padding: 8px 16px;">${timeFormatted}</td></tr>
        <tr><td style="padding: 8px 16px; font-weight: bold;">Duración:</td><td style="padding: 8px 16px;">${appointment.durationMinutes} minutos</td></tr>
        <tr><td style="padding: 8px 16px; font-weight: bold;">Link:</td><td style="padding: 8px 16px;"><a href="${appointment.meetingLink}">${appointment.meetingLink}</a></td></tr>
      </table>
      <p>Ingresa al link de la videollamada a la hora indicada. ¡Te esperamos!</p>
      <p style="color: #666; font-size: 13px;">— Equipo Cheky</p>
    `;

    const salesHtml = `
      <h2>Nueva cita agendada desde la landing 📅</h2>
      <table style="margin: 16px 0; border-collapse: collapse;">
        <tr><td style="padding: 8px 16px; font-weight: bold;">Nombre:</td><td style="padding: 8px 16px;">${appointment.name}</td></tr>
        <tr><td style="padding: 8px 16px; font-weight: bold;">Email:</td><td style="padding: 8px 16px;">${appointment.email}</td></tr>
        <tr><td style="padding: 8px 16px; font-weight: bold;">Empresa:</td><td style="padding: 8px 16px;">${company}</td></tr>
        <tr><td style="padding: 8px 16px; font-weight: bold;">Teléfono:</td><td style="padding: 8px 16px;">${appointment.phone || '—'}</td></tr>
        <tr><td style="padding: 8px 16px; font-weight: bold;">Fecha:</td><td style="padding: 8px 16px;">${dateFormatted}</td></tr>
        <tr><td style="padding: 8px 16px; font-weight: bold;">Hora:</td><td style="padding: 8px 16px;">${timeFormatted}</td></tr>
        <tr><td style="padding: 8px 16px; font-weight: bold;">Duración:</td><td style="padding: 8px 16px;">${appointment.durationMinutes} min</td></tr>
        <tr><td style="padding: 8px 16px; font-weight: bold;">Link:</td><td style="padding: 8px 16px;"><a href="${appointment.meetingLink}">${appointment.meetingLink}</a></td></tr>
      </table>
    `;

    await this.emailService.sendEmail({
      to: appointment.email,
      subject: 'Tu cita con Cheky está confirmada ✅',
      htmlBody: clientHtml,
    }).catch((e) => this.logger.error('Error enviando correo al cliente', e));

    await this.emailService.sendEmail({
      to: this.salesInbox,
      subject: `Nueva cita: ${appointment.name} — ${dateFormatted} ${timeFormatted}`,
      htmlBody: salesHtml,
    }).catch((e) => this.logger.error('Error enviando correo a ventas', e));
  }
}
