import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/modules/auth-service/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { PrismaService } from 'src/shared/prisma/prisma.service';

@ApiTags('Reports')
@ApiBearerAuth('Authorization')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'reports', version: '1' })
export class ReportsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('summary')
  @Roles('hr')
  @ApiOperation({ summary: 'HR Dashboard summary stats' })
  async summary() {
    const [
      totalEmployees, activeEmployees,
      pendingLeave, totalLeave,
      today,
    ] = await Promise.all([
      this.prisma.employee.count(),
      this.prisma.employee.count({ where: { status: 'Active' } }),
      this.prisma.leaveRequest.count({ where: { status: 'Pending' } }),
      this.prisma.leaveRequest.count(),
      Promise.resolve(new Date().toISOString().slice(0, 10)),
    ]);

    const todayAttendance = await this.prisma.attendance.findMany({
      where: { date: today },
      select: { status: true, activeMinutes: true, employeeId: true,
        employee: { select: { employeeCode: true, name: true } } },
    });

    const presentToday = todayAttendance.filter(a =>
      ['Present', 'Late', 'TargetMet', 'UnderTarget', 'InProgress'].includes(a.status)
    ).length;

    return {
      totalEmployees,
      activeEmployees,
      pendingLeave,
      totalLeave,
      presentToday,
      today,
      todayAttendance: todayAttendance.map(a => ({
        employeeCode: a.employee?.employeeCode,
        name: a.employee?.name,
        status: a.status,
        activeMinutes: a.activeMinutes,
      })),
    };
  }

  @Get('attendance')
  @Roles('hr')
  @ApiOperation({ summary: 'Attendance analytics' })
  async attendance() {
    const records = await this.prisma.attendance.findMany({
      orderBy: { date: 'desc' },
      take: 1000,
      select: { date: true, status: true, activeMinutes: true, employeeId: true,
        employee: { select: { employeeCode: true, name: true, department: true } } },
    });

    const byStatus: Record<string, number> = {};
    for (const r of records) {
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    }

    return { records: records.length, byStatus };
  }

  @Get('payroll')
  @Roles('hr')
  @ApiOperation({ summary: 'Payroll summary by month' })
  async payroll() {
    const records = await this.prisma.payroll.findMany({
      orderBy: { month: 'desc' },
      take: 24,
      select: { month: true, netSalary: true, status: true },
    });

    const byMonth: Record<string, { total: number; count: number }> = {};
    for (const r of records) {
      if (!byMonth[r.month]) byMonth[r.month] = { total: 0, count: 0 };
      byMonth[r.month].total += Number(r.netSalary);
      byMonth[r.month].count += 1;
    }

    return { byMonth };
  }

  @Get('leave')
  @Roles('hr')
  @ApiOperation({ summary: 'Leave usage analytics' })
  async leave() {
    const [pending, approved, rejected, cancelled] = await Promise.all([
      this.prisma.leaveRequest.count({ where: { status: 'Pending' } }),
      this.prisma.leaveRequest.count({ where: { status: 'Approved' } }),
      this.prisma.leaveRequest.count({ where: { status: 'Rejected' } }),
      this.prisma.leaveRequest.count({ where: { status: 'Cancelled' } }),
    ]);
    return { pending, approved, rejected, cancelled, total: pending + approved + rejected + cancelled };
  }
}
