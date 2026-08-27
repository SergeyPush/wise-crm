import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { ClientsService } from './clients.service';
import {
  AddTagDto,
  AssigneesDto,
  BulkClientsDto,
  ChangeStatusDto,
  ClientDuplicatesQueryDto,
  ContactDto,
  ContactLogDto,
  CreateClientDto,
  ListClientsQueryDto,
  UpdateClientDto,
} from './dto/client.dto';

@ApiTags('clients')
@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  @RequirePermission('client:read')
  @ApiOperation({ summary: 'Список: фільтри плоскими query, assigneeId=none — пул' })
  list(@Query() query: ListClientsQueryDto, @CurrentUser() actor: AuthUser) {
    return this.clients.list(query, actor);
  }

  // Перед /:id — інакше «duplicates» зʼїсть ParseUUIDPipe
  @Get('duplicates')
  @RequirePermission('client:read')
  @ApiOperation({ summary: 'Попередження про дубль без блокування (FR-2.2)' })
  duplicates(@Query() query: ClientDuplicatesQueryDto) {
    return this.clients.duplicates(query);
  }

  @Get(':id')
  @RequirePermission('client:read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.clients.get(id);
  }

  @Post()
  @RequirePermission('client:create')
  @ApiOperation({ summary: 'Форма ліда: 4 поля (FR-2.0.4)' })
  create(@Body() dto: CreateClientDto, @CurrentUser() actor: AuthUser) {
    return this.clients.create(dto, actor.id);
  }

  // Перед /:id — інакше «bulk» зʼїсть ParseUUIDPipe (як і duplicates вище)
  @Post('bulk')
  @RequirePermission('client:update')
  @ApiOperation({ summary: 'Масові дії над виділенням (FR-2.13, FR-8.3)' })
  bulk(@Body() dto: BulkClientsDto, @CurrentUser() actor: AuthUser) {
    return this.clients.bulk(dto, actor);
  }

  @Patch(':id')
  @RequirePermission('client:update')
  @ApiOperation({ summary: 'Приймає updatedAt, 409 при розбіжності (NFR-46)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.clients.update(id, dto, actor.id);
  }

  @Delete(':id')
  @RequirePermission('client:delete')
  @ApiOperation({ summary: "М'яке видалення, лише ADMIN (FR-2.3)" })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser, @Req() req: FastifyRequest) {
    return this.clients.remove(id, actor.id, req.ip);
  }

  @Post(':id/restore')
  @RequirePermission('client:delete')
  @ApiOperation({ summary: '«Відновити» — пара до архівації, лише ADMIN (FR-8.1)' })
  restore(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser, @Req() req: FastifyRequest) {
    return this.clients.restore(id, actor.id, req.ip);
  }

  @Post(':id/claim')
  @RequirePermission('client:assign')
  @ApiOperation({ summary: '«Взяти в роботу»: призначити себе PRIMARY' })
  claim(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser) {
    return this.clients.claim(id, actor.id);
  }

  @Put(':id/assignees')
  @RequirePermission('client:assign')
  setAssignees(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssigneesDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.clients.setAssignees(id, dto, actor.id);
  }

  @Post(':id/status')
  @RequirePermission('client:update')
  @ApiOperation({ summary: 'Зміна статусу + причина при requiresReason' })
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeStatusDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.clients.changeStatus(id, dto, actor.id);
  }

  @Post(':id/contact-log')
  @RequirePermission('client:update')
  @ApiOperation({ summary: '«Зафіксувати контакт» → закрита задача-дзвінок (FR-2.2.1)' })
  contactLog(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ContactLogDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.clients.contactLog(id, dto, actor.id);
  }

  @Get(':id/activity')
  @RequirePermission('client:read')
  @ApiOperation({ summary: 'Стрічка, курсорна пагінація' })
  activity(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.clients.listActivity(id, cursor, limit ? Number(limit) : undefined);
  }

  @Post(':id/contacts')
  @RequirePermission('client:update')
  addContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ContactDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.clients.addContact(id, dto, actor.id);
  }

  @Patch(':id/contacts/:contactId')
  @RequirePermission('client:update')
  updateContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Body() dto: ContactDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.clients.updateContact(id, contactId, dto, actor.id);
  }

  @Delete(':id/contacts/:contactId')
  @RequirePermission('client:update')
  removeContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.clients.removeContact(id, contactId, actor.id);
  }

  @Post(':id/tags')
  @RequirePermission('client:update')
  @ApiOperation({ summary: '«Додати тег» з ПКМ (FR-8.1)' })
  addTag(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddTagDto, @CurrentUser() actor: AuthUser) {
    return this.clients.addTag(id, dto, actor.id);
  }

  @Delete(':id/tags/:tagId')
  @RequirePermission('client:update')
  removeTag(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tagId', ParseUUIDPipe) tagId: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.clients.removeTag(id, tagId, actor.id);
  }
}
