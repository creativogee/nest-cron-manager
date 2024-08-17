import { UserService } from '@/user/user.service';
import { Injectable } from '@nestjs/common';
import { bindMethods } from 'nest-cron-manager';

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

    const report = {
      users: users.map((user) => ({
        username: user.username,
        status: user.status,
      })),
    };

    return report;
  }
}
