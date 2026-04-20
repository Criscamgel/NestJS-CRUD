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
 * Orígenes permitidos para CORS (navegador).
 * - Incluye `CORS_ORIGINS`, `FRONTEND_URL` y `FRONTEND_PATH` (coma).
 * - Se unen defaults (Cheky + Vite local).
 *
 * Importante: el paquete `cors` (Express) **no soporta bien** `allowedHeaders: '*'`;
 * eso puede hacer fallar el preflight OPTIONS y el navegador reporta “sin
 * Access-Control-Allow-Origin” aunque el backend esté vivo.
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
    'http://cheky.co',
    'http://www.cheky.co',
    'https://app.cheky.co',
    'https://www.app.cheky.co',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ];

  return [...new Set([...defaults.map(normalizeOrigin), ...fromEnv])];
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const origins = buildCorsAllowedOrigins();
  logger.log(`CORS origins (${origins.length}): ${origins.join(' | ')}`);

  app.enableCors({
    /** Lista explícita — formato recomendado por `cors` (mejor que callback salvo reglas dinámicas). */
    origin: origins,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    /** Lista explícita; NO usar `*` aquí (rompe preflight en muchas versiones de `cors`). */
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
    /** Login / sesión en app.cheky.co con cookies cross-site si aplica */
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
