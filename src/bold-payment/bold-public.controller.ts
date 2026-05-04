import { Body, Controller, Post } from '@nestjs/common';
import { BoldPaymentService } from './bold-payment.service';
import {
  BoldConfirmDto,
  BoldIntegrityHashDto,
  BoldStartCheckoutDto,
} from './dto/bold-checkout.dto';

@Controller('public/bold')
export class BoldPublicController {
  constructor(private readonly boldPaymentService: BoldPaymentService) {}

  @Post('checkout')
  start(@Body() dto: BoldStartCheckoutDto) {
    return this.boldPaymentService.startLandingCheckout(dto.planId);
  }

  @Post('confirm')
  confirm(@Body() dto: BoldConfirmDto) {
    return this.boldPaymentService.confirmByPaymentLink(dto.paymentLink);
  }

  @Post('integrity-hash')
  integrity(@Body() dto: BoldIntegrityHashDto) {
    const hash = this.boldPaymentService.generateIntegrityHash(
      dto.orderId,
      dto.amount,
      dto.currency,
    );
    return { message: 'ok', data: { hash } };
  }
}
