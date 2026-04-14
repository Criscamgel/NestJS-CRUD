import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsPositive,
  IsString,
  MinLength,
  Min,
  IsNumber,
  IsOptional,
} from 'class-validator';

export class CreatePlanDto {
  @IsString()
  @MinLength(2)
  name!: string;

  /** Usuarios normales (rol user) permitidos por compañía. */
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  maxUsers!: number;

  /** Checks permitidos por mes calendario. */
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  maxChecks!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationMonths!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthlyPrice!: number;

  @IsOptional()
  @IsString()
  @MinLength(3)
  currency?: string;

  /** Mostrar en el catálogo de planes (por defecto true en entidad). */
  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;
}
