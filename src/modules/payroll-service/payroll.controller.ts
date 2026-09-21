import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/modules/auth-service/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import type { AuthUser } from 'src/shared/interfaces/auth-user.interface';
import { PayrollService } from './payroll.service';

@ApiTags('Payroll')
@ApiBearerAuth('Authorization')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'payroll', version: '1' })
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Get()
  @Roles('hr')
  @ApiOperation({ summary: 'List all payroll records (HR)' })
  async findAll(
    @Query('month') month?: string,
    @Query('status') status?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.payrollService.findAll({ month, status, employeeId });
  }

  @Post('run')
  @Roles('hr')
  @ApiOperation({ summary: 'Run payroll for a given month (HR)' })
  async runPayroll(@Body() dto: { month: string }) {
    return this.payrollService.runPayroll(dto.month);
  }

  @Patch(':id')
  @Roles('hr')
  @ApiOperation({ summary: 'Update payroll record — bonus, status, notes (HR)' })
  async update(@Param('id') id: string, @Body() dto: any) {
    return this.payrollService.updateRecord(id, dto);
  }

  @Get('my')
  @Roles('employee')
  @ApiOperation({ summary: 'Get own payslips (employee)' })
  async getMyPayslips(@CurrentUser() user: AuthUser) {
    return this.payrollService.findMyPayslips(user.employeeId!);
  }

  @Get('my/:id')
  @Roles('employee')
  @ApiOperation({ summary: 'Get specific payslip (employee)' })
  async getMyPayslip(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.payrollService.findMyPayslip(id, user.employeeId!);
  }
}
