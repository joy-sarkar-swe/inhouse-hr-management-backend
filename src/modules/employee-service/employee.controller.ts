/**
 * @fileoverview Employee controller — HR admin routes and employee self-service.
 * @module employee-service
 */
import {
  Body, Controller, Get, Param, Patch, Post,
  Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/modules/auth-service/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import type { AuthUser } from 'src/shared/interfaces/auth-user.interface';
import { EmployeeService } from './employee.service';
import { CreateEmployeeDto, UpdateEmployeeDto, UpdateMyProfileDto } from './dto/employee.dto';

@ApiTags('Employees')
@ApiBearerAuth('Authorization')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'employees', version: '1' })
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  // ── HR routes ──────────────────────────────────────────────────────────────

  @Get()
  @Roles('hr')
  @ApiOperation({ summary: 'List all employees (HR only)' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'department', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'skip', required: false })
  @ApiQuery({ name: 'take', required: false })
  async findAll(
    @Query('search') search?: string,
    @Query('department') department?: string,
    @Query('status') status?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.employeeService.findAll({
      search,
      department,
      status,
      skip: skip ? parseInt(skip) : undefined,
      take: take ? parseInt(take) : undefined,
    });
  }

  @Post()
  @Roles('hr')
  @ApiOperation({ summary: 'Create a new employee (HR only)' })
  async create(@Body() dto: CreateEmployeeDto) {
    return this.employeeService.create(dto);
  }

  @Get('departments')
  @Roles('hr')
  @ApiOperation({ summary: 'List all departments (HR only)' })
  async getDepartments() {
    return this.employeeService.getDepartments();
  }

  @Get(':id')
  @Roles('hr')
  @ApiOperation({ summary: 'Get employee by ID or code (HR only)' })
  async findById(@Param('id') id: string) {
    return this.employeeService.findById(id);
  }

  @Patch(':id')
  @Roles('hr')
  @ApiOperation({ summary: 'Update employee (HR only)' })
  async update(@Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employeeService.update(id, dto);
  }

  // ── Employee self-service routes ───────────────────────────────────────────

  @Get('me/profile')
  @Roles('employee')
  @ApiOperation({ summary: 'Get own profile (employee)' })
  async getMyProfile(@CurrentUser() user: AuthUser) {
    if (!user.employeeId) {
      return null;
    }
    return this.employeeService.findByDbId(user.employeeId);
  }

  @Patch('me/profile')
  @Roles('employee')
  @ApiOperation({ summary: 'Update own profile — phone/address only (employee)' })
  async updateMyProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateMyProfileDto,
  ) {
    return this.employeeService.updateMyProfile(user.employeeId!, dto);
  }
}
