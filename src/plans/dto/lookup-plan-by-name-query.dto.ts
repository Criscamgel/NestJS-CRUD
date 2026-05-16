import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Query `?name=` para búsqueda exacta de plan por nombre (insensible a mayúsculas). */
export class LookupPlanByNameQueryDto {
  @Transform(({ value }) => {
    if (value === undefined || value === null) return '';
    return String(value).trim();
  })
  @IsString()
  @IsNotEmpty({ message: 'El nombre del plan es obligatorio.' })
  @MaxLength(200)
  name!: string;
}
