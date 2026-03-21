import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";


export class LoginUserDto {

    @IsString()
    @IsEmail()
    email!: string;

    @IsString()
    @MinLength(6)
    @MaxLength(50)
    @Matches(
    /(?:(?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message: 'La contraseña debe contener una mayúscula, una minúscula, un carácter especial y un número.'
})
    password!: string;

}