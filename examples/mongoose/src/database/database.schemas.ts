import { CronConfig, CronConfigSchema } from '@/cron-manager/cron-config.model';
import { CronJob, CronJobSchema } from '@/cron-manager/cron-job.model';
import {
  CronManagerControl,
  CronManagerControlSchema,
} from '@/cron-manager/cron-manager-control.model';
import { Post, PostSchema } from '@/post/post.model';
import { User, UserSchema } from '@/user/user.model';
import { MongooseModule } from '@nestjs/mongoose';

const schemas = MongooseModule.forFeature([
  {
    name: CronManagerControl.name,
    schema: CronManagerControlSchema,
  },
  {
    name: CronConfig.name,
    schema: CronConfigSchema,
  },
  {
    name: CronJob.name,
    schema: CronJobSchema,
  },
  {
    name: Post.name,
    schema: PostSchema,
  },
  {
    name: User.name,
    schema: UserSchema,
  },
]);

export default schemas;
