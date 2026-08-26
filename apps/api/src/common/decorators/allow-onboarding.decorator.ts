import { SetMetadata } from '@nestjs/common';

export const ALLOW_ONBOARDING_KEY = 'allowOnboarding';

/**
 * Разрешает эндпоинт пользователю, который ещё обязан сменить пароль (FR-1.3).
 * Ставится только на то, что нужно для самой настройки: профиль, смена пароля.
 */
export const AllowOnboarding = () => SetMetadata(ALLOW_ONBOARDING_KEY, true);
