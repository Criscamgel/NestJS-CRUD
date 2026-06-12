import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'cancelled'
  | 'completed';

@Schema({ timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } })
export class CommercialAppointment extends Document {
  @Prop({ unique: true, index: true, required: true })
  publicId!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, index: true })
  email!: string;

  @Prop({ required: true })
  company!: string;

  @Prop()
  phone?: string;

  /** Fecha de la cita (solo fecha, sin hora) */
  @Prop({ required: true, index: true })
  date!: Date;

  /** Hora inicio en formato "HH:mm" (hora Colombia) */
  @Prop({ required: true })
  startTime!: string;

  /** Hora fin en formato "HH:mm" (calculado: startTime + duration) */
  @Prop({ required: true })
  endTime!: string;

  /** Duración en minutos: 15 | 30 | 45 | 60 */
  @Prop({ required: true })
  duration!: number;

  /** Link auto-generado de Jitsi Meet */
  @Prop({ required: true })
  meetingLink!: string;

  /** Link manual puesto por admin (sobreescribe meetingLink en los emails) */
  @Prop()
  meetingLinkOverride?: string;

  @Prop({ default: 'America/Bogota' })
  timezone!: string;

  @Prop({ default: 'scheduled', index: true })
  status!: AppointmentStatus;

  @Prop()
  notes?: string;

  /** Token para que el usuario cancele por email */
  @Prop({ required: true, index: true })
  cancellationToken!: string;

  @Prop()
  cancelledAt?: Date;

  @Prop()
  cancellationReason?: string;

  /** Timestamps automáticos de Mongoose */
  createdAt!: Date;
  updatedAt!: Date;
}

export const CommercialAppointmentSchema =
  SchemaFactory.createForClass(CommercialAppointment);
