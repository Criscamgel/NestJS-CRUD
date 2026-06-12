import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface SendMailOptions {
  to: string | string[];
  subject: string;
  htmlBody: string;
  attachements?: Attachement[];
}

export interface Attachement {
  filename: string;
  path?: string;
  /** Inline image: use same value in HTML as <img src="cid:..."> */
  cid?: string;
  /** Content as Buffer (alternative to path, e.g. for .ics files) */
  content?: Buffer;
  /** MIME content type (e.g. 'text/calendar; method=REQUEST') */
  contentType?: string;
}

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly configService: ConfigService) {
    const service = this.configService.get<string>('MAILER_SERVICE');
    const host = this.configService.get<string>('MAILER_HOST');
    const portRaw = this.configService.get<any>('MAILER_PORT');
    const port = portRaw ? parseInt(portRaw.toString(), 10) : 465;

    const transportConfig: any = {
      auth: {
        user: this.configService.get<string>('MAILER_EMAIL'),
        pass: this.configService.get<string>('MAILER_SECRET_KEY'),
      },
    };

    if (host) {
      transportConfig.host = host;
      transportConfig.port = port;
      transportConfig.secure = port === 465; // true for 465, false for other ports
    } else if (service) {
      transportConfig.service = service;
    }

    this.transporter = nodemailer.createTransport(transportConfig);
  }

  async sendEmail(options: SendMailOptions): Promise<boolean> {
    const { to, subject, htmlBody, attachements = [] } = options;

    try {
      const sentInformation = await this.transporter.sendMail({
        from: this.configService.get<string>('MAILER_EMAIL'), // Added 'from' to avoid being marked as spam often
        to: to,
        subject: subject,
        html: htmlBody,
        attachments: attachements,
      });

      this.logger.log(`Email sent. MessageId: ${sentInformation.messageId}`);
      return true;
    } catch (error) {
      this.logger.error('Email not sent', error);
      return false;
    }
  }

  async sendEmailWithFileSystemLogs(to: string | string[]) {
    const subject = 'Logs del servidor';
    const htmlBody = `
    <h3>Logs de sistema - NOC</h3>
    <p>Estos son los logs del servidor solicitados en la plataforma.</p>
    <p>Ver logs adjuntos</p>
    `;

    const attachements: Attachement[] = [
      { filename: 'logs-all.log', path: './logs/logs-all.log' },
      { filename: 'logs-high.log', path: './logs/logs-high.log' },
      { filename: 'logs-medium.log', path: './logs/logs-medium.log' },
    ];

    return this.sendEmail({
      to,
      subject,
      attachements,
      htmlBody,
    });
  }
}
