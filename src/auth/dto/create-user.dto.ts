import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";


export class CreateUserDto {

    @IsOptional()
    @IsString()
    id?: string;

    @IsString()
    @IsEmail()
    email!: string;

    @Matches(/^[A-Za-z0-9][A-Za-z0-9\-\.]{4,19}$/, {
  message:
    'El documento debe tener entre 5 y 20 caracteres y solo puede contener letras, números, puntos y guiones',
})
    document!: string;

    @IsString()
    @MinLength(6)
    @MaxLength(50)
    @Matches(
    /(?:(?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message: 'The password must have a Uppercase, lowercase letter and a number'
})
    password!: string;

    @IsString()
    @MinLength(3)
    name!: string;

    @IsString()
    @MinLength(3)
    lastName!: string;


}