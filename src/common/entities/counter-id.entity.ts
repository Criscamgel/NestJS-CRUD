import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CounterIdDocument = HydratedDocument<CounterId>;

@Schema()
export class CounterId{

  @Prop({ type: String })   // <--- aquí el cambio importante
  _id: string | undefined;

  @Prop({ default: 0 })
  seq!: number;
}

export const CounterIdSchema = SchemaFactory.createForClass(CounterId);