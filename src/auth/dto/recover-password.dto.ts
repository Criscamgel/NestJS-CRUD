import { IsEmail, IsOptional, IsString } from 'class-validator';

export class RecoverPasswordDto {
  @IsString()
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  turnstileToken?: string;
}
