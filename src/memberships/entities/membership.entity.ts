import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { MembershipStatus } from '../membership-status.enum';

@Schema({ timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } })
export class Membership extends Document {
  @Prop({ unique: true, index: true, required: true })
  id!: string;

  @Prop({ required: true, index: true })
  companyId!: string;

  @Prop({ required: true, index: true })
  planId!: string;

  @Prop({ required: true, enum: MembershipStatus, default: MembershipStatus.ACTIVE })
  status!: MembershipStatus;

  @Prop({ required: true })
  startedAt!: Date;

  @Prop({ required: true, index: true })
  expiresAt!: Date;

  @Prop({ required: true, min: 1 })
  durationMonthsSnapshot!: number;

  @Prop({ required: true, min: 1 })
  maxUsersSnapshot!: number;

  @Prop({ required: true, min: 1 })
  maxChecksPerMonthSnapshot!: number;

  /** Tope de checks en todo el periodo de membresía (maxChecks/mes × meses). */
  @Prop({ required: true, min: 1 })
  maxChecksForPeriodSnapshot!: number;

  @Prop({ default: 0, min: 0 })
  checksUsedInCurrentMonth!: number;

  /** Mes calendario `YYYY-MM` asociado a `checksUsedInCurrentMonth`. */
  @Prop({ default: '' })
  currentMonthKey!: string;

  @Prop({ default: 0, min: 0 })
  checksUsedInPeriod!: number;

  @Prop()
  deactivatedAt?: Date;

  @Prop()
  deactivatedBy?: string;

  @Prop()
  deactivationReason?: string;
}

export const MembershipSchema = SchemaFactory.createForClass(Membership);
