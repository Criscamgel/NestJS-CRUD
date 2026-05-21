import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import {
  CHECK_TOPUP_MAX_QUANTITY,
  CHECK_TOPUP_MIN_QUANTITY,
} from 'src/common/constants/check-topup.constants';

export class BoldStartChecksTopupDto {
  @Type(() => Number)
  @IsInt()
  @Min(CHECK_TOPUP_MIN_QUANTITY)
  @Max(CHECK_TOPUP_MAX_QUANTITY)
  quantity!: number;
}
