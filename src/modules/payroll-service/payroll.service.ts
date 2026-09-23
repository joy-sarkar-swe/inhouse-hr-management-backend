/**
 * @fileoverview Payroll service — server-side payroll calculation and management.
 * All calculations run server-side; never trust client-supplied amounts.
 * @module payroll-service
 */
import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/shared/prisma/prisma.service';
import { SettingsService } from 'src/modules/settings-service/settings.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Count working days in a given month, excluding weekends based on settings. */
function workingDaysInMonth(year: number, month: number, workingDayNums: number[]): number {
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (workingDayNums.includes(dow)) count++;
  }
  return count;
}

function expectedMonthlyHours(
  year: number, month: number,
  workingDays: number[], dailyHours: number,
): number {
  return workingDaysInMonth(year, month, workingDays) * dailyHours;
}

// ── DAO ───────────────────────────────────────────────────────────────────────
@Injectable()
export class PayrollDAO {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: { employeeId?: string; month?: string; status?: string; skip?: number; take?: number }) {
    const where: any = {};
    if (params.employeeId) where.employeeId = params.employeeId;
    if (params.month) where.month = params.month;
    if (params.status) where.status = params.status;

    const [data, total] = await Promise.all([
      this.prisma.payroll.findMany({
        where,
        skip: params.skip ?? 0,
        take: params.take ?? 200,
        orderBy: [{ month: 'desc' }, { createdAt: 'desc' }],
        include: { employee: { select: { employeeCode: true, name: true, designation: true, department: true } } },
      }),
      this.prisma.payroll.count({ where }),
    ]);
    return { data, total };
  }

  async findById(id: string) {
    return this.prisma.payroll.findUnique({
      where: { id },
      include: { employee: { select: { employeeCode: true, name: true, designation: true, department: true } } },
    });
  }

  async create(data: any) {
    return this.prisma.payroll.create({ data });
  }

  async update(id: string, data: any) {
    return this.prisma.payroll.update({ where: { id }, data });
  }

  async findByEmployeeAndMonth(employeeId: string, month: string) {
    return this.prisma.payroll.findUnique({ where: { employeeId_month: { employeeId, month } } });
  }
}

// ── Service ───────────────────────────────────────────────────────────────────
@Injectable()
export class PayrollService {
  private readonly logger = new Logger(PayrollService.name);

