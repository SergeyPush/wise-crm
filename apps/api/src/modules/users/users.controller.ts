import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { UsersService } from './users.service';
import { CreateUserDto, ListUsersQueryDto, UpdateUserDto } from './dto/user.dto';

/** Весь модуль — только ADMIN (`user:manage`), guard стоит на классе (NFR-17). */
@ApiTags('users')
@Controller('users')
@RequirePermission('user:manage')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Список співробітників' })
  list(@Query() query: ListUsersQueryDto) {
    return this.users.list(query);
  }

  // Перед /:id — інакше «lite» зʼїсть ParseUUIDPipe.
  // @RequirePermission() без аргументів знімає обмеження класу (user:manage):
  // список активних потрібен усім — вибір відповідального (FR-2.0),
  // автодоповнення @згадок (FR-2.17).
  @Get('lite')
  @RequirePermission()
  @ApiOperation({ summary: "Активні співробітники (id, ПІБ) — для форм і згадок" })
  lite() {
    return this.users.lite();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.get(id);
  }

  @Post()
  @ApiOperation({ summary: 'Створення; повертає одноразове посилання (FR-1.3)' })
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthUser, @Req() req: FastifyRequest) {
    return this.users.create(dto, actor.id, req.ip);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthUser,
    @Req() req: FastifyRequest,
  ) {
    return this.users.update(id, dto, actor.id, req.ip);
  }

  @Post(':id/reset-password')
  @ApiOperation({ summary: 'Скидання пароля: посилання, відкликання сесій, сповіщення' })
  resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
    @Req() req: FastifyRequest,
  ) {
    return this.users.resetPassword(id, actor.id, actor.fullName, req.ip);
  }

  @Post(':id/deactivate')
  @ApiOperation({ summary: 'Деактивація з переназначенням задач і клієнтів (FR-1.9)' })
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
    @Req() req: FastifyRequest,
  ) {
    return this.users.deactivate(id, actor.id, req.ip);
  }

  @Post(':id/activate')
  activate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
    @Req() req: FastifyRequest,
  ) {
    return this.users.activate(id, actor.id, req.ip);
  }
}
