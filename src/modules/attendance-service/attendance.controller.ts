/**
 * @fileoverview Attendance controller.
 * @module attendance-service
 */
import {
  Body, Controller, Get, Param, Patch, Post,
  Query, Res, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/modules/auth-service/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import type { AuthUser } from 'src/shared/interfaces/auth-user.interface';
import { AttendanceService } from './attendance.service';

@ApiTags('Attendance')
@ApiBearerAuth('Authorization')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'attendance', version: '1' })
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get()
  @Roles('hr')
  @ApiOperation({ summary: 'List all attendance records (HR)' })
  async findAll(
    @Query('employeeId') employeeId?: string,
    @Query('date') date?: string,
    @Query('status') status?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.attendanceService.findAll({
      employeeDbId: employeeId,
      date,
      status,
      skip: skip ? parseInt(skip) : undefined,
      take: take ? parseInt(take) : undefined,
    });
  }

  @Post()
  @Roles('hr')
  @ApiOperation({ summary: 'Add attendance record (HR)' })
  async create(@Body() dto: any) {
    return this.attendanceService.create(dto, dto.employeeDbId);
  }

  @Patch(':id')
  @Roles('hr')
  @ApiOperation({ summary: 'Update/adjust attendance record (HR)' })
  async update(@Param('id') id: string, @Body() dto: any) {
    return this.attendanceService.update(id, dto, undefined, true);
  }

  @Get('export')
  @Roles('hr')
  @ApiOperation({ summary: 'Export attendance as CSV (HR)' })
  async export(
    @Res() res: any,
    @Query('employeeId') employeeId?: string,
    @Query('date') date?: string,
  ) {
    const csv = await this.attendanceService.exportCsv({ employeeDbId: employeeId, date });
    res
      .header('Content-Type', 'text/csv')
      .header('Content-Disposition', 'attachment; filename="attendance.csv"')
      .send(csv);
  }

  @Get('my')
  @Roles('employee')
  @ApiOperation({ summary: 'Get own attendance records (employee)' })
  async getMyAttendance(@CurrentUser() user: AuthUser) {
    return this.attendanceService.findMyAttendance(user.employeeId!);
  }
}
