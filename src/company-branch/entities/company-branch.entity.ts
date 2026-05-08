import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class CompanyBranch extends Document {
  @Prop({ unique: true, index: true, required: true })
  id!: string;

  @Prop({ required: true, index: true })
  companyId!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  address!: string;

  @Prop({ required: true })
  city!: string;

  @Prop({ default: true })
  isActive!: boolean;
}

export const CompanyBranchSchema = SchemaFactory.createForClass(CompanyBranch);

CompanyBranchSchema.index({ companyId: 1, name: 1 });
