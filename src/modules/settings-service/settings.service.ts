/**
 * @fileoverview Settings service — company settings singleton CRUD.
 * @module settings-service
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/shared/prisma/prisma.service';

// Default settings matching the frontend's DEFAULT_SETTINGS
const DEFAULT_LEAVE_TYPES = [
  { id: 'sick',      name: 'Sick Leave',      annualDays: 12, paid: true,  requiresApproval: true,  maxConsecutiveDays: 5 },
  { id: 'casual',    name: 'Casual Leave',     annualDays: 10, paid: true,  requiresApproval: true,  maxConsecutiveDays: 3 },
  { id: 'annual',    name: 'Annual Leave',     annualDays: 14, paid: true,  requiresApproval: true,  maxConsecutiveDays: 14 },
  { id: 'unpaid',    name: 'Unpaid Leave',     annualDays: 30, paid: false, requiresApproval: true,  maxConsecutiveDays: 30 },
  { id: 'emergency', name: 'Emergency Leave',  annualDays: 3,  paid: true,  requiresApproval: false, maxConsecutiveDays: 3 },
];

const DEFAULT_PAYROLL_RULES = {
  payableHoursCap: true,
  roundToNearestTaka: true,
  includeUnpaidLeaveDeduction: false,
};

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async get() {
    let settings = await this.prisma.companySettings.findUnique({ where: { id: 1 } });

    if (!settings) {
      // Auto-create singleton with defaults
      settings = await this.prisma.companySettings.create({
        data: {
          id: 1,
          companyName: 'HRFlow Technologies Ltd.',
          companyAddress: 'Dhaka, Bangladesh',
          timezone: 'Asia/Dhaka',
          currency: 'BDT',
          workingDays: [0, 1, 2, 3, 4],
          defaultWorkStart: '10:00',
          defaultDailyHours: 7,
          defaultBreakMinutes: 60,
          lateThresholdMinutes: 10,
          leaveTypes: DEFAULT_LEAVE_TYPES,
          payrollRules: DEFAULT_PAYROLL_RULES,
        },
      });
    }

    return this.mapOut(settings);
  }

  async update(dto: any) {
    const updateData: any = {};
    if (dto.companyName !== undefined) updateData.companyName = dto.companyName;
    if (dto.companyAddress !== undefined) updateData.companyAddress = dto.companyAddress;
    if (dto.timezone !== undefined) updateData.timezone = dto.timezone;
    if (dto.currency !== undefined) updateData.currency = dto.currency;
    if (dto.workingDays !== undefined) updateData.workingDays = dto.workingDays;
    if (dto.defaultWorkStart !== undefined) updateData.defaultWorkStart = dto.defaultWorkStart;
    if (dto.defaultDailyHours !== undefined) updateData.defaultDailyHours = dto.defaultDailyHours;
    if (dto.defaultBreakMinutes !== undefined) updateData.defaultBreakMinutes = dto.defaultBreakMinutes;
    if (dto.lateThresholdMinutes !== undefined) updateData.lateThresholdMinutes = dto.lateThresholdMinutes;
    if (dto.leaveTypes !== undefined) updateData.leaveTypes = dto.leaveTypes;
    if (dto.payrollRules !== undefined) updateData.payrollRules = dto.payrollRules;

    const updated = await this.prisma.companySettings.upsert({
      where: { id: 1 },
      create: { id: 1, ...updateData },
      update: updateData,
    });

    this.logger.log('Company settings updated');
    return this.mapOut(updated);
  }

  private mapOut(s: any) {
    return {
      companyName: s.companyName,
      companyAddress: s.companyAddress,
      timezone: s.timezone,
      currency: s.currency,
      workingDays: s.workingDays,
      defaultWorkStart: s.defaultWorkStart,
      defaultDailyHours: s.defaultDailyHours,
      defaultBreakMinutes: s.defaultBreakMinutes,
      lateThresholdMinutes: s.lateThresholdMinutes,
      leaveTypes: s.leaveTypes,
      payrollRules: s.payrollRules,
    };
  }
}
