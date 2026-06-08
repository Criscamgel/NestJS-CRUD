import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SubscriptionPeriodStatus = 'active' | 'upcoming' | 'expired';

/**
 * Período mensual de una membresía. Cada mes del plan tiene su propio documento
 * con checks asignados y consumidos.
 */
@Schema({ timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } })
export class SubscriptionPeriod extends Document {
  @Prop({ required: true, index: true })
  companyId!: string;

  @Prop({ required: true, index: true })
  membershipId!: string;

  @Prop({ required: true })
  planId!: string;

  @Prop({ required: true })
  startDate!: Date;

  @Prop({ required: true })
  endDate!: Date;

  /** Checks asignados para este período (del plan). */
  @Prop({ required: true, min: 0 })
  checksAssigned!: number;

  /** Checks consumidos en este período. */
  @Prop({ default: 0, min: 0 })
  checksUsed!: number;

  @Prop({ required: true, default: 'upcoming' })
  status!: SubscriptionPeriodStatus;
}

export const SubscriptionPeriodSchema = SchemaFactory.createForClass(SubscriptionPeriod);
