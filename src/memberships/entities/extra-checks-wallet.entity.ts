import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * Bolsa de checks adicionales de una empresa.
 * Un solo documento por empresa — saldo acumulable sin vencimiento.
 */
@Schema({ timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } })
export class ExtraChecksWallet extends Document {
  @Prop({ required: true, unique: true, index: true })
  companyId!: string;

  /** Total de checks comprados históricamente. */
  @Prop({ default: 0, min: 0 })
  totalPurchased!: number;

  /** Total de checks adicionales consumidos históricamente. */
  @Prop({ default: 0, min: 0 })
  totalUsed!: number;
}

export const ExtraChecksWalletSchema = SchemaFactory.createForClass(ExtraChecksWallet);
