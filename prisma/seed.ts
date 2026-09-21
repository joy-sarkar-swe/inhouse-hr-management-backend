/**
 * @fileoverview Database seed — populates initial HR data.
 *
 * Cleanly clears database first, then seeds ONLY:
 *  - Company settings for Zentura Agency
 *  - 1 HR admin user (info.zentura.agency@gmail.com / zentura1234)
 *  - 4 employee accounts with default password 'emp123456':
 *      1. ishratjahanrintu13@gmail.com
 *      2. saadrayhan113@gmail.com
 *      3. developer.joysarkar@gmail.com
 *      4. mhtamimm29@gmail.com
 *
 * All other tables (attendance, leaves, payroll) are wiped completely empty.
 *
 * Run with: npx prisma db seed
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const BCRYPT_ROUNDS = 10;

async function main() {
  console.log('🧹 Wiping entire database clean...');

  // Delete in reverse order of foreign key dependencies
  await prisma.attendance.deleteMany();
  await prisma.leaveRequest.deleteMany();
  await prisma.payroll.deleteMany();
  await prisma.media.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.user.deleteMany();
  await prisma.companySettings.deleteMany();

  console.log('✅ Database wiped completely clean.');

  console.log('🌱 Seeding Admin & 4 Employees...');

  // ── 1. HR Admin User ───────────────────────────────────────────────────────
  const adminPasswordHash = await bcrypt.hash('zentura1234', BCRYPT_ROUNDS);
  const hrUser = await prisma.user.create({
    data: {
      name: 'Zentura Admin',
      email: 'info.zentura.agency@gmail.com',
      password: adminPasswordHash,
      role: 'HR',
      acc_verified: true,
    },
  });
  console.log('✅ HR Admin created:', hrUser.email);

  // ── 2. Company Settings ────────────────────────────────────────────────────
  await prisma.companySettings.create({
    data: {
      id: 1,
      companyName: 'Zentura Agency',
      companyAddress: 'Dhaka, Bangladesh',
      timezone: 'Asia/Dhaka',
      currency: 'BDT',
      workingDays: [0, 1, 2, 3, 4], // Sun-Thu
      defaultWorkStart: '10:00',
      defaultDailyHours: 7,
      defaultBreakMinutes: 60,
      lateThresholdMinutes: 10,
      leaveTypes: [
        { id: 'sick',      name: 'Sick Leave',     annualDays: 12, paid: true,  requiresApproval: true,  maxConsecutiveDays: 5  },
        { id: 'casual',    name: 'Casual Leave',    annualDays: 10, paid: true,  requiresApproval: true,  maxConsecutiveDays: 3  },
        { id: 'annual',    name: 'Annual Leave',    annualDays: 14, paid: true,  requiresApproval: true,  maxConsecutiveDays: 14 },
        { id: 'unpaid',    name: 'Unpaid Leave',    annualDays: 30, paid: false, requiresApproval: true,  maxConsecutiveDays: 30 },
        { id: 'emergency', name: 'Emergency Leave', annualDays: 3,  paid: true,  requiresApproval: false, maxConsecutiveDays: 3  },
      ],
      payrollRules: { payableHoursCap: true, roundToNearestTaka: true, includeUnpaidLeaveDeduction: false },
    },
  });
  console.log('✅ Company settings created for Zentura Agency');

  // ── 3. Employees (4 requested) ──────────────────────────────────────────────
  const defaultEmpPasswordHash = await bcrypt.hash('emp123456', BCRYPT_ROUNDS);

  const employeesData = [
    {
      employeeCode: 'EMP001',
      name: 'Ishrat Jahan Rintu',
      email: 'ishratjahanrintu13@gmail.com',
      phone: '01711-100001',
      department: 'Engineering',
      designation: 'Software Engineer',
      status: 'Active' as const,
      type: 'FullTime' as const,
      hourlyRate: 750,
      dailyHours: 7,
      weeklyHours: 35,
      workStart: '10:00',
      breakMinutes: 60,
      joinDate: new Date().toISOString().slice(0, 10),
      leaveBalances: { sick: 12, casual: 10, annual: 14, unpaid: 30, emergency: 3 },
      leaveUsed:    { sick: 0,  casual: 0,  annual: 0,  unpaid: 0,  emergency: 0 },
    },
    {
      employeeCode: 'EMP002',
      name: 'Saad Rayhan',
      email: 'saadrayhan113@gmail.com',
      phone: '01722-100002',
      department: 'Engineering',
      designation: 'Full-Stack Developer',
      status: 'Active' as const,
      type: 'FullTime' as const,
      hourlyRate: 700,
      dailyHours: 7,
      weeklyHours: 35,
      workStart: '10:00',
      breakMinutes: 60,
      joinDate: new Date().toISOString().slice(0, 10),
      leaveBalances: { sick: 12, casual: 10, annual: 14, unpaid: 30, emergency: 3 },
      leaveUsed:    { sick: 0,  casual: 0,  annual: 0,  unpaid: 0,  emergency: 0 },
    },
    {
      employeeCode: 'EMP003',
      name: 'Joy Sarkar',
      email: 'developer.joysarkar@gmail.com',
      phone: '01733-100003',
      department: 'Engineering',
      designation: 'Software Engineer',
      status: 'Active' as const,
      type: 'FullTime' as const,
      hourlyRate: 800,
      dailyHours: 7,
      weeklyHours: 35,
      workStart: '10:00',
      breakMinutes: 60,
      joinDate: new Date().toISOString().slice(0, 10),
      leaveBalances: { sick: 12, casual: 10, annual: 14, unpaid: 30, emergency: 3 },
      leaveUsed:    { sick: 0,  casual: 0,  annual: 0,  unpaid: 0,  emergency: 0 },
    },
    {
      employeeCode: 'EMP004',
      name: 'MH Tamim',
      email: 'mhtamimm29@gmail.com',
      phone: '01744-100004',
      department: 'Design',
      designation: 'UI/UX Designer',
      status: 'Active' as const,
      type: 'FullTime' as const,
      hourlyRate: 680,
      dailyHours: 7,
      weeklyHours: 35,
      workStart: '10:00',
      breakMinutes: 60,
      joinDate: new Date().toISOString().slice(0, 10),
      leaveBalances: { sick: 12, casual: 10, annual: 14, unpaid: 30, emergency: 3 },
      leaveUsed:    { sick: 0,  casual: 0,  annual: 0,  unpaid: 0,  emergency: 0 },
    },
  ];

  for (const empData of employeesData) {
    // Create linked User
    const user = await prisma.user.create({
      data: {
        name: empData.name,
        email: empData.email,
        password: defaultEmpPasswordHash,
        role: 'EMPLOYEE',
        acc_verified: true,
      },
    });

    // Create Employee record
    const emp = await prisma.employee.create({
      data: {
        employeeCode: empData.employeeCode,
        userId: user.id,
        name: empData.name,
        email: empData.email,
        phone: empData.phone,
        department: empData.department,
        designation: empData.designation,
        status: empData.status,
        type: empData.type,
        hourlyRate: empData.hourlyRate,
        dailyHours: empData.dailyHours,
        weeklyHours: empData.weeklyHours,
        workStart: empData.workStart,
        breakMinutes: empData.breakMinutes,
        joinDate: empData.joinDate,
        leaveBalances: empData.leaveBalances,
        leaveUsed: empData.leaveUsed,
      },
    });
    console.log(`✅ Employee created: ${empData.employeeCode} — ${empData.name} (${empData.email})`);
  }

  console.log('🎉 Database wipe & fresh seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
