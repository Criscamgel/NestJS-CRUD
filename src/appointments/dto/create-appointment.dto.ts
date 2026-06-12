import { IsEmail, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAppointmentDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  company!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  /** Fecha en formato YYYY-MM-DD. */
  @IsString()
  date!: string;

  /** Hora de inicio en formato HH:mm (ej: "09:00"). */
  @IsString()
  startTime!: string;

  /** Duración en minutos (15, 30, 45, 60). */
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(60)
  duration!: number;

  @IsOptional()
  @IsString()
  turnstileToken?: string;
}
