import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { NestExpressApplication } from '@nestjs/platform-express';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  for (const k of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    if ((process.env[k] ?? '').length < 32) throw new Error(`${k} must be set (32+ chars)`);
  }
  if (process.env.NODE_ENV === 'production' && (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM)) {
    // Email disabled until a provider key is configured: codes are still issued fire-and-forget,
    // the send fails and is logged, and user-facing responses stay identical. See GAPS.md.
    console.warn('[mail] RESEND_API_KEY/MAIL_FROM not set - email sending is DISABLED in this deployment');
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Number of trusted reverse-proxy hops in front of the API (0 = none: X-Forwarded-For is ignored, so it can't be spoofed).
  // Caddy in our compose = 1. Set it to the exact hop count of your host; a wrong value lets clients pick their rate-limit IP.
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 0));
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } })); // menu photos are loaded by the student app from another origin
  app.enableCors({ origin: (process.env.CORS_ORIGINS ?? '').split(',').filter(Boolean), credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.setGlobalPrefix('api/v1');
  // menu images uploaded by canteen staff
  const uploadDir = process.env.UPLOAD_DIR ?? 'uploads';
  mkdirSync(uploadDir, { recursive: true });
  app.useStaticAssets(join(process.cwd(), uploadDir), { prefix: '/uploads/', maxAge: '7d' });
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
