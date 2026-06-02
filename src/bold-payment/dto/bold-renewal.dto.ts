import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class BoldStartRenewalDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  months!: number;
}
