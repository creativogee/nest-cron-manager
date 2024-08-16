import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CronManager, Lens } from 'nest-cron-manager';

@Injectable()
export class CronJobService {
  private logger: Logger;

  constructor(private readonly cronManager: CronManager) {
    this.logger = new Logger(CronJobService.name);
  }

  // @Cron(CronExpression.EVERY_MINUTE)
  async getNewUsers() {
    this.logger.log('Getting new users...');
  }

  @Cron(CronExpression.EVERY_5_SECONDS)
  async getNewOrders() {
    await this.cronManager.handleJob(
      'getNewOrders',
      async (
        context: Record<string, any>,
        config: Record<string, any>,
        lens: Lens,
      ) => {
        // get new orders
        lens.capture({
          title: 'Getting new orders',
          message: 'Orders retrieved successfully',
          total: 10,
        });

        throw new Error('Failed to process orders');
      },
    );
  }
}
