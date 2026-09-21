/**
 * @fileoverview Leave service — leave requests, approval workflow, balance checks.
 * @module leave-service
 */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/shared/prisma/prisma.service';
import { EmployeeService } from 'src/modules/employee-service/employee.service';

// ── DAO ───────────────────────────────────────────────────────────────────────
@Injectable()
export class LeaveDAO {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: { employeeId?: string; status?: string; skip?: number; take?: number }) {
    const where: any = {};
    if (params.employeeId) where.employeeId = params.employeeId;
    if (params.status) where.status = params.status;

    const [data, total] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where,
        skip: params.skip ?? 0,
        take: params.take ?? 200,
        orderBy: { submittedAt: 'desc' },
        include: { employee: { select: { employeeCode: true, name: true, designation: true } } },
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);
    return { data, total };
  }

  async findById(id: string) {
    return this.prisma.leaveRequest.findUnique({
      where: { id },
      include: { employee: { select: { employeeCode: true, name: true, leaveBalances: true, leaveUsed: true } } },
    });
  }

  async create(data: any) {
    return this.prisma.leaveRequest.create({ data });
  }

  async update(id: string, data: any) {
    return this.prisma.leaveRequest.update({ where: { id }, data });
  }
}

// ── Service ───────────────────────────────────────────────────────────────────
@Injectable()
export class LeaveService {
  private readonly logger = new Logger(LeaveService.name);

  constructor(
    private readonly dao: LeaveDAO,
    private readonly employeeService: EmployeeService,
  ) {}

  private mapOut(r: any): any {
    if (!r) return r;
    return {
      ...r,
      employeeId: r.employee?.employeeCode ?? r.employeeId,
      employeeDbId: r.employeeId,
      employeeName: r.employee?.name,
      employeeDesignation: r.employee?.designation,
      submittedAt: r.submittedAt?.toISOString?.() ?? r.submittedAt,
    };
  }

  async findAll(params: { employeeDbId?: string; status?: string; skip?: number; take?: number }) {
    const { data, total } = await this.dao.findAll({ employeeId: params.employeeDbId, ...params });
    return { data: data.map(r => this.mapOut(r)), total };
  }

  async findPending() {
    const { data, total } = await this.dao.findAll({ status: 'Pending' });
    return { data: data.map(r => this.mapOut(r)), total };
  }

  async findMyLeaves(employeeDbId: string) {
    const { data } = await this.dao.findAll({ employeeId: employeeDbId, take: 500 });
    return data.map(r => this.mapOut(r));
  }

  async submit(dto: {
    leaveTypeId: string; type: string; startDate: string; endDate: string;
    days: number; reason: string;
  }, employeeDbId: string, settingsLeaveTypes: any[]) {
    // Server-side balance check
    const emp = await this.employeeService.findByDbId(employeeDbId);
    if (!emp) throw new NotFoundException('Employee not found.');

    const lt = settingsLeaveTypes.find((t: any) => t.id === dto.leaveTypeId);
    if (lt) {
      const balances: any = (emp as any).__raw?.leaveBalances ?? {};
      const used: any = (emp as any).__raw?.leaveUsed ?? {};
      const remaining = (balances[dto.leaveTypeId] ?? lt.annualDays) - (used[dto.leaveTypeId] ?? 0);
      if (dto.days > remaining) {
        throw new BadRequestException(
          `Insufficient leave balance. You have ${remaining} day(s) remaining for ${lt.name}.`
        );
      }
    }

    const req = await this.dao.create({
      employeeId: employeeDbId,
      leaveTypeId: dto.leaveTypeId,
      type: dto.type,
      startDate: dto.startDate,
      endDate: dto.endDate,
      days: dto.days,
      reason: dto.reason,
      status: 'Pending',
    });

    this.logger.log(`Leave submitted by ${employeeDbId}: ${dto.days} days ${dto.leaveTypeId}`);
    return this.mapOut({ ...req, employee: null });
  }

  async review(
    id: string,
    dto: { status: 'Approved' | 'Rejected'; reviewNote?: string },
    reviewerName: string,
  ) {
    const req = await this.dao.findById(id);
    if (!req) throw new NotFoundException('Leave request not found.');
    if (req.status !== 'Pending') {
      throw new BadRequestException('Can only review pending leave requests.');
    }

    const updated = await this.dao.update(id, {
      status: dto.status,
      reviewNote: dto.reviewNote ?? '',
      reviewedBy: reviewerName,
    });

    // If approved, increment the employee's leave used counter
    if (dto.status === 'Approved') {
      await this.employeeService.incrementLeaveUsed(req.employeeId, req.leaveTypeId, req.days);
    }

    this.logger.log(`Leave ${id} ${dto.status} by ${reviewerName}`);
    return this.mapOut({ ...updated, employee: req.employee });
  }

  async cancel(id: string, employeeDbId: string) {
    const req = await this.dao.findById(id);
    if (!req) throw new NotFoundException('Leave request not found.');

    // IDOR check: employee can only cancel their own
    if (req.employeeId !== employeeDbId) {
      throw new ForbiddenException('Cannot cancel another employee\'s leave request.');
    }

    if (req.status !== 'Pending') {
      throw new BadRequestException('Can only cancel pending leave requests.');
    }

    const updated = await this.dao.update(id, { status: 'Cancelled' });
    return this.mapOut({ ...updated, employee: req.employee });
  }
}
