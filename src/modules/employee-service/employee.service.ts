/**
 * @fileoverview Employee service — orchestration layer over EmployeeDAO.
 * @module employee-service
 */
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from 'src/shared/prisma/prisma.service';
import config from 'src/shared/config/app.config';
import { EmployeeDAO } from './dao/employee.dao';
import { CreateEmployeeDto, UpdateEmployeeDto, UpdateMyProfileDto } from './dto/employee.dto';

// Status mapping from frontend string to Prisma enum
const STATUS_MAP: Record<string, string> = {
  'Active': 'Active',
  'Probation': 'Probation',
  'On Leave': 'OnLeave',
  'Suspended': 'Suspended',
  'Resigned': 'Resigned',
  'Terminated': 'Terminated',
};

const TYPE_MAP: Record<string, string> = {
  'Full-Time': 'FullTime',
  'Part-Time': 'PartTime',
  'Contract': 'Contract',
};

/** Map DB enum back to frontend display strings */
function mapEmployeeOut(emp: any): any {
  if (!emp) return emp;
  const statusRev: Record<string, string> = {
    Active: 'Active', Probation: 'Probation', OnLeave: 'On Leave',
    Suspended: 'Suspended', Resigned: 'Resigned', Terminated: 'Terminated',
  };
  const typeRev: Record<string, string> = {
    FullTime: 'Full-Time', PartTime: 'Part-Time', Contract: 'Contract',
  };
  return {
    ...emp,
    id: emp.employeeCode,       // Frontend uses EMP001 style IDs
    dbId: emp.id,                // Internal UUID for relational queries
    status: statusRev[emp.status] ?? emp.status,
    type: typeRev[emp.type] ?? emp.type,
    hourlyRate: Number(emp.hourlyRate),
  };
}

@Injectable()
export class EmployeeService {
  private readonly logger = new Logger(EmployeeService.name);

  constructor(
    private readonly employeeDAO: EmployeeDAO,
    private readonly prisma: PrismaService,
  ) {}

  async findAll(params: {
    search?: string;
    department?: string;
    status?: string;
    skip?: number;
    take?: number;
  }) {
    const { data, total } = await this.employeeDAO.findAll(params);
    return { data: data.map(mapEmployeeOut), total };
  }

  async findById(id: string) {
    // Support both UUID and employeeCode (EMP001)
    let emp: any;
    if (id.startsWith('EMP')) {
      emp = await this.prisma.employee.findUnique({ where: { employeeCode: id } });
    } else {
      emp = await this.employeeDAO.findById(id);
    }
    if (!emp) throw new NotFoundException('Employee not found.');
    return mapEmployeeOut(emp);
  }

  async findByDbId(dbId: string) {
    const emp = await this.employeeDAO.findById(dbId);
    if (!emp) throw new NotFoundException('Employee not found.');
    return mapEmployeeOut(emp);
  }

  /** Used by AuthService to resolve the Employee record for login token. */
  async findEmployeeByUserId(userId: string) {
    return this.employeeDAO.findByUserId(userId);
  }

  async create(dto: CreateEmployeeDto) {
    // Guard duplicate email
    const existing = await this.employeeDAO.findByEmail(dto.email);
    if (existing) throw new ConflictException('An employee with this email already exists.');

    const employeeCode = await this.employeeDAO.getNextEmployeeCode();

    // Hash password for the linked User account
    const password = dto.password ?? '1234';
    const hashedPassword = await bcrypt.hash(password, config.BCRYPT_SALT_ROUNDS);

    // Create the linked User account (EMPLOYEE role, pre-verified)
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        password: hashedPassword,
        role: 'EMPLOYEE' as any,
        acc_verified: true,
      },
    });

    const statusEnum = STATUS_MAP[dto.status ?? 'Active'] ?? 'Active';
    const typeEnum = TYPE_MAP[dto.type ?? 'Full-Time'] ?? 'FullTime';

    const defaultLeaveBalances = { sick: 12, casual: 10, annual: 14, unpaid: 30, emergency: 3 };
    const defaultLeaveUsed = { sick: 0, casual: 0, annual: 0, unpaid: 0, emergency: 0 };

    const emp = await this.employeeDAO.create({
      employeeCode,
      userId: user.id,
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      address: dto.address,
      dob: dto.dob,
      department: dto.department,
      designation: dto.designation,
      status: statusEnum as any,
      type: typeEnum as any,
      hourlyRate: dto.hourlyRate,
      dailyHours: dto.dailyHours ?? 7,
      weeklyHours: dto.weeklyHours ?? 35,
      workStart: dto.workStart ?? '10:00',
      breakMinutes: dto.breakMinutes ?? 60,
      joinDate: dto.joinDate ?? new Date().toISOString().slice(0, 10),
      notes: dto.notes,
      leaveBalances: defaultLeaveBalances,
      leaveUsed: defaultLeaveUsed,
    });

    this.logger.log(`Employee created: ${employeeCode} (${dto.email})`);
    return mapEmployeeOut(emp);
  }

  async update(id: string, dto: UpdateEmployeeDto) {
    // Resolve to UUID if EMP code given
    let dbId = id;
    if (id.startsWith('EMP')) {
      const emp = await this.prisma.employee.findUnique({ where: { employeeCode: id } });
      if (!emp) throw new NotFoundException('Employee not found.');
      dbId = emp.id;
    }

    const updateData: any = { ...dto };
    if (dto.status) updateData.status = STATUS_MAP[dto.status] ?? dto.status;
    if (dto.type) updateData.type = TYPE_MAP[dto.type] ?? dto.type;
    if (dto.hourlyRate !== undefined) updateData.hourlyRate = dto.hourlyRate;

    // Remove DTO-only fields not in the DB model
    delete updateData.password;

    const updated = await this.employeeDAO.update(dbId, updateData);
    if (dto.name && updated.userId) {
      await this.prisma.user.update({
        where: { id: updated.userId },
        data: { name: dto.name },
      });
    }
    return mapEmployeeOut(updated);
  }

  async updateMyProfile(employeeDbId: string, dto: UpdateMyProfileDto) {
    const updated = await this.employeeDAO.update(employeeDbId, dto as any);
    if (dto.name && updated.userId) {
      await this.prisma.user.update({
        where: { id: updated.userId },
        data: { name: dto.name },
      });
    }
    return mapEmployeeOut(updated);
  }

  async getDepartments(): Promise<string[]> {
    return this.employeeDAO.getDepartments();
  }

  /** Update leave balances after leave approval (called by leave service). */
  async incrementLeaveUsed(employeeDbId: string, leaveTypeId: string, days: number) {
    const emp = await this.employeeDAO.findById(employeeDbId);
    if (!emp) return;
    const used: any = (emp.leaveUsed as any) ?? {};
    used[leaveTypeId] = (used[leaveTypeId] ?? 0) + days;
    await this.employeeDAO.update(employeeDbId, { leaveUsed: used });
  }

  /** Reverse leave balance deduction on cancellation. */
  async decrementLeaveUsed(employeeDbId: string, leaveTypeId: string, days: number) {
    const emp = await this.employeeDAO.findById(employeeDbId);
    if (!emp) return;
    const used: any = (emp.leaveUsed as any) ?? {};
    used[leaveTypeId] = Math.max(0, (used[leaveTypeId] ?? 0) - days);
    await this.employeeDAO.update(employeeDbId, { leaveUsed: used });
  }
}
