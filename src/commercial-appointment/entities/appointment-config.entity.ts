import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } })
export class AppointmentConfig extends Document {
  /** Días hábiles: 1=lun … 5=vie */
  @Prop({ type: [Number], default: [1, 2, 3, 4, 5] })
  availableDays!: number[];

  /** Hora inicio jornada (Colombia) */
  @Prop({ default: '08:00' })
  startHour!: string;

  /** Hora fin jornada (Colombia) */
  @Prop({ default: '18:00' })
  endHour!: string;

  /** Intervalo entre slots en minutos */
  @Prop({ default: 15 })
  slotDuration!: number;

  /** Duraciones que el usuario puede elegir (en minutos) */
  @Prop({ type: [Number], default: [15, 30, 45, 60] })
  allowedDurations!: number[];

  /** Base del link de reunión (se concatena con publicId) */
  @Prop({ default: 'https://meet.jit.si/cheky-reunion-' })
  defaultMeetingLinkBase!: string;

  @Prop({ default: 'America/Bogota' })
  timezone!: string;

  /** Máximo de días en el futuro para agendar */
  @Prop({ default: 30 })
  maxAdvanceDays!: number;

  /** Fechas bloqueadas manualmente (formato YYYY-MM-DD) */
  @Prop({ type: [String], default: [] })
  blockedDates!: string[];
}

export const AppointmentConfigSchema =
  SchemaFactory.createForClass(AppointmentConfig);
