import { Module } from '@nestjs/common';
import { LeaveDAO, LeaveService } from './leave.service';
import { LeaveController } from './leave.controller';
import { EmployeeModule } from 'src/modules/employee-service/employee.module';
import { SettingsModule } from 'src/modules/settings-service/settings.module';

@Module({
  imports: [EmployeeModule, SettingsModule],
  controllers: [LeaveController],
  providers: [LeaveDAO, LeaveService],
  exports: [LeaveService, LeaveDAO],
})
export class LeaveModule {}
