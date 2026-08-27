import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Logger as PinoLogger } from 'nestjs-pino';
import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import fastifyMultipart from '@fastify/multipart';
// Без значения: только даёт декларацию reply.sendFile() (используется в AllExceptionsFilter для SPA-fallback)
import '@fastify/static';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { MAX_FILE_BYTES } from './modules/files/file-limits';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // trustProxy: приложение стоит за nginx; без него rate limit и аудит
    // запишут IP прокси вместо IP пользователя (03-tech-stack.md).
    // bodyLimit — MAX_FILE_BYTES с запасом на служебные части multipart (FR-F7:
    // один файл = один запрос, поэтому лимит тела и лимит файла — одно число).
    new FastifyAdapter({ trustProxy: true, bodyLimit: MAX_FILE_BYTES + 1_048_576 }),
    { bufferLogs: true },
  );

  app.useLogger(app.get(PinoLogger));
  const config = app.get(ConfigService);
  const isProd = config.get<string>('NODE_ENV') === 'production';

  await app.register(fastifyCookie);
  // throwFileSizeLimit: чиста ошибка вместо тихого обрезания потока при превышении
  await app.register(fastifyMultipart, {
    limits: { fileSize: MAX_FILE_BYTES, files: 1 },
    throwFileSizeLimit: true,
  });

  // NFR-42: строгий CSP без inline-скриптов. CRM живёт на своём origin,
  // поэтому совмещать политику с маркетинговым сайтом не приходится.
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // Mantine инлайнит CSS-переменные темы — стили инлайн разрешены, скрипты нет
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });

  app.setGlobalPrefix('api/v1');

  // NFR-18: whitelist + forbidNonWhitelisted — сырые DTO в ORM не попадают
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Собранный фронт лежит внутри того же образа (04-deployment.md)
  const publicDir = join(__dirname, '..', 'public');
  if (existsSync(publicDir)) {
    app.useStaticAssets({
      root: publicDir,
      prefix: '/',
      // Свой Cache-Control вместо дефолтного max-age=0 от @fastify/static
      cacheControl: false,
      setHeaders: (res, path) => {
        // Файлы с хешем в имени кэшируются навсегда, index.html — никогда
        if (path.includes('/assets/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    });
    // SPA-fallback живёт в AllExceptionsFilter: Nest занимает
    // setNotFoundHandler под себя ещё на init и второй раз его ставить нельзя.
  }

  if (!isProd) {
    const doc = new DocumentBuilder()
      .setTitle('WiseCRM API')
      .setDescription('Внутрішня CRM бухгалтерської фірми')
      .setVersion('1.0')
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc));
  }

  app.get(PrismaService).enableShutdownHooks(app);
  app.enableShutdownHooks(); // NFR-12: graceful shutdown

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen({ port, host: '0.0.0.0' });
  new Logger('Bootstrap').log(`API слухає :${port} (${config.get('NODE_ENV')})`);
}

// NFR-32.3: причина падения должна попасть в лог до выхода процесса
process.on('unhandledRejection', (reason) => {
  new Logger('Process').error({ err: reason }, 'unhandledRejection');
});
process.on('uncaughtException', (err) => {
  new Logger('Process').error({ err }, 'uncaughtException');
  process.exit(1);
});

void bootstrap();
