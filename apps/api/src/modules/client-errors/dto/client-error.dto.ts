import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * NFR-32.2: помилка фронтенда має долетіти до логів. Поля — тільки те, що
 * потрібно для пошуку інциденту (де, що, стек); ніяких даних клієнта тут
 * бути не повинно за задумом, але довжина все одно обмежена на випадок,
 * якщо стек випадково зачепить щось велике.
 */
export class ClientErrorDto {
  @IsString()
  @MaxLength(2000)
  message!: string;

  @IsString()
  @MaxLength(500)
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  stack?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  componentStack?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  userAgent?: string;
}
