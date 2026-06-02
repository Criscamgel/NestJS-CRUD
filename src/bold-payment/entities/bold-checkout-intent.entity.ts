import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BoldCheckoutSource =
  | 'landing'
  | 'company_admin'
  | 'checks_topup'
  | 'renewal';

export type BoldCheckoutIntentStatus = 'pending' | 'completed' | 'failed';

@Schema({ timestamps: true })
export class BoldCheckoutIntent extends Document {
  /** Referencia interna enviada a Bold en `description`. */
  @Prop({ required: true, unique: true, index: true })
  ref!: string;

  /** Plan contratado; en `checks_topup` es el plan de la membresía vigente. */
  @Prop({ required: true, index: true })
  planId!: string;

  /** Solo `checks_topup`: cantidad de checks comprados. */
  @Prop({ min: 1 })
  checksQuantity?: number;

  /** Solo `renewal`: meses a agregar al periodo vigente. */
  @Prop({ min: 1 })
  renewalMonths?: number;

  @Prop({ required: true })
  amountTotal!: number;

  @Prop({ default: 'USD' })
  currency!: string;

  @Prop({ required: true })
  source!: BoldCheckoutSource;

  @Prop()
  companyId?: string;

  /** `User.id` (string) del admin que inició el pago. */
  @Prop()
  initiatedByUserId?: string;

  @Prop()
  boldPaymentLinkId?: string;

  @Prop({ default: 'pending' })
  status!: BoldCheckoutIntentStatus;

  /** Email normalizado indicado en la landing tras pago (para el enlace de registro admin). */
  @Prop()
  landingOnboardingEmail?: string;

  @Prop()
  landingOnboardingCompletedAt?: Date;

  /** Marca acreditación en membresía (`checksTopupBonus`) para idempotencia. */
  @Prop()
  checksTopupAppliedAt?: Date;
}

export const BoldCheckoutIntentSchema =
  SchemaFactory.createForClass(BoldCheckoutIntent);
