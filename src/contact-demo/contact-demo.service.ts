import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../email/email.service';
import {
  contactDemoEmailTemplate,
  getEmailLogoAttachment,
} from '../email/email-templates.helper';
import { ContactDemoDto } from './dto/contact-demo.dto';

/** Antispam servidor: mismo IP no puede reenviar antes de este intervalo (ms) */
const RATE_WINDOW_MS = 120_000;

const VOLUME_LABELS: Record<string, string> = {
  '1-100': '1 – 100',
  '100-1000': '100 – 1.000',
  '1000-10000': '1.000 – 10.000',
  '10000+': '10.000+',
};

@Injectable()
export class ContactDemoService {
  private readonly logger = new Logger(ContactDemoService.name);
  /** IP (o fingerprint proxy) → timestamp último envío exitoso */
  private readonly lastSuccessByIp = new Map<string, number>();

  constructor(
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  async submit(dto: ContactDemoDto, clientIp: string): Promise<{ sent: boolean }> {
    const ip = clientIp || 'unknown';
    const now = Date.now();
    const last = this.lastSuccessByIp.get(ip);
    if (last !== undefined && now - last < RATE_WINDOW_MS) {
      throw new HttpException(
        'Ya recibimos una solicitud reciente desde esta ubicación. Intenta de nuevo en unos minutos.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const inbox =
      this.configService.get<string>('contactDemoInbox') || 'hola@cheky.co';

    const volumeLabel = VOLUME_LABELS[dto.volume] ?? dto.volume;

    const html = contactDemoEmailTemplate({
      name: dto.name,
      email: dto.email,
      company: dto.company,
      volumeLabel,
    });

    const subject = `Nueva solicitud de demo — ${dto.company}`;

    const logo = getEmailLogoAttachment();
    const attachments = logo ? [logo] : [];

    const ok = await this.emailService.sendEmail({
      to: inbox,
      subject,
      htmlBody: html,
      attachements: attachments,
    });

    if (!ok) {
      this.logger.error('No se pudo enviar el correo de contacto demo');
      throw new ServiceUnavailableException(
        'No pudimos enviar tu solicitud en este momento. Intenta de nuevo más tarde.',
      );
    }

    this.lastSuccessByIp.set(ip, now);
    this.logger.log(`Contact demo enviado a ${inbox} (${dto.email})`);

    return { sent: true };
  }
}
