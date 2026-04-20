import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

/**
 * Orígenes permitidos para CORS.
 * - Con `credentials: true` el navegador NO acepta `Access-Control-Allow-Origin: *`;
 *   hay que devolver el origen concreto (p. ej. https://cheky.co).
 * - `CORS_ORIGINS` = lista separada por comas. Si no hay, se usan defaults de Cheky + Vite local.
 * - `FRONTEND_URL` se añade también (compat con despliegues que solo definen uno).
 */
function buildCorsOriginCallback() {
  const raw = [process.env.CORS_ORIGINS, process.env.FRONTEND_URL]
    .filter(Boolean)
    .join(',');
  const fromEnv = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const defaults = [
    'https://cheky.co',
    'https://www.cheky.co',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ];
  const allowList = fromEnv.length > 0 ? fromEnv : defaults;

  return (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void,
  ) => {
    // Sin header Origin (curl, mismo servidor, algunas apps): permitir
    if (!origin) {
      return callback(null, true);
    }
    if (allowList.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  };
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: buildCorsOriginCallback(),
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
    exposedHeaders: [],
    credentials: true,
    maxAge: 86400,
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true
      }
    })
  );
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
