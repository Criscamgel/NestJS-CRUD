import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Auth, GetUser } from 'src/auth/decorators';
import { ValidRoles } from 'src/auth/interfaces';
import { User } from 'src/users/entities/user.entity';
import { PaymentHistoryService } from './payment-history.service';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';

@Controller('payment-history')
export class PaymentHistoryController {
  constructor(private readonly paymentHistoryService: PaymentHistoryService) {}

  /** Listado paginado de pagos para admin/superAdmin. */
  @Get()
  @Auth(ValidRoles.superAdmin, ValidRoles.admin)
  findAll(
    @Query() paginationQuery: PaginationQueryDto,
    @GetUser() requester: User,
  ) {
    return this.paymentHistoryService.findAll(paginationQuery, requester);
  }

  /** Descarga de factura PDF por referencia de pago. */
  @Get(':ref/invoice')
  @Auth(ValidRoles.superAdmin, ValidRoles.admin)
  async downloadInvoice(
    @Param('ref') ref: string,
    @GetUser() requester: User,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.paymentHistoryService.generateInvoicePdf(ref, requester);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }
}
