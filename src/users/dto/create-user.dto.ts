import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ValidRoles } from '../../auth/interfaces/valid-roles';
import {
  PASSWORD_COMPLEXITY_MESSAGE,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MAX_LENGTH_MESSAGE,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MIN_LENGTH_MESSAGE,
  PASSWORD_STRENGTH_REGEX,
} from 'src/common/validators/password-policy';

export class CreateUserDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @IsEmail()
  email!: string;

  @Matches(/^[A-Za-z0-9][A-Za-z0-9\-\.]{4,19}$/, {
    message:
      'El documento debe tener entre 5 y 20 caracteres y solo puede contener letras, números, puntos y guiones',
  })
  document!: string;

  @IsOptional()
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, { message: PASSWORD_MIN_LENGTH_MESSAGE })
  @MaxLength(PASSWORD_MAX_LENGTH, { message: PASSWORD_MAX_LENGTH_MESSAGE })
  @Matches(PASSWORD_STRENGTH_REGEX, { message: PASSWORD_COMPLEXITY_MESSAGE })
  password?: string;

  @IsString()
  @MinLength(3)
  name!: string;

  @IsString()
  @MinLength(3)
  lastName!: string;

  @IsEnum(ValidRoles, {
    message: `El rol debe ser válido: admin, superAdmin, user`,
  })
  role!: ValidRoles;

  @IsOptional()
  @IsString()
  company?: string;
}
