import { Body, Controller, Post } from '@nestjs/common';
import { BoldPaymentService } from './bold-payment.service';
import { BoldStartCheckoutDto } from './dto/bold-checkout.dto';
import { Auth, GetUser } from 'src/auth/decorators';
import { ValidRoles } from 'src/auth/interfaces';
import { User } from 'src/users/entities/user.entity';

@Controller('plans')
export class BoldCompanyPlansController {
  constructor(private readonly boldPaymentService: BoldPaymentService) {}

  @Post('checkout/bold')
  @Auth(ValidRoles.admin)
  checkoutBold(@Body() dto: BoldStartCheckoutDto, @GetUser() user: User) {
    return this.boldPaymentService.startCompanyAdminCheckout(dto.planId, user);
  }
}
