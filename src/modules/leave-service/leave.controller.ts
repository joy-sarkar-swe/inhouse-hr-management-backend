/**
 * @fileoverview Leave controller — HR management and employee self-service.
 */
import {
  Body, Controller, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/modules/auth-service/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import type { AuthUser } from 'src/shared/interfaces/auth-user.interface';
import { LeaveService } from './leave.service';
import { SettingsService } from 'src/modules/settings-service/settings.service';

@ApiTags('Leave')
@ApiBearerAuth('Authorization')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'leave', version: '1' })
export class LeaveController {
  constructor(
    private readonly leaveService: LeaveService,
    private readonly settingsService: SettingsService,
  ) {}

  // ── HR routes ──────────────────────────────────────────────────────────────

  @Get()
  @Roles('hr')
  @ApiOperation({ summary: 'List all leave requests (HR)' })
  async findAll(@Query('status') status?: string) {
    return this.leaveService.findAll({ status });
  }

  @Get('pending')
  @Roles('hr')
  @ApiOperation({ summary: 'List pending leave requests (HR)' })
  async findPending() {
    return this.leaveService.findPending();
  }

  @Post(':id/review')
  @Roles('hr')
  @ApiOperation({ summary: 'Approve or reject a leave request (HR)' })
  async review(
    @Param('id') id: string,
    @Body() dto: { status: 'Approved' | 'Rejected'; reviewNote?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.leaveService.review(id, dto, user.name ?? 'HR Admin');
  }

  // ── Employee routes ────────────────────────────────────────────────────────

  @Post()
  @Roles('employee')
  @ApiOperation({ summary: 'Submit a leave request (employee)' })
  async submit(@Body() dto: any, @CurrentUser() user: AuthUser) {
    const settings = await this.settingsService.get();
    const leaveTypes = (settings as any).leaveTypes ?? [];
    return this.leaveService.submit(dto, user.employeeId!, leaveTypes);
  }

  @Get('my')
  @Roles('employee')
  @ApiOperation({ summary: 'Get own leave requests (employee)' })
  async getMyLeaves(@CurrentUser() user: AuthUser) {
    return this.leaveService.findMyLeaves(user.employeeId!);
  }

  @Patch(':id/cancel')
  @Roles('employee')
  @ApiOperation({ summary: 'Cancel own pending leave request (employee)' })
  async cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.leaveService.cancel(id, user.employeeId!);
  }
}
