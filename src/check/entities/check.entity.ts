import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

@Schema({ timestamps: true })
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

    /** Número de documento de identidad registrado al crear el check. */
    @Prop({ trim: true })
    documentNumber?: string;

    /** `User.id` (string) del operador que creó el registro; ausente en datos legacy. */
    @Prop({ index: true })
    createdByUserId?: string;

    /** Empresa (`Company.id`) asociada al check; admin de empresa filtra por este campo. */
    @Prop({ index: true })
    companyId?: string;

    /** Respuesta JSON de RiskSeal / credit-scoring (persistida para reconsulta sin llamar de nuevo). */
    @Prop({ type: Object })
    riskSealResponse?: Record<string, unknown>;

    /** Puntuación 0–100 denormalizada para listados (sin enviar `riskSealResponse`). */
    @Prop({ index: true })
    trustScore?: number;

}

export const CheckSchema = SchemaFactory.createForClass( Check );
