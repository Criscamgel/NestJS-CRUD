import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

@Schema()
export class Check extends Document {

    @Prop({
        unique: true,
        index: true,
        required: true
    })
    id!: string;
    
    @Prop({
        required: true
    })
    name!: string;

    @Prop({
        required: true
    })
    lastName!: string;

    @Prop({
        required: true
    })
    email!: string;

    @Prop({
        required: true
    })
    mobile!: string;

    /** `User.id` (string) del operador que creó el registro; ausente en datos legacy. */
    @Prop({ index: true })
    createdByUserId?: string;

}

export const CheckSchema = SchemaFactory.createForClass( Check );
