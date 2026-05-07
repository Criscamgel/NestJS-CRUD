import { Type } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  PASSWORD_COMPLEXITY_MESSAGE,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MAX_LENGTH_MESSAGE,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MIN_LENGTH_MESSAGE,
  PASSWORD_STRENGTH_REGEX,
} from 'src/common/validators/password-policy';

export class RequestLandingAdminOnboardingDto {
  @IsString()
  @IsNotEmpty()
  paymentLink!: string;

  @IsEmail()
  @IsNotEmpty()
  email!: string;
}

export class VerifyLandingOnboardingDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}

export class LandingOnboardingCompanyDto {
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
}

export class CompleteLandingOnboardingDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @MinLength(5)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9\-\.]{4,19}$/, {
    message:
      'El documento debe tener entre 5 y 20 caracteres y solo puede contener letras, números, puntos y guiones',
  })
  document!: string;

  @IsString()
  @MinLength(3)
  name!: string;

  @IsString()
  @MinLength(3)
  lastName!: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, { message: PASSWORD_MIN_LENGTH_MESSAGE })
  @MaxLength(PASSWORD_MAX_LENGTH, { message: PASSWORD_MAX_LENGTH_MESSAGE })
  @Matches(PASSWORD_STRENGTH_REGEX, { message: PASSWORD_COMPLEXITY_MESSAGE })
  password!: string;

  @IsString()
  @IsNotEmpty()
  verifyPassword!: string;

  @ValidateNested()
  @Type(() => LandingOnboardingCompanyDto)
  company!: LandingOnboardingCompanyDto;
}
