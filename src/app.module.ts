/**
 * @fileoverview Root application module.
 * @module app
 */
import { Module } from '@nestjs/common';
import { AuthModule } from 'src/modules/auth-service/auth.module';
import { UserModule } from 'src/modules/user-service/user.module';
import { GcpStorageModule } from './common/gcp-storage/gcp-storage.module';
import { AppCacheModule } from './common/cache/cache.module';
import { RedisModule } from './common/redis/redis.module';
import { ResilienceModule } from './common/resilience';
import { DockerLifecycleService } from './common/lifecycle/docker-lifecycle.service';
import { QueueLifecycleService } from './common/lifecycle/queue-lifecycle.service';
import { EmailModule } from './modules/email-service/email.module';
import { EmailTestController } from './modules/email-service/test-email-service/email-test.controller';
import { HealthModule } from './modules/health/health.module';
import { MetricsModule } from './common/metrics/metrics.module';
import { PrismaModule } from './shared/prisma/prisma.module';
// ── HR Feature Modules ────────────────────────────────────────────────────────
import { EmployeeModule } from './modules/employee-service/employee.module';
import { AttendanceModule } from './modules/attendance-service/attendance.module';
import { LeaveModule } from './modules/leave-service/leave.module';
import { PayrollModule } from './modules/payroll-service/payroll.module';
import { SettingsModule } from './modules/settings-service/settings.module';
import { ReportsModule } from './modules/reports-service/reports.module';

@Module({
  imports: [
    // ── Infrastructure ───────────────────────────────────────────────────────
    PrismaModule,
    RedisModule,
    AppCacheModule,
    ResilienceModule,
    EmailModule,
    GcpStorageModule,

    // ── Core modules ─────────────────────────────────────────────────────────
    MetricsModule,
    HealthModule,
    AuthModule,
    UserModule,

    // ── HR Feature Modules ────────────────────────────────────────────────────
    SettingsModule,
    EmployeeModule,
    AttendanceModule,
    LeaveModule,
    PayrollModule,
    ReportsModule,
  ],
  controllers:
    process.env.NODE_ENV !== 'production' ? [EmailTestController] : [],
  providers: [
    QueueLifecycleService,
    DockerLifecycleService,
  ],
})
export class AppModule {}
