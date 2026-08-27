import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { TasksService } from './tasks.service';
import {
  BulkDeleteTasksDto,
  CancelTaskDto,
  CompleteTaskDto,
  CreateTaskDto,
  ListTasksQueryDto,
  SnoozeTaskDto,
  UpdateTaskDto,
} from './dto/task.dto';

@ApiTags('tasks')
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  @RequirePermission('task:read')
  @ApiOperation({ summary: 'Список: группування по строках — на клієнті' })
  list(@Query() query: ListTasksQueryDto, @CurrentUser() actor: AuthUser) {
    return this.tasks.list(query, actor.id);
  }

  // Перед /:id — інакше «bulk-delete» зʼїсть ParseUUIDPipe (як bulk/duplicates у clients.controller)
  @Post('bulk-delete')
  @RequirePermission()
  @ApiOperation({ summary: "Масове м'яке видалення завершених/скасованих, лише ADMIN (backlog 27.08.2026)" })
  bulkDelete(@Body() dto: BulkDeleteTasksDto, @CurrentUser() actor: AuthUser) {
    return this.tasks.bulkDelete(dto.ids, actor);
  }

  @Get(':id')
  @RequirePermission('task:read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.tasks.get(id);
  }

  @Post()
  @RequirePermission('task:create')
  @ApiOperation({ summary: '«Що зробити? ⏎» і повна форма — одне DTO' })
  create(@Body() dto: CreateTaskDto, @CurrentUser() actor: AuthUser) {
    return this.tasks.create(dto, actor.id);
  }

  @Patch(':id')
  @RequirePermission('task:update')
  @ApiOperation({ summary: 'Приймає updatedAt, 409 при розбіжності (NFR-46)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTaskDto, @CurrentUser() actor: AuthUser) {
    return this.tasks.update(id, dto, actor);
  }

  @Post(':id/complete')
  @RequirePermission('task:complete')
  @ApiOperation({ summary: 'Результат обов\'язковий для ДЗВІНОК/КП/ДОГОВІР (FR-3.5)' })
  complete(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CompleteTaskDto, @CurrentUser() actor: AuthUser) {
    return this.tasks.complete(id, dto, actor.id);
  }

  @Post(':id/cancel')
  @RequirePermission('task:cancel')
  @ApiOperation({ summary: 'Причина обов\'язкова завжди' })
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelTaskDto, @CurrentUser() actor: AuthUser) {
    return this.tasks.cancel(id, dto, actor.id);
  }

  @Post(':id/snooze')
  @RequirePermission('task:update')
  @ApiOperation({ summary: 'Перенос строку пресетами (FR-8.2)' })
  snooze(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SnoozeTaskDto, @CurrentUser() actor: AuthUser) {
    return this.tasks.snooze(id, dto, actor.id);
  }

  // Без @RequirePermission('task:delete') — правило «автор або ADMIN» завʼязане
  // на об'єкт (владіння), матриця прав без контексту тут завжди відмовляє USER
  // (permissions.guard.ts: «владение объектом проверяет сервис»). Тут лише
  // перевірка автентифікації, повна перевірка — у сервісі через can(..., {isOwner}).
  @Delete(':id')
  @RequirePermission()
  @ApiOperation({ summary: "М'яке видалення, автор або ADMIN (FR-3.8)" })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser) {
    return this.tasks.remove(id, actor);
  }
}
