import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { DictionariesService } from './dictionaries.service';
import { UpsertDictionaryEntryDto } from './dto/dictionary.dto';

/** GET доступен всем авторизованным — справочники нужны в формах любому пользователю. */
@ApiTags('dictionaries')
@Controller('dictionaries')
export class DictionariesController {
  constructor(private readonly dictionaries: DictionariesService) {}

  @Get(':kind')
  @ApiOperation({ summary: 'lead-sources · lost-reasons · tags · statuses · task-types · document-categories' })
  get(@Param('kind') kind: string) {
    return this.dictionaries.get(kind);
  }

  @Post(':kind')
  @RequirePermission('dictionary:manage')
  @ApiOperation({ summary: 'Чотири редаговані: lead-sources · lost-reasons · tags · statuses (беклог 28.08.2026)' })
  create(@Param('kind') kind: string, @Body() dto: UpsertDictionaryEntryDto) {
    return this.dictionaries.create(kind, dto);
  }

  @Patch(':kind/:id')
  @RequirePermission('dictionary:manage')
  @ApiOperation({ summary: 'Для statuses PATCH міняє лише label/color/sortOrder — структурні поля незмінні' })
  update(@Param('kind') kind: string, @Param('id') id: string, @Body() dto: UpsertDictionaryEntryDto) {
    return this.dictionaries.update(kind, id, dto);
  }
}
