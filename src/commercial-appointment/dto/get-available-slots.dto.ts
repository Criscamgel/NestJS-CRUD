import { Type } from 'class-transformer';
import { IsInt, IsIn, IsString, Matches } from 'class-validator';

const ALLOWED_DURATIONS = [15, 30, 45, 60];

export class GetAvailableSlotsDto {
  /** Mes en formato YYYY-MM */
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, {
    message: 'El mes debe tener formato YYYY-MM',
  })
  month: string;

  /** Duración deseada para calcular slots disponibles */
  @Type(() => Number)
  @IsInt()
  @IsIn(ALLOWED_DURATIONS, {
    message: 'La duración debe ser 15, 30, 45 o 60 minutos',
  })
  duration: number;
}
