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
 * Orígenes permitidos: **siempre** se unen defaults (app + landing + local) con lo que venga en env.
 * Así añadir `cheky.co` en `CORS_ORIGINS` no puede quitar `app.cheky.co` por error.
 *
 * - `CORS_ORIGINS`, `FRONTEND_URL`, `FRONTEND_PATH`: lista separada por comas.
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

function buildCorsOriginFn(allowed: string[]) {
  return (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void,
  ) => {
    if (!origin) {
      return callback(null, true);
    }
    const n = normalizeOrigin(origin);
    if (allowed.includes(n)) {
      return callback(null, true);
    }
    return callback(null, false);
  };
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const allowedOrigins = buildCorsAllowedOrigins();
  logger.log(`CORS (${allowedOrigins.length} origins): ${allowedOrigins.join(', ')}`);

  /**
   * Misma línea que antes de los intentos con `allowedHeaders: '*'` y `credentials: false`:
   * - `credentials: true` como en el backend original (login / cookies si los usas).
   * - Lista fija de cabeceras (no `*`, que en muchos entornos rompe el preflight OPTIONS).
   */
  app.enableCors({
    origin: buildCorsOriginFn(allowedOrigins),
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Accept-Language',
      'Origin',
      'X-Requested-With',
      'Cache-Control',
      'Pragma',
    ],
    exposedHeaders: [],
    credentials: true,
    maxAge: 86400,
    optionsSuccessStatus: 204,
  });

  app.setGlobalPrefix('api');

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
