import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto/dashboard.dto';

@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @ApiOperation({ summary: 'Склад залежить від ролі (FR-5.1 / FR-5.2)' })
  get(@Query() query: DashboardQueryDto, @CurrentUser() actor: AuthUser) {
    const period = this.dashboard.resolvePeriod(query);
    return actor.role === 'ADMIN' ? this.dashboard.getAdminDashboard(period) : this.dashboard.getUserDashboard(actor.id);
  }
}
