import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Снимает глобальный JwtAuthGuard. Ставится точечно: login, health, публичные заявки. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
