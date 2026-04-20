import { IsEmail, IsIn, IsString, MaxLength, MinLength } from 'class-validator';

/** Valores del select “checks al mes” (landing + validación alineadas) */
export const CONTACT_DEMO_VOLUME_VALUES = [
  '1-100',
  '100-1000',
  '1000-10000',
  '10000+',
] as const;

export class ContactDemoDto {
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(120)
  name: string;

  @IsEmail({}, { message: 'Email no válido' })
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(1, { message: 'La empresa es obligatoria' })
  @MaxLength(200)
  company: string;

  @IsString()
  @IsIn([...CONTACT_DEMO_VOLUME_VALUES], {
    message: 'Selecciona un volumen de checks válido',
  })
  volume: string;
}
