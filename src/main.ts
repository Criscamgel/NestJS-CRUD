import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

const logger = new Logger('Bootstrap');

function normalizeOrigin(o: string): string {
  return o.trim().replace(/\/+$/, '');
}

/**
 * Comprueba orígenes bajo el dominio Cheky (producción y subdominios).
 * Así app.cheky.co, cheky.co, www., landing en subdominio, etc. siguen
 * funcionando aunque el .env en Dokploy lleve espacios, comillas o falle el parseo.
 */
function isTrustedChekyPublicOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    const host = u.hostname.toLowerCase();
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    return host === 'cheky.co' || host.endsWith('.cheky.co');
  } catch {
    return false;
  }
}

/**
 * Lista base + env (`CORS_ORIGINS`, `FRONTEND_URL`, `FRONTEND_PATH`).
 * Siempre unión (no reemplazo): no se quita app al añadir landing.
 */
function buildCorsAllowedOrigins(): string[] {
  const raw = [
    process.env.CORS_ORIGINS,
    process.env.FRONTEND_URL,
    process.env.FRONTEND_PATH,
  ]
    .filter(Boolean)
    .join(',');

  const fromEnv = raw
    .split(',')
    .map((s) => normalizeOrigin(s))
    .filter(Boolean);

  const defaults = [
    'https://cheky.co',
    'https://www.cheky.co',
    'https://app.cheky.co',
    'https://www.app.cheky.co',
    'http://cheky.co',
    'http://www.cheky.co',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ];

  return [...new Set([...defaults.map(normalizeOrigin), ...fromEnv])];
}

/**
 * El paquete `cors` espera (err, allow: boolean). Si allow es false, NO añade
 * cabeceras CORS → el navegador muestra "No Access-Control-Allow-Origin".
 */
function buildCorsOriginFn(allowed: string[]) {
  return (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void,
  ) => {
    if (!origin) {
      return callback(null, true);
    }
    const n = normalizeOrigin(origin);
    if (allowed.includes(n) || isTrustedChekyPublicOrigin(n)) {
      return callback(null, true);
    }
    return callback(null, false);
  };
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  /**
   * Orden recomendado en Nest: prefijo global antes de CORS.
   * Así OPTIONS /api/* y POST /api/* quedan alineados con cómo expone rutas la app.
   */
  app.setGlobalPrefix('api');

  const allowedOrigins = buildCorsAllowedOrigins();
  logger.log(`CORS allowlist (${allowedOrigins.length}): ${allowedOrigins.join(', ')}`);

  /**
   * No fijamos `allowedHeaders`: el middleware `cors` replica entonces las
   * cabeceras del preflight (`Access-Control-Request-Headers`). Si la lista
   * es demasiado corta o usa `*`, en muchos clientes el OPTIONS falla.
   */
  app.enableCors({
    origin: buildCorsOriginFn(allowedOrigins),
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
    maxAge: 86400,
    optionsSuccessStatus: 204,
    preflightContinue: false,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
