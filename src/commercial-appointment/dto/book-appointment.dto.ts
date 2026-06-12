import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const ALLOWED_DURATIONS = [15, 30, 45, 60];

export class BookAppointmentDto {
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(120)
  name: string;

  @IsEmail({}, { message: 'Email no válido' })
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(1, { message: 'La empresa es obligatoria' })
  @MaxLength(200)
  company: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  /** Fecha en formato YYYY-MM-DD */
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha debe tener formato YYYY-MM-DD',
  })
  date: string;

  /** Hora inicio en formato HH:mm */
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, {
    message: 'La hora debe tener formato HH:mm',
  })
  startTime: string;

  @IsInt()
  @IsIn(ALLOWED_DURATIONS, {
    message: 'La duración debe ser 15, 30, 45 o 60 minutos',
  })
  duration: number;

  @IsOptional()
  @IsString()
  turnstileToken?: string;
}
