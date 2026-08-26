import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

export type TestApp = {
  app: NestFastifyApplication;
  prisma: PrismaService;
  url: string;
};

/**
 * Поднимает настоящее приложение — со всеми глобальными guard'ами, пайпом
 * валидации и фильтром ошибок. Тест прав, обходящий guard, ничего не проверяет.
 */
export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter({ trustProxy: true }),
    { logger: false },
  );
  await app.register(fastifyCookie);
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  await app.listen({ port: 0, host: '127.0.0.1' });

  const url = await app.getUrl();
  return { app, prisma: app.get(PrismaService), url };
}

/** Справочники сидируются один раз, между тестами чистятся только данные. */
const DICTIONARY_TABLES = [
  'ClientStatus',
  'LeadSource',
  'LostReason',
  'TaskTypeRef',
  'DocumentCategory',
  'AppSetting',
  'Tag',
  'WebFormMapping',
];

export async function resetData(prisma: PrismaService): Promise<void> {
  await prisma.truncateAll(DICTIONARY_TABLES);
}
