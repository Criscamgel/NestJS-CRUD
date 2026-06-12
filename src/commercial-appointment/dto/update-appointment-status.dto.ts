import { IsIn, IsString } from 'class-validator';

const ALLOWED_STATUSES = ['scheduled', 'confirmed', 'cancelled', 'completed'];

export class UpdateAppointmentStatusDto {
  @IsString()
  @IsIn(ALLOWED_STATUSES, {
    message: 'Estado debe ser: scheduled, confirmed, cancelled o completed',
  })
  status: string;
}
