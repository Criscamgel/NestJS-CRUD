import { IsIn, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { COMPANY_CITY_IDS } from 'src/common/constants/company-city-ids';

export class CreateCompanyBranchDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  address!: string;

  @IsString()
  @IsNotEmpty()
  @IsIn([...COMPANY_CITY_IDS], { message: 'Ciudad no válida para el catálogo' })
  city!: string;
}
