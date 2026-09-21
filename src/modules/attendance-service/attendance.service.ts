/**
 * @fileoverview Attendance service module — DAO, service, controller.
 * @module attendance-service
 */
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from 'src/shared/prisma/prisma.service';

// ── DAO ───────────────────────────────────────────────────────────────────────
@Injectable()
export class AttendanceDAO {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: {
    employeeId?: string;   // internal UUID
    date?: string;
    status?: string;
    skip?: number;
    take?: number;
  }) {
    const where: any = {};
    if (params.employeeId) where.employeeId = params.employeeId;
    if (params.date) where.date = params.date;
    if (params.status) where.status = params.status;

    const [data, total] = await Promise.all([
      this.prisma.attendance.findMany({
        where,
        skip: params.skip ?? 0,
        take: params.take ?? 200,
        orderBy: [{ date: 'desc' }, { employeeId: 'asc' }],
        include: { employee: { select: { employeeCode: true, name: true, department: true } } },
      }),
      this.prisma.attendance.count({ where }),
    ]);
    return { data, total };
  }

  async findById(id: string) {
    return this.prisma.attendance.findUnique({
      where: { id },
      include: { employee: { select: { employeeCode: true, name: true } } },
    });
  }

  async create(data: any) {
    return this.prisma.attendance.create({ data });
  }

  async update(id: string, data: any) {
    return this.prisma.attendance.update({ where: { id }, data });
  }

  async findByEmployeeAndDate(employeeId: string, date: string) {
    return this.prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId, date } },
    });
  }
}

// ── Service ───────────────────────────────────────────────────────────────────
@Injectable()
export class AttendanceService {
  constructor(private readonly dao: AttendanceDAO) {}

  private mapStatus(s: string): string {
    const m: Record<string, string> = {
      Present: 'Present', Late: 'Late', Absent: 'Absent',
      OnLeave: 'On Leave', OffDay: 'Off Day', Holiday: 'Holiday',
      UnderTarget: 'Under Target', TargetMet: 'Target Met', InProgress: 'In Progress',
    };
    return m[s] ?? s;
  }

  private mapStatusIn(s: string): string {
    const m: Record<string, string> = {
      'Present': 'Present', 'Late': 'Late', 'Absent': 'Absent',
      'On Leave': 'OnLeave', 'Off Day': 'OffDay', 'Holiday': 'Holiday',
      'Under Target': 'UnderTarget', 'Target Met': 'TargetMet', 'In Progress': 'InProgress',
    };
    return m[s] ?? s;
  }

  private mapOut(r: any): any {
    if (!r) return r;
    return {
      ...r,
      id: r.id,
      employeeId: r.employee?.employeeCode ?? r.employeeId,
      employeeDbId: r.employeeId,
      employeeName: r.employee?.name,
      employeeDept: r.employee?.department,
      status: this.mapStatus(r.status),
      activeMinutes: r.activeMinutes ?? 0,
      breakMinutes: r.breakMinutes ?? 0,
      manuallyAdjusted: r.manuallyAdjusted ?? false,
    };
  }

  async findAll(params: { employeeDbId?: string; date?: string; status?: string; skip?: number; take?: number }) {
    const dbStatus = params.status ? this.mapStatusIn(params.status) : undefined;
    const { data, total } = await this.dao.findAll({ ...params, employeeId: params.employeeDbId, status: dbStatus });
    return { data: data.map(r => this.mapOut(r)), total };
  }

  async findMyAttendance(employeeDbId: string) {
    const { data } = await this.dao.findAll({ employeeId: employeeDbId, take: 365 });
    return data.map(r => this.mapOut(r));
  }

  async create(dto: any, employeeDbId: string) {
    const statusIn = this.mapStatusIn(dto.status ?? 'Absent');
    const rec = await this.dao.create({
      employeeId: employeeDbId,
      date: dto.date,
      clockIn: dto.clockIn ?? null,
      clockOut: dto.clockOut ?? null,
      breakMinutes: dto.breakMinutes ?? 0,
      activeMinutes: dto.activeMinutes ?? 0,
      status: statusIn,
      workSummary: dto.workSummary,
      tasks: dto.tasks,
      accomplishments: dto.accomplishments,
      blockers: dto.blockers,
      manuallyAdjusted: false,
    });
    return this.mapOut({ ...rec, employee: null });
  }

  async update(id: string, dto: any, callerEmployeeDbId?: string, isHR = false) {
    const existing = await this.dao.findById(id);
    if (!existing) throw new NotFoundException('Attendance record not found.');

    if (!isHR) {
      if (existing.employeeId !== callerEmployeeDbId) {
        throw new ForbiddenException('Cannot modify another employee\'s attendance.');
      }
    }

    const updateData: any = {};
    if (dto.clockIn !== undefined) updateData.clockIn = dto.clockIn;
    if (dto.clockOut !== undefined) updateData.clockOut = dto.clockOut;
    if (dto.breakMinutes !== undefined) updateData.breakMinutes = dto.breakMinutes;
    if (dto.activeMinutes !== undefined) updateData.activeMinutes = dto.activeMinutes;
    if (dto.status !== undefined) updateData.status = this.mapStatusIn(dto.status);
    if (dto.manuallyAdjusted !== undefined) updateData.manuallyAdjusted = dto.manuallyAdjusted;
    if (dto.workSummary !== undefined) updateData.workSummary = dto.workSummary;

    const updated = await this.dao.update(id, updateData);
    return this.mapOut({ ...updated, employee: existing.employee });
  }

  async exportCsv(params: { employeeDbId?: string; date?: string }) {
    const { data } = await this.dao.findAll({ ...params, employeeId: params.employeeDbId, take: 10000 });
    const rows = data.map(r => this.mapOut(r));
    const header = ['Employee', 'Date', 'Clock In', 'Clock Out', 'Break (min)', 'Active (min)', 'Status', 'Adjusted'];
    const lines = rows.map(r =>
      [r.employeeName ?? r.employeeId, r.date, r.clockIn ?? '', r.clockOut ?? '',
        r.breakMinutes, r.activeMinutes, r.status, r.manuallyAdjusted ? 'Yes' : 'No'].join(',')
    );
    return [header.join(','), ...lines].join('\n');
  }
}
