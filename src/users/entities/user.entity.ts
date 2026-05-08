import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

@Schema({
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
})
export class User extends Document {

    @Prop({
        unique: true,
        index: true,
        required: true
    })
    id!: string;

    @Prop({
        unique: true,
        index: true,
        required: true,
    })
    email!: string;

    @Prop({
        unique: true,
        index: true,
        required: true,
    })
    document!: string;

    @Prop({
        required: true
    })
    password!: string;

    @Prop({
        required: true
    })
    name!: string;

    @Prop({
        required: true
    })
    lastName!: string;


    @Prop({
        //required: true,
        default: ['user']
    })
    roles?: string[];

    @Prop({
        //required: true
    })
    company?: string;

    /** Sede (CompanyBranch.id) dentro de la misma empresa. */
    @Prop()
    branchId?: string;

    @Prop({
        default: true
    })
    isActive!: boolean;

    /** Último inicio de sesión exitoso */
    @Prop()
    lastAccessAt?: Date;

    get fullName(): string {
        return `${this.name} ${this.lastName}`;
    }
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.virtual('fullName').get(function () {
    return `${this.name} ${this.lastName}`;
});

UserSchema.pre('save', function () {
    this.email = this.email.toLowerCase().trim();
});

UserSchema.pre('findOneAndUpdate', function () {
    const update = this.getUpdate() as any;
    if (update.email) {
        update.email = update.email.toLowerCase().trim();
    }
});
