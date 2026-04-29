import { IsEmail, IsString, MinLength } from "class-validator";

/**
 * No incluir `id` ni otros campos de RiskSeal aquí: el servicio arma un cuerpo fijo
 * (`first_name`, `last_name`, `email`, `phone`). Si se reenviara `id` al proveedor,
 * RiskSeal responde "Original report not found".
 */
export class CreateCheckDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  lastName!: string;

  @IsString()
  @MinLength(1)
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  mobile!: string;
}
