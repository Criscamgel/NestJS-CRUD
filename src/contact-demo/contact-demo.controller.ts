import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { resolveClientIp } from 'src/common/utils/client-ip.util';
import { TurnstileService } from 'src/turnstile/turnstile.service';
import { ContactDemoDto } from './dto/contact-demo.dto';
import { ContactDemoService } from './contact-demo.service';

@Controller('public/contact-demo')
export class ContactDemoController {
  constructor(
    private readonly contactDemoService: ContactDemoService,
    private readonly turnstileService: TurnstileService,
  ) {}

  @Post()
  async submit(@Body() dto: ContactDemoDto, @Req() req: Request) {
    const ip = resolveClientIp(req);
    await this.turnstileService.assertValid(dto.turnstileToken, ip);

    const data = await this.contactDemoService.submit(dto, ip);
    return {
      message: 'Solicitud enviada correctamente. Te contactaremos pronto.',
      data,
    };
  }
}
