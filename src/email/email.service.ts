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
  path: string;
}

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      service: this.configService.get<string>('mailerService'),
      auth: {
        user: this.configService.get<string>('mailerEmail'),
        pass: this.configService.get<string>('mailerSecretKey'),
      },
    });
  }

  async sendEmail(options: SendMailOptions): Promise<boolean> {
    const { to, subject, htmlBody, attachements = [] } = options;

    try {
      const sentInformation = await this.transporter.sendMail({
        from: this.configService.get<string>('mailerEmail'), // Added 'from' to avoid being marked as spam often
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
