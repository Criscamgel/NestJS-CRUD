import { IsEmail, IsInt, IsISO8601, IsString, Max, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAppointmentDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(7)
  phone!: string;

  /** Fecha y hora de inicio en formato ISO 8601 (UTC). */
  @IsISO8601()
  startAt!: string;

  /** Duración en minutos (15, 30, 45, 60). */
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(60)
  durationMinutes!: number;
}
