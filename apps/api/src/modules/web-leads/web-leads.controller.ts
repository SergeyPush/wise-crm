import { Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { WebLeadsService } from './web-leads.service';

/** FR-W9: журнал заявок, лише ADMIN. */
@ApiTags('web-leads')
@Controller('web-leads')
@RequirePermission('web-leads:read')
export class WebLeadsController {
  constructor(private readonly webLeads: WebLeadsService) {}

  @Get()
  list(@Query() query: PaginationQueryDto) {
    return this.webLeads.list(query);
  }

  @Post(':id/reprocess')
  @ApiOperation({ summary: 'Повторна обробка впалої заявки' })
  reprocess(@Param('id', ParseUUIDPipe) id: string) {
    return this.webLeads.reprocess(id);
  }
}
