import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * Registro individual de compra de checks adicionales (ledger).
 * Garantiza trazabilidad e idempotencia.
 */
@Schema({ timestamps: true })
export class ExtraChecksPurchase extends Document {
  @Prop({ required: true, index: true })
  companyId!: string;

  /** Cantidad de checks comprados en esta transacción. */
  @Prop({ required: true, min: 1 })
  quantity!: number;

  @Prop({ required: true })
  purchasedAt!: Date;

  /** Referencia del pago Bold (para idempotencia). */
  @Prop({ required: true, unique: true, index: true })
  paymentRef!: string;

  /** Monto pagado. */
  @Prop({ required: true })
  amountPaid!: number;

  @Prop({ default: 'USD' })
  currency!: string;
}

export const ExtraChecksPurchaseSchema = SchemaFactory.createForClass(ExtraChecksPurchase);
