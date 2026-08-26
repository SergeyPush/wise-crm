import { Transform, Type, plainToInstance } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MinLength, validateSync } from 'class-validator';

/**
 * Валидация окружения при старте: пустой JWT_ACCESS_SECRET должен ронять
 * контейнер сразу, а не оборачиваться «почему-то не логинится» через неделю.
 */
export class EnvConfig {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: string = 'development';

  @Type(() => Number)
  @IsInt()
  PORT: number = 3000;

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  @MinLength(32, { message: 'JWT_ACCESS_SECRET має бути щонайменше 32 символи' })
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @MinLength(32, { message: 'JWT_REFRESH_SECRET має бути щонайменше 32 символи' })
  JWT_REFRESH_SECRET!: string;

  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  COOKIE_SECURE: boolean = false;

  @IsString()
  @IsOptional()
  ADMIN_BOOTSTRAP_EMAIL?: string;

  @IsString()
  APP_URL: string = 'http://localhost:5173';

  @IsString()
  LOG_LEVEL: string = 'info';

  @IsString()
  UPLOAD_DIR: string = './uploads';

  @IsString()
  @IsOptional()
  WEB_FORM_TOKEN?: string;

  @IsString()
  @IsOptional()
  TELEGRAM_BOT_TOKEN?: string;
}

export function validateEnv(raw: Record<string, unknown>): EnvConfig {
  const config = plainToInstance(EnvConfig, raw, { enableImplicitConversion: true });
  const errors = validateSync(config, { skipMissingProperties: false });
  if (errors.length) {
    const details = errors
      .map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('\n  ');
    throw new Error(`Некоректна конфігурація оточення:\n  ${details}`);
  }
  return config;
}
