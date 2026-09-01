import { Controller, Get, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { ExportClientsQueryDto, ExportTasksQueryDto } from './dto/export.dto';
import { ExportService } from './export.service';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@ApiTags('export')
@Controller('export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get('clients.xlsx')
  @RequirePermission('export:run')
  @ApiOperation({ summary: 'Синхронно, по поточному фільтру. Лише ADMIN (рішення 01.09.2026, FR-E1)' })
  async clients(
    @Query() query: ExportClientsQueryDto,
    @CurrentUser() actor: AuthUser,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const buffer = await this.exportService.exportClients(query, actor);
    this.setHeaders(res, 'clients');
    return new StreamableFile(buffer);
  }

  @Get('tasks.xlsx')
  @RequirePermission('export:run')
  @ApiOperation({ summary: 'Синхронно, по поточному фільтру. Лише ADMIN (рішення 01.09.2026, FR-E1)' })
  async tasks(
    @Query() query: ExportTasksQueryDto,
    @CurrentUser() actor: AuthUser,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const buffer = await this.exportService.exportTasks(query, actor);
    this.setHeaders(res, 'tasks');
    return new StreamableFile(buffer);
  }

  // Ім'я файлу — латиницею: Content-Disposition без RFC5987-кодування не
  // приймає не-ASCII байти в токені filename= (ERR_INVALID_CHAR у Node).
  private setHeaders(res: FastifyReply, baseName: string): void {
    const date = new Date().toISOString().slice(0, 10);
    res.header('Content-Type', XLSX_MIME);
    res.header('Content-Disposition', `attachment; filename="${baseName}-${date}.xlsx"`);
  }
}
