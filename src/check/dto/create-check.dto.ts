import { Type } from "class-transformer";
import { IsEmail, IsInt, IsOptional, IsPositive, IsString, MinLength } from "class-validator";

export class CreateCheckDto {

        // @Type(() => Number)
        // @IsInt()
        // @IsPositive()
        // id?: string;

        //@Type(() => String)
        @IsOptional()
        @IsString()
        id?: string;
    
        @IsString()
        @MinLength(1)
        name!: string;
    
        @IsString()
        @MinLength(1)
        lastname!: string;
    
        @IsString()
        @MinLength(1)
        @IsEmail()
        email!: string;
    
        @IsString()
        @MinLength(1)
        mobile!: string;

}
