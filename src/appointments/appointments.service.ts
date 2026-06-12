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

type TimeSlot = {
  startAt: string;
  endAt: string;
  available: boolean;
};

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

  private get startHour(): number {
    const h = this.configService.get<string>('APPOINTMENT_START_HOUR') || '08:00';
    return parseInt(h.split(':')[0], 10);
  }

  private get endHour(): number {
    const h = this.configService.get<string>('APPOINTMENT_END_HOUR') || '18:00';
    return parseInt(h.split(':')[0], 10);
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

  // ─── SLOTS DISPONIBLES ──────────────────────────────────────────────────────

  /**
   * Retorna los slots disponibles para un día dado.
   */
  async getAvailableSlots(dateStr: string, durationMinutes?: number): Promise<TimeSlot[]> {
    const duration = durationMinutes || 30;
    const date = new Date(dateStr + 'T00:00:00');

    // Validar que sea día laborable
    if (!isBusinessDay(date)) {
      return [];
    }

    // Validar que no sea en el pasado ni más allá del máximo
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const maxDate = new Date(today.getTime() + this.maxAdvanceDays * 24 * 60 * 60 * 1000);

    if (date < today || date > maxDate) {
      return [];
    }

    // Generar todos los slots del día
    const slots: TimeSlot[] = [];
    const startMinutes = this.startHour * 60;
    const endMinutes = this.endHour * 60;

    for (let m = startMinutes; m + duration <= endMinutes; m += this.slotDuration) {
      const slotStart = new Date(date);
      slotStart.setUTCHours(Math.floor(m / 60) + 5, m % 60, 0, 0); // +5 para UTC desde Colombia

      const slotEnd = new Date(slotStart.getTime() + duration * 60 * 1000);

      slots.push({
        startAt: slotStart.toISOString(),
        endAt: slotEnd.toISOString(),
        available: true,
      });
    }

    // Filtrar slots pasados (si es hoy)
    const filteredSlots = slots.filter((s) => new Date(s.startAt) > now);

    // Obtener citas existentes del día
    const dayStart = new Date(date);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setUTCHours(23, 59, 59, 999);

    const existingAppointments = await this.appointmentModel.find({
      startAt: { $gte: dayStart, $lte: dayEnd },
      status: { $ne: 'cancelled' },
    }).lean();

    // Marcar como no disponibles los que se solapan
    return filteredSlots.map((slot) => {
      const slotStart = new Date(slot.startAt).getTime();
      const slotEnd = new Date(slot.endAt).getTime();

      const isOccupied = existingAppointments.some((appt) => {
        const apptStart = new Date(appt.startAt).getTime();
        const apptEnd = new Date(appt.endAt).getTime();
        return slotStart < apptEnd && slotEnd > apptStart;
      });

      return { ...slot, available: !isOccupied };
    });
  }

  // ─── CREAR CITA ─────────────────────────────────────────────────────────────

  /**
   * Agenda una cita. Valida disponibilidad, límite mensual y envía correos.
   */
  async create(dto: CreateAppointmentDto): Promise<{ message: string; appointment: object }> {
    const startAt = new Date(dto.startAt);
    const endAt = new Date(startAt.getTime() + dto.durationMinutes * 60 * 1000);

    // Validar día laborable
    if (!isBusinessDay(startAt)) {
      throw new BadRequestException('El día seleccionado no es laborable.');
    }

    // Validar que no sea en el pasado
    if (startAt <= new Date()) {
      throw new BadRequestException('No puedes agendar en una fecha/hora pasada.');
    }

    // Validar límite de una cita por mes por email
    const monthKey = `${startAt.getFullYear()}-${String(startAt.getMonth() + 1).padStart(2, '0')}`;
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

    // Validar que el slot esté disponible (no solapamiento)
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
      phone: dto.phone.trim(),
      startAt,
      endAt,
      durationMinutes: dto.durationMinutes,
      meetingLink,
      status: 'confirmed',
      monthKey,
    });

    // Enviar correos
    await this.sendConfirmationEmails(appointment);

    return {
      message: 'Cita agendada exitosamente. Revisa tu correo para los detalles.',
      appointment: {
        id: appointment.id,
        startAt: appointment.startAt,
        endAt: appointment.endAt,
        meetingLink: appointment.meetingLink,
      },
    };
  }

  // ─── VERIFICAR SI PUEDE AGENDAR ────────────────────────────────────────────

  /**
   * Verifica si un email ya tiene cita este mes.
   */
  async canSchedule(email: string): Promise<{ canSchedule: boolean; nextAvailableMonth?: string }> {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const existing = await this.appointmentModel.findOne({
      email: email.toLowerCase().trim(),
      monthKey,
      status: { $ne: 'cancelled' },
    });

    if (existing) {
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return {
        canSchedule: false,
        nextAvailableMonth: nextMonth.toISOString().slice(0, 7),
      };
    }

    return { canSchedule: true };
  }

  // ─── CORREOS ────────────────────────────────────────────────────────────────

  private async sendConfirmationEmails(appointment: Appointment): Promise<void> {
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
        <tr><td style="padding: 8px 16px; font-weight: bold;">Teléfono:</td><td style="padding: 8px 16px;">${appointment.phone}</td></tr>
        <tr><td style="padding: 8px 16px; font-weight: bold;">Fecha:</td><td style="padding: 8px 16px;">${dateFormatted}</td></tr>
        <tr><td style="padding: 8px 16px; font-weight: bold;">Hora:</td><td style="padding: 8px 16px;">${timeFormatted}</td></tr>
        <tr><td style="padding: 8px 16px; font-weight: bold;">Duración:</td><td style="padding: 8px 16px;">${appointment.durationMinutes} min</td></tr>
        <tr><td style="padding: 8px 16px; font-weight: bold;">Link:</td><td style="padding: 8px 16px;"><a href="${appointment.meetingLink}">${appointment.meetingLink}</a></td></tr>
      </table>
    `;

    // Correo al cliente
    await this.emailService.sendEmail({
      to: appointment.email,
      subject: 'Tu cita con Cheky está confirmada ✅',
      htmlBody: clientHtml,
    }).catch((e) => this.logger.error('Error enviando correo al cliente', e));

    // Correo a ventas
    await this.emailService.sendEmail({
      to: this.salesInbox,
      subject: `Nueva cita: ${appointment.name} — ${dateFormatted} ${timeFormatted}`,
      htmlBody: salesHtml,
    }).catch((e) => this.logger.error('Error enviando correo a ventas', e));
  }
}
