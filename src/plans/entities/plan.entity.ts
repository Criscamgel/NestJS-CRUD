import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ toJSON: { virtuals: true }, toObject: { virtuals: true } })
export class Plan extends Document {
  @Prop({ unique: true, index: true, required: true })
  id!: string;

  @Prop({ required: true, unique: true, index: true })
  name!: string;

  /** Cupo de usuarios con rol `user` (no incluye admins). */
  @Prop({ required: true, min: 1 })
  maxUsers!: number;

  /** Máximo de sedes por empresa (0 = ninguna sede permitida). */
  @Prop({ required: true, min: 0, default: 0 })
  maxBranches!: number;

  /** Máximo de checks por mes calendario (YYYY-MM). */
  @Prop({ required: true, min: 1 })
  maxChecksPerMonth!: number;

  /** Duración mínima de la membresía en meses (recurrencia). */
  @Prop({ required: true, min: 1 })
  durationMonths!: number;

  @Prop({ required: true, min: 0 })
  monthlyPrice!: number;

  @Prop({ default: 'COP' })
  currency!: string;

  @Prop({ default: true })
  isActive!: boolean;

  /** Visible en catálogo público de planes (independiente de isActive). */
  @Prop({ default: true })
  isVisible!: boolean;
}

export const PlanSchema = SchemaFactory.createForClass(Plan);
