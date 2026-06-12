import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AppointmentStatus = 'confirmed' | 'cancelled' | 'completed';

/**
 * Cita agendada por un visitante desde la landing pública.
 */
@Schema({ timestamps: true })
export class Appointment extends Document {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  /** Nombre del visitante. */
  @Prop({ required: true })
  name!: string;

  /** Correo del visitante. */
  @Prop({ required: true, index: true })
  email!: string;

  /** Teléfono del visitante. */
  @Prop({ required: true })
  phone!: string;

  /** Fecha y hora de inicio de la cita (UTC). */
  @Prop({ required: true, index: true })
  startAt!: Date;

  /** Fecha y hora de fin de la cita (UTC). */
  @Prop({ required: true })
  endAt!: Date;

  /** Duración en minutos. */
  @Prop({ required: true })
  durationMinutes!: number;

  /** Link de videollamada generado (Jitsi). */
  @Prop({ required: true })
  meetingLink!: string;

  @Prop({ default: 'confirmed' })
  status!: AppointmentStatus;

  /** Mes en formato YYYY-MM para control de una cita por mes por email. */
  @Prop({ required: true, index: true })
  monthKey!: string;
}

export const AppointmentSchema = SchemaFactory.createForClass(Appointment);

// Índice compuesto: un email solo puede tener una cita por mes
AppointmentSchema.index({ email: 1, monthKey: 1 }, { unique: true });
