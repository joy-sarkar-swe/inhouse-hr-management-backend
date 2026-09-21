/**
 * @fileoverview Employee DAO — all database operations for the Employee model.
 * @module employee-service/dao
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/shared/prisma/prisma.service';

export type CreateEmployeeData = Prisma.EmployeeCreateInput;
export type UpdateEmployeeData = Prisma.EmployeeUpdateInput;

@Injectable()
export class EmployeeDAO {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: {
    search?: string;
    department?: string;
    status?: string;
    skip?: number;
    take?: number;
  }) {
    const where: Prisma.EmployeeWhereInput = {};

    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { email: { contains: params.search, mode: 'insensitive' } },
        { employeeCode: { contains: params.search, mode: 'insensitive' } },
        { department: { contains: params.search, mode: 'insensitive' } },
        { designation: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    if (params.department) {
      where.department = params.department;
    }

    if (params.status) {
      // Map string status to enum
      where.status = params.status as any;
    }

    const [data, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        skip: params.skip ?? 0,
        take: params.take ?? 100,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.employee.count({ where }),
    ]);

    return { data, total };
  }

  async findById(id: string) {
    return this.prisma.employee.findUnique({ where: { id } });
  }

  async findByUserId(userId: string) {
    return this.prisma.employee.findUnique({ where: { userId } });
  }

  async findByEmail(email: string) {
    return this.prisma.employee.findUnique({ where: { email } });
  }

  async create(data: CreateEmployeeData) {
    return this.prisma.employee.create({ data });
  }

  async update(id: string, data: UpdateEmployeeData) {
    return this.prisma.employee.update({ where: { id }, data });
  }

  async getNextEmployeeCode(): Promise<string> {
    const count = await this.prisma.employee.count();
    return `EMP${String(count + 1).padStart(3, '0')}`;
  }

  async getDepartments(): Promise<string[]> {
    const rows = await this.prisma.employee.findMany({
      select: { department: true },
      distinct: ['department'],
      orderBy: { department: 'asc' },
    });
    return rows.map((r) => r.department);
  }
}
