import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DictionariesService } from './dictionaries.service';

/** Доступно всем авторизованным — справочники нужны в формах любому пользователю. */
@ApiTags('dictionaries')
@Controller('dictionaries')
export class DictionariesController {
  constructor(private readonly dictionaries: DictionariesService) {}

  @Get(':kind')
  @ApiOperation({ summary: 'lead-sources · lost-reasons · tags · statuses · task-types · document-categories' })
  get(@Param('kind') kind: string) {
    return this.dictionaries.get(kind);
  }
}
