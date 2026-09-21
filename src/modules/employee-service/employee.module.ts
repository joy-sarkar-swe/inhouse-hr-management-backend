/**
 * @fileoverview Employee module.
 * @module employee-service
 */
import { Module } from '@nestjs/common';
import { EmployeeDAO } from './dao/employee.dao';
import { EmployeeService } from './employee.service';
import { EmployeeController } from './employee.controller';

@Module({
  controllers: [EmployeeController],
  providers: [EmployeeDAO, EmployeeService],
  exports: [EmployeeService, EmployeeDAO],
})
export class EmployeeModule {}
