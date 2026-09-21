import { Module } from '@nestjs/common';
import { AttendanceDAO, AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';

@Module({
  controllers: [AttendanceController],
  providers: [AttendanceDAO, AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
