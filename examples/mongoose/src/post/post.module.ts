import { CronManagerModule } from '@/cron-manager/cron-manager.module';
import { DatabaseModule } from '@/database/database.module';
import { UserModule } from '@/user/user.module';
import { forwardRef, Module } from '@nestjs/common';
import { PostService } from './post.service';

@Module({
  imports: [DatabaseModule, UserModule, forwardRef(() => CronManagerModule)],
  providers: [PostService],
  exports: [PostService],
})
export class PostModule {}
