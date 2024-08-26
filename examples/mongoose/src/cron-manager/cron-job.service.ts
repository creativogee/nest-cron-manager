import { UserService } from '@/user/user.service';
import { Injectable } from '@nestjs/common';
import { bindMethods, Lens } from 'nest-cron-manager';

@Injectable()
export class CronJobService {
  constructor(private readonly userService: UserService) {}

  onModuleInit() {
    bindMethods(this);
  }

  /**
   * To be called as a method jobType
   */
  async getReport() {
    const [users] = await Promise.all([this.userService.getAll()]);

    const lens = new Lens();

    lens.capture({
      title: 'Get report',
      message: 'Report generated successfully',
      users: users.map((user) => ({
        username: user.username,
        status: user.status,
      })),
    });

    return lens;
  }
}
