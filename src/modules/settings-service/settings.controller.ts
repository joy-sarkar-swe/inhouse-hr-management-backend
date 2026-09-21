import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/modules/auth-service/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { SettingsService } from './settings.service';

@ApiTags('Settings')
@ApiBearerAuth('Authorization')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'settings', version: '1' })
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @Roles('hr', 'employee')
  @ApiOperation({ summary: 'Get company settings' })
  async get() {
    return this.settingsService.get();
  }

  @Patch()
  @Roles('hr')
  @ApiOperation({ summary: 'Update company settings (HR only)' })
  async update(@Body() dto: any) {
    return this.settingsService.update(dto);
  }
}
