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

  @Put('/cron/config/:id')
  async updateCronConfig(
    @Body() body: UpdateCronConfig,
    @Param('id') id: string,
  ) {
    return this.cronManager.updateCronConfig({ ...body, id: +id });
  }

  @Get('/cron/config')
  async listCronConfig() {
    return this.cronManager.listCronConfig();
  }

  @Put('/cron/config/:id/toggle')
  async enableCronConfig(@Param('id') id: string) {
    return this.cronManager.toggleCronConfig(+id);
  }

  @Put('/cron/config/all/enable')
  async enableAllCronConfig() {
    return this.cronManager.enableAllCronConfig();
  }

  @Put('/cron/config/all/disable')
  async disableAllCronConfig() {
    return this.cronManager.disableAllCronConfig();
  }
}
