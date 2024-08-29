import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import {
  CreateCronConfig,
  CronManager,
  UpdateCronConfig,
} from 'nest-cron-manager';

@Controller()
export class CronManagerController {
  constructor(private readonly cronManager: CronManager) {}

  @Get('cmc')
  getControl() {
    return this.cronManager.getControl();
  }

  @Delete('cmc')
  purgeControl() {
    return this.cronManager.purgeControl();
  }

  @Patch('cmc')
  toggleControl() {
    return this.cronManager.toggleControl();
  }

  @Post('/cron/config')
  async createCronConfig(@Body() body: CreateCronConfig) {
    return this.cronManager.createCronConfig(body);
  }

  @Put('/cron/config/enable-all')
  async enableAllCronConfig() {
    return this.cronManager.enableAllCronConfig();
  }

  @Put('/cron/config/disable-all')
  async disableAllCronConfig() {
    return this.cronManager.disableAllCronConfig();
  }

  @Put('/cron/config/:id')
  async updateCronConfig(
    @Body() body: UpdateCronConfig,
    @Param('id') id: string,
  ) {
    return this.cronManager.updateCronConfig({ ...body, id });
  }

  @Get('/cron/config')
  async listCronConfig() {
    return this.cronManager.listCronConfig();
  }

  @Put('/cron/config/:id/toggle')
  async enableCronConfig(@Param('id') id: string) {
    return this.cronManager.toggleCronConfig(id);
  }
}
