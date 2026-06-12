import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CancelAppointmentDto {
  @IsString()
  @MinLength(1)
  cancellationToken: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
