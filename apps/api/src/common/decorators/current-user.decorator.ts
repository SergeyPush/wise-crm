import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { Role } from 'shared';

export type AuthUser = {
  id: string;
  email: string;
  role: Role;
  fullName: string;
  isProtected: boolean;
  mustChangePassword: boolean;
};

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
  return req.user;
});
