import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsPositive,
  IsString,
  MinLength,
  Min,
  IsNumber,
  IsOptional,
} from 'class-validator';
import { PLAN_CURRENCY_CODES } from 'src/common/catalog/plan-currencies.catalog';

export class CreatePlanDto {
  @IsString()
  @MinLength(2)
  name!: string;

  /** Usuarios normales (rol user) permitidos por compañía. */
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  maxUsers!: number;

  /** Sedes permitidas por empresa (0 permitido). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxBranches?: number;

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
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsIn(PLAN_CURRENCY_CODES, {
    message: `La moneda debe ser una de: ${PLAN_CURRENCY_CODES.join(', ')}`,
  })
  currency?: string;

  /** Mostrar en el catálogo de planes (por defecto true en entidad). */
  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;
}