  constructor(
    private readonly dao: PayrollDAO,
    private readonly settingsService: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  private mapOut(r: any): any {
    if (!r) return r;
    const statusRev: Record<string, string> = {
      Draft: 'Draft', UnderReview: 'Under Review', Approved: 'Approved',
      Paid: 'Paid', Locked: 'Locked',
    };
    return {
      ...r,
      employeeId: r.employee?.employeeCode ?? r.employeeId,
      employeeDbId: r.employeeId,
      employeeName: r.employee?.name,
      employeeDesignation: r.employee?.designation,
      employeeDept: r.employee?.department,
      status: statusRev[r.status] ?? r.status,
      hourlyRate: Number(r.hourlyRate),
      workedHours: Number(r.workedHours),
      paidLeaveHours: Number(r.paidLeaveHours),
      payableHours: Number(r.payableHours),
      baseAmount: Number(r.baseAmount),
      paidLeaveAmount: Number(r.paidLeaveAmount),
      bonus: Number(r.bonus),
      allowances: Number(r.allowances),
      deductions: Number(r.deductions),
      grossSalary: Number(r.grossSalary),
      netSalary: Number(r.netSalary),
    };
  }

  async findAll(params: any) {
    const { data, total } = await this.dao.findAll(params);
    return { data: data.map(r => this.mapOut(r)), total };
  }

  async findMyPayslips(employeeDbId: string) {
    const { data } = await this.dao.findAll({ employeeId: employeeDbId, take: 60 });
    return data.map(r => this.mapOut(r));
  }

  async findMyPayslip(id: string, employeeDbId: string) {
    const rec = await this.dao.findById(id);
    if (!rec) throw new NotFoundException('Payslip not found.');
    // IDOR protection — employee can only see their own
    if (rec.employeeId !== employeeDbId) {
      throw new ForbiddenException('Access denied.');
    }
    return this.mapOut(rec);
  }

  /**
   * Run payroll for a given month (YYYY-MM).
   * Idempotent per employee, but not a one-shot: a record still sitting in
   * Draft gets recalculated from the latest attendance/leave data every time
   * this runs (HR may legitimately run it early, then again after more
   * attendance/leave lands before finalising). Only once a record has moved
   * past Draft — Under Review, Approved, Paid, Locked — is it left alone, so
   * finalised payroll is never silently rewritten. All calculation happens
   * server-side from DB data.
   */
  async runPayroll(month: string): Promise<{ created: number; updated: number; skipped: number; records: any[] }> {
    const settings: any = await this.settingsService.get();
    const [yearStr, monthStr] = month.split('-');
    const year = parseInt(yearStr);
    const monthNum = parseInt(monthStr);

    const workingDays: number[] = settings.workingDays ?? [0, 1, 2, 3, 4];
    const leaveTypes: any[] = settings.leaveTypes ?? [];
    const payrollRules: any = settings.payrollRules ?? { payableHoursCap: true };

    // Get all active employees
    const employees = await this.prisma.employee.findMany({
      where: {
        status: { notIn: ['Terminated', 'Resigned'] as any },
      },
    });

    const today = new Date().toISOString().slice(0, 10);
    const touchedIds: string[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const emp of employees) {
      const existing = await this.dao.findByEmployeeAndMonth(emp.id, month);
      // A record HR has already moved past Draft represents a decision —
      // never recalculate it out from under them on a re-run.
      if (existing && existing.status !== 'Draft') { skipped++; continue; }

      // Get attendance for this month
      const monthAttendance = await this.prisma.attendance.findMany({
        where: { employeeId: emp.id, date: { startsWith: month } },
      });

      const workedMinutes = monthAttendance.reduce((s: number, a: any) => s + (a.activeMinutes ?? 0), 0);
      const workedHours = Math.round((workedMinutes / 60) * 10) / 10;

      // Approved paid leave for this month
      const approvedLeave = await this.prisma.leaveRequest.findMany({
        where: {
          employeeId: emp.id,
          status: 'Approved',
          startDate: { startsWith: month },
        },
      });

      const paidLeaveDays = approvedLeave
        .filter((l: any) => {
          const lt = leaveTypes.find((t: any) => t.id === l.leaveTypeId);
          return lt?.paid ?? true;
        })
        .reduce((s: number, l: any) => s + l.days, 0);

      const rawWorkedHours = workedHours;
      const dailyHours = emp.dailyHours ?? 7;
      const paidLeaveHoursRaw = paidLeaveDays * dailyHours;

      const empTarget = expectedMonthlyHours(year, monthNum, workingDays, dailyHours);

      // Fixed monthly salary model: total pay never exceeds the month's
      // target hours × rate, no matter how much extra time was worked —
      // "overwork doesn't pay more." Worked hours are capped at the target
      // first (real time at work takes priority over leave credit for
      // whatever room is left in the target), then paid leave fills
      // whatever's left, same as before. With the cap setting off, both are
      // paid in full uncapped (true hourly-with-overtime pay), so this stays
      // configurable per payrollRules.payableHoursCap rather than hardcoded.
      const payableWorkedHours = payrollRules.payableHoursCap
        ? Math.min(rawWorkedHours, empTarget)
        : rawWorkedHours;
      const paidLeaveHours = payrollRules.payableHoursCap
        ? Math.max(0, Math.min(paidLeaveHoursRaw, empTarget - payableWorkedHours))
        : paidLeaveHoursRaw;

      // workedHours on the Payroll record means "hours this pay was based
      // on" (this is a pay record, not an attendance log — the Attendance
      // module already holds the true uncapped per-day time if HR needs to
      // audit real overtime patterns separately from what was paid).
      const workedHoursForPay = payableWorkedHours;
      const payableHours = payableWorkedHours + paidLeaveHours;

      const hourlyRate = Number(emp.hourlyRate);
      const baseAmount = Math.round(workedHoursForPay * hourlyRate);
      const paidLeaveAmount = Math.round(paidLeaveHours * hourlyRate);

      // A re-run recalculating an existing Draft must not wipe out any
      // bonus/allowances/deductions HR already entered on it — preserve
      // them and fold them back into gross/net the same way updateRecord
      // does, instead of resetting everything to 0.
      const bonus = existing ? Number(existing.bonus) : 0;
      const allowances = existing ? Number(existing.allowances) : 0;
      const deductions = existing ? Number(existing.deductions) : 0;
      const grossSalary = baseAmount + paidLeaveAmount + bonus + allowances;
      const netSalary = grossSalary - deductions;

      const fields = {
        workedHours: workedHoursForPay, paidLeaveHours, payableHours, hourlyRate,
        baseAmount, paidLeaveAmount, bonus, allowances, deductions,
        grossSalary, netSalary, generatedAt: today,
      };

      let rec: any;
      if (existing) {
        rec = await this.dao.update(existing.id, fields);
        updated++;
      } else {
        rec = await this.dao.create({
          employeeId: emp.id, month, ...fields, status: 'Draft', notes: '',
        });
        created++;
      }
      touchedIds.push(rec.id);
    }

    this.logger.log(`Payroll run for ${month}: ${created} created, ${updated} updated, ${skipped} skipped`);
    const fullRecords = await Promise.all(touchedIds.map(id => this.dao.findById(id)));
    return { created, updated, skipped, records: fullRecords.map(r => this.mapOut(r)) };
  }

  async updateRecord(id: string, dto: {
    bonus?: number; allowances?: number; deductions?: number;
    status?: string; notes?: string;
  }) {
    const existing = await this.dao.findById(id);
    if (!existing) throw new NotFoundException('Payroll record not found.');

    const statusMap: Record<string, string> = {
      'Draft': 'Draft', 'Under Review': 'UnderReview',
      'Approved': 'Approved', 'Paid': 'Paid', 'Locked': 'Locked',
    };

    const updateData: any = {};
    if (dto.bonus !== undefined) updateData.bonus = dto.bonus;
    if (dto.allowances !== undefined) updateData.allowances = dto.allowances;
    if (dto.deductions !== undefined) updateData.deductions = dto.deductions;
    if (dto.status !== undefined) updateData.status = statusMap[dto.status] ?? dto.status;
    if (dto.notes !== undefined) updateData.notes = dto.notes;

    // Recalculate net salary if earnings/deductions changed
    if (dto.bonus !== undefined || dto.allowances !== undefined || dto.deductions !== undefined) {
      const bonus = dto.bonus ?? Number(existing.bonus);
      const allowances = dto.allowances ?? Number(existing.allowances);
      const deductions = dto.deductions ?? Number(existing.deductions);
      const grossSalary = Number(existing.baseAmount) + Number(existing.paidLeaveAmount) + bonus + allowances;
      const netSalary = grossSalary - deductions;
      updateData.grossSalary = grossSalary;
      updateData.netSalary = netSalary;
    }

    const updated = await this.dao.update(id, updateData);
    return this.mapOut({ ...updated, employee: existing.employee });
  }
}
