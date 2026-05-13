import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateCompanyDto {
  @IsString()
  @MinLength(3)
  name!: string;

  @IsString()
  @MinLength(3)
  nit!: string;

  @IsString()
  @MinLength(3)
  city!: string;

  @IsString()
  @MinLength(3)
  sector!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  legalRepresentativeName!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(20)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9\-.]{4,19}$/, {
    message:
      'idNumber must be 5-20 characters; letters, numbers, dots and hyphens only',
  })
  idNumber!: string;

  @IsString()
  @MinLength(7)
  @MaxLength(30)
  @Matches(/^[0-9+\-\s()]{7,30}$/, {
    message: 'phoneNumber: invalid phone format',
  })
  phoneNumber!: string;

  @IsEmail()
  email!: string;

  /** Chamber of Commerce renewal date (YYYY-MM-DD). */
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'chamberOfCommerceRenewalDate: use YYYY-MM-DD format',
  })
  chamberOfCommerceRenewalDate!: string;
}
