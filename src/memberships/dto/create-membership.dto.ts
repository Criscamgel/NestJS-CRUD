import { IsString, Matches, MinLength } from 'class-validator';

export class CreateMembershipDto {
  @IsString()
  @MinLength(1)
  @Matches(/^\d+$/, { message: 'company debe ser un id numérico' })
  companyId!: string;

  @IsString()
  @MinLength(1)
  @Matches(/^\d+$/, { message: 'planId debe ser un id numérico' })
  planId!: string;
}
