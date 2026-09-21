import { Module } from '@nestjs/common';
import { PayrollDAO, PayrollService } from './payroll.service';
import { PayrollController } from './payroll.controller';
import { SettingsModule } from 'src/modules/settings-service/settings.module';

@Module({
  imports: [SettingsModule],
  controllers: [PayrollController],
  providers: [PayrollDAO, PayrollService],
  exports: [PayrollService],
})
export class PayrollModule {}
