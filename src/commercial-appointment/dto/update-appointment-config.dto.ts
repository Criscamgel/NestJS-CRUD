import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class UpdateAppointmentConfigDto {
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  availableDays?: number[];

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Formato HH:mm requerido' })
  startHour?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Formato HH:mm requerido' })
  endHour?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(60)
  slotDuration?: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  allowedDurations?: number[];

  @IsOptional()
  @IsString()
  defaultMeetingLinkBase?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  maxAdvanceDays?: number;
}
