import { CronManagerModule } from '@/cron-manager/cron-manager.module';
import { UserModule } from '@/user/user.module';
import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Post } from './post.model';
import { PostService } from './post.service';

@Module({
  imports: [
    forwardRef(() => CronManagerModule),
    TypeOrmModule.forFeature([Post]),
    UserModule,
  ],
  providers: [PostService],
  exports: [PostService],
})
export class PostModule {}
