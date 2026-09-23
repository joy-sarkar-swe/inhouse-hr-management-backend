/**
 * @fileoverview Attendance controller.
 * @module attendance-service
 */
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/modules/auth-service/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import type { AuthUser } from 'src/shared/interfaces/auth-user.interface';
import { AttendanceService } from './attendance.service';
import { PrismaService } from 'src/shared/prisma/prisma.service';

@ApiTags('Attendance')
@ApiBearerAuth('Authorization')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'attendance', version: '1' })
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Shared helper ────────────────────────────────────────────────────────
  /**
   * Resolves the internal Employee UUID for the authenticated user.
   * Falls back through: JWT employeeId → Employee.userId lookup → throws.
   */
  private async resolveEmployeeDbId(user: AuthUser): Promise<string> {
    // 1. JWT may already carry the employeeId (set at login time)
    if (user.employeeId) return user.employeeId;

    // 2. Look up Employee record linked to this User account
    const emp = await this.prisma.employee.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (emp) return emp.id;

    throw new UnauthorizedException(
      'No employee record linked to this account.',
    );
  }

  // ─── HR Routes ────────────────────────────────────────────────────────────

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
    // Accept either the internal UUID (`employeeDbId`) or the human-facing
    // employee code (`employeeId`, e.g. "EMP001") — the frontend's Employee
    // type only carries the latter, so resolving by code here (mirroring
    // EmployeeService.findById/update) is what actually lets HR add a manual
    // attendance record instead of it failing with a missing employeeId.
    let employeeDbId: string | undefined = dto.employeeDbId;
    if (!employeeDbId && dto.employeeId) {
      if (String(dto.employeeId).startsWith('EMP')) {
        const emp = await this.prisma.employee.findUnique({
          where: { employeeCode: dto.employeeId },
        });
        if (!emp) throw new BadRequestException('Employee not found.');
        employeeDbId = emp.id;
      } else {
        employeeDbId = dto.employeeId;
      }
    }
    if (!employeeDbId) {
      throw new BadRequestException('employeeId or employeeDbId is required.');
    }
    return this.attendanceService.create(dto, employeeDbId);
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
    const csv = await this.attendanceService.exportCsv({
      employeeDbId: employeeId,
      date,
    });
    res
      .header('Content-Type', 'text/csv')
      .header('Content-Disposition', 'attachment; filename="attendance.csv"')
      .send(csv);
  }

  // ─── Employee Routes ───────────────────────────────────────────────────────

  @Get('my')
  @Roles('employee')
  @ApiOperation({ summary: 'Get own attendance records (employee)' })
  async getMyAttendance(@CurrentUser() user: AuthUser) {
    const employeeDbId = await this.resolveEmployeeDbId(user);
    return this.attendanceService.findMyAttendance(employeeDbId);
  }

  /**
   * Employee clocks in — immediately writes an InProgress attendance
   * record to the database with the real clock-in timestamp.
   * Idempotent: returns existing record unchanged if already clocked in today.
   */
  @Post('clock-in')
  @Roles('employee')
  @ApiOperation({
    summary: 'Employee clock in — creates InProgress attendance record',
  })
  async clockIn(
    @CurrentUser() user: AuthUser,
    @Body() body: { date: string; clockIn: string },
  ) {
    if (!body.date || !body.clockIn) {
      throw new BadRequestException('date and clockIn are required.');
    }

    const employeeDbId = await this.resolveEmployeeDbId(user);

    // Idempotency: return existing record if already clocked in today
    const existing = await this.prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId: employeeDbId, date: body.date } },
      include: {
        employee: {
          select: { employeeCode: true, name: true, department: true },
        },
      },
    });

    if (existing) {
      return {
        ...existing,
        employeeId: existing.employee?.employeeCode ?? employeeDbId,
        employeeDbId,
        status:
          existing.status === 'InProgress'
            ? 'In Progress'
            : String(existing.status),
      };
    }

    // Create the InProgress record with real clock-in time
    const rec = await this.prisma.attendance.create({
      data: {
        employeeId: employeeDbId,
        date: body.date,
        clockIn: body.clockIn,
        clockOut: null,
        breakMinutes: 0,
        activeMinutes: 0,
        status: 'InProgress',
        manuallyAdjusted: false,
      },
      include: {
        employee: {
          select: { employeeCode: true, name: true, department: true },
        },
      },
    });

    return {
      ...rec,
      employeeId: rec.employee?.employeeCode ?? employeeDbId,
      employeeDbId,
      status: 'In Progress',
    };
  }

  /**
   * Employee clocks out — finalises the attendance record with the actual
   * clock-out time, worked minutes, break minutes, status, and work log.
   */
  @Post('clock-out')
  @Roles('employee')
  @ApiOperation({ summary: 'Employee clock out — finalises attendance record' })
  async clockOut(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      date: string;
      clockOut: string;
      breakMinutes: number;
      activeMinutes: number;
      status: string;
      workSummary?: string;
      tasks?: string;
      accomplishments?: string;
      blockers?: string;
    },
  ) {
    const employeeDbId = await this.resolveEmployeeDbId(user);

    const statusMap: Record<string, string> = {
      'Target Met': 'TargetMet',
      'Under Target': 'UnderTarget',
      Present: 'Present',
      Late: 'Late',
    };
    const dbStatus = (statusMap[body.status] ?? 'UnderTarget') as any;

    // Clock-out must UPDATE the row clock-in created — it must never create
    // one of its own. The old `upsert`'s `create` branch never set `clockIn`
    // (there was nothing to set it to; this endpoint's body has no clock-in
    // time), so any time this ran without a matching clock-in record already
    // in the DB it silently produced an attendance row with a real
    // clock-out but a blank clock-in — indistinguishable in the UI from
    // "forgot to clock in" corrupted data. Failing loudly here surfaces the
    // real problem (the earlier clock-in call never landed) instead of
    // masking it with an incomplete record.
    const existing = await this.prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId: employeeDbId, date: body.date } },
    });
    if (!existing) {
      throw new BadRequestException(
        'No clock-in record found for this date. Please clock in before clocking out.',
      );
    }

    const rec = await this.prisma.attendance.update({
      where: { employeeId_date: { employeeId: employeeDbId, date: body.date } },
      data: {
        clockOut: body.clockOut,
        breakMinutes: body.breakMinutes ?? 0,
        activeMinutes: body.activeMinutes ?? 0,
        status: dbStatus,
        workSummary: body.workSummary,
        tasks: body.tasks,
        accomplishments: body.accomplishments,
        blockers: body.blockers,
      },
      include: {
        employee: {
          select: { employeeCode: true, name: true, department: true },
        },
      },
    });

    return {
      ...rec,
      employeeId: rec.employee?.employeeCode ?? employeeDbId,
      employeeDbId,
      status: body.status,
    };
  }
}
