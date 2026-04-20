import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

/** Quita barra final para comparar orígenes (evita fallos si el .env trae `/`). */
function normalizeOrigin(o: string): string {
  return o.trim().replace(/\/+$/, '');
}

/**
 * Lista de orígenes permitidos (CORS).
 * - `CORS_ORIGINS` / `FRONTEND_URL`: separados por comas.
 * - Se fusionan con valores por defecto (local + producción Cheky).
 */
function buildCorsAllowedOrigins(): string[] {
  const raw = [process.env.CORS_ORIGINS, process.env.FRONTEND_URL]
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

  app.enableCors({
    origin: buildCorsOriginFn(allowedOrigins),
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    /** Preflight puede enviar otras cabeceras según el cliente; `*` evita rechazos por “header no permitido”. */
    allowedHeaders: '*',
    /**
     * El front (landing / app) usa sobre todo Bearer en `Authorization`, no cookies cross-site.
     * `credentials: false` simplifica CORS y evita el conflicto habitual con `*` / orígenes
     * cuando el navegador muestra “Provisional headers” y Network Error.
     */
    credentials: false,
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
