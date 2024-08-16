import { Body, Controller, Param, Post, Put } from '@nestjs/common';
import {
  CreateCronConfig,
  CronManager,
  UpdateCronConfig,
} from 'nest-cron-manager';

@Controller()
export class CronConfigController {
  constructor(private readonly cronManager: CronManager) {}

  @Post('/cron-config')
  async createCronConfig(@Body() body: CreateCronConfig) {
    return this.cronManager.createCronConfig(body);
  }

  @Put('/cron-config/:id')
  async updateCronConfig(
    @Body() body: UpdateCronConfig,
    @Param('id') id: string,
  ) {
    return this.cronManager.updateCronConfig({ ...body, id: +id });
  }
}
