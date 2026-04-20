import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ContactDemoDto } from './dto/contact-demo.dto';
import { ContactDemoService } from './contact-demo.service';

@Controller('public/contact-demo')
export class ContactDemoController {
  constructor(private readonly contactDemoService: ContactDemoService) {}

  @Post()
  async submit(@Body() dto: ContactDemoDto, @Req() req: Request) {
    const forwarded = req.headers['x-forwarded-for'];
    const ip =
      typeof forwarded === 'string'
        ? forwarded.split(',')[0].trim()
        : (req.socket?.remoteAddress ?? req.ip ?? '');

    const data = await this.contactDemoService.submit(dto, ip);
    return {
      message: 'Solicitud enviada correctamente. Te contactaremos pronto.',
      data,
    };
  }
}
