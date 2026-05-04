import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class BoldStartCheckoutDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+$/, { message: 'planId debe ser el id numérico del plan' })
  planId!: string;
}

export class BoldConfirmDto {
  @IsString()
  @IsNotEmpty()
  paymentLink!: string;
}

export class BoldIntegrityHashDto {
  @IsString()
  @IsNotEmpty()
  orderId!: string;

  @IsString()
  @IsNotEmpty()
  amount!: string;

  @IsString()
  @IsNotEmpty()
  currency!: string;
}
