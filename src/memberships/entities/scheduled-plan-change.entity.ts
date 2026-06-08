import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ScheduledPlanStatus = 'pending' | 'activated' | 'cancelled';

/**
 * Plan programado (renovación o cambio de plan) que se activará
 * al día siguiente del vencimiento del plan actual.
 */
@Schema({ timestamps: true })
export class ScheduledPlanChange extends Document {
  @Prop({ required: true, index: true })
  companyId!: string;

  /** Plan que se activará. */
  @Prop({ required: true })
  planId!: string;

  /** Meses de duración del nuevo plan/renovación. */
  @Prop({ required: true, min: 1 })
  durationMonths!: number;

  /** Fecha de inicio programada (día siguiente al vencimiento actual). */
  @Prop({ required: true })
  startsAt!: Date;

  /** Tipo: 'renewal' = mismo plan, 'plan_change' = plan diferente. */
  @Prop({ required: true })
  type!: 'renewal' | 'plan_change';

  @Prop({ default: 'pending' })
  status!: ScheduledPlanStatus;

  /** Referencia del pago Bold (idempotencia). */
  @Prop({ required: true, unique: true, index: true })
  paymentRef!: string;

  /** Monto pagado. */
  @Prop({ required: true })
  amountPaid!: number;

  @Prop({ default: 'USD' })
  currency!: string;

  /** Usuario que inició la operación. */
  @Prop()
  initiatedByUserId?: string;

  /** Fecha en la que se activó (null si aún está pending). */
  @Prop()
  activatedAt?: Date;
}

export const ScheduledPlanChangeSchema = SchemaFactory.createForClass(ScheduledPlanChange);
