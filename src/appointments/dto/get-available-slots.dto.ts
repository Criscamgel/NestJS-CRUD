import { IsISO8601, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GetAvailableSlotsDto {
  /** Fecha del día a consultar en formato ISO (YYYY-MM-DD). */
  @IsISO8601()
  date!: string;

  /** Duración deseada en minutos (15, 30, 45, 60). Default: 30. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(60)
  duration?: number;
}
