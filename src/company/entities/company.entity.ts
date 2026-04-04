import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class Company extends Document {
  @Prop({ unique: true, index: true, required: true })
  id!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, unique: true })
  nit!: string;

  @Prop({ default: true })
  isActive!: boolean;
}

export const CompanySchema = SchemaFactory.createForClass(Company);
