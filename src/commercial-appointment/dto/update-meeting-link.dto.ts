import { IsString, IsUrl, MaxLength } from 'class-validator';

export class UpdateMeetingLinkDto {
  @IsString()
  @IsUrl({}, { message: 'Debe ser una URL válida' })
  @MaxLength(500)
  meetingLink: string;
}
