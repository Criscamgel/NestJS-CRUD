import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosAdapter } from 'src/common/adapters/axios.adapter';

const SITEVERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';

type TurnstileSiteverifyResponse = {
  success?: boolean;
  'error-codes'?: string[];
};

@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly http: AxiosAdapter,
  ) {}

  isRequired(): boolean {
    const flag = this.configService
      .get<string>('TURNSTILE_ENABLED')
      ?.trim()
      .toLowerCase();
    if (flag === 'false' || flag === '0') return false;
    return Boolean(this.configService.get<string>('TURNSTILE_SECRET_KEY')?.trim());
  }

  /**
   * Valida el token emitido por el widget Turnstile en el front.
   * Si no hay secret configurado (dev local), no hace nada.
   */
  async assertValid(
    token: string | undefined,
    remoteIp?: string,
  ): Promise<void> {
    if (!this.isRequired()) return;

    const response = token?.trim();
    if (!response) {
      throw new BadRequestException(
        'Completa la verificación de seguridad antes de continuar.',
      );
    }

    const secret = this.configService.get<string>('TURNSTILE_SECRET_KEY')!.trim();

    let data: TurnstileSiteverifyResponse;
    try {
      data = await this.http.post<TurnstileSiteverifyResponse, Record<string, string>>(
        SITEVERIFY_URL,
        {
          secret,
          response,
          ...(remoteIp?.trim() ? { remoteip: remoteIp.trim() } : {}),
        },
        { headers: { 'Content-Type': 'application/json' } },
      );
    } catch (e) {
      this.logger.error(
        `Turnstile siteverify error: ${e instanceof Error ? e.message : String(e)}`,
      );
      throw new ServiceUnavailableException(
        'No se pudo validar la verificación de seguridad. Intenta de nuevo.',
      );
    }

    if (!data?.success) {
      const codes = data?.['error-codes']?.join(', ') ?? 'unknown';
      this.logger.warn(`Turnstile rejected token: ${codes}`);
      throw new BadRequestException(
        'La verificación de seguridad expiró o no es válida. Recarga e inténtalo de nuevo.',
      );
    }
  }
}
