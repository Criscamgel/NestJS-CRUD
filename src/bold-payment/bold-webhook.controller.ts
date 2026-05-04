import {
  Controller,
  Headers,
  HttpStatus,
  Logger,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { BoldPaymentService } from './bold-payment.service';
import { ConfigService } from '@nestjs/config';

@Controller('public/bold')
export class BoldWebhookController {
  private readonly logger = new Logger(BoldWebhookController.name);

  constructor(
    private readonly boldPaymentService: BoldPaymentService,
    private readonly configService: ConfigService,
  ) {}

  @Post('webhook')
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
    @Headers('x-bold-signature') receivedSignature: string | undefined,
  ) {
    const debug = this.configService.get<string>('DEBUG_BOLD_WEBHOOK') === 'true';
    try {
      const rawBody = req.rawBody
        ? req.rawBody.toString('utf8')
        : JSON.stringify(req.body ?? {});

      if (!req.rawBody && debug) {
        this.logger.warn('Webhook sin rawBody; firma puede fallar. Use rawBody: true en bootstrap.');
      }

      const ok = this.boldPaymentService.verifyWebhookSignature(
        rawBody,
        receivedSignature,
      );
      if (!ok) {
        return res.status(HttpStatus.UNAUTHORIZED).json({
          success: false,
          message: 'Firma inválida',
        });
      }

      await this.boldPaymentService.tryFulfillFromWebhookBody(rawBody);

      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'ok',
        data: null,
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      this.logger.error((e as Error).message, (e as Error).stack);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: (e as Error).message,
      });
    }
  }
}
