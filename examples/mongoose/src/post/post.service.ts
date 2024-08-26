import { UserService } from '@/user/user.service';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { CronManager, Lens } from 'nest-cron-manager';
import { Post } from './post.model';

@Injectable()
export class PostService {
  logger: Logger;

  constructor(
    @InjectModel(Post.name)
    private readonly postRepository: Model<Post>,
    private readonly cronManager: CronManager,
    private readonly userService: UserService,
  ) {
    this.logger = new Logger(PostService.name);
  }

  /**
   * Called as inline jobType
   */
  @Cron(CronExpression.EVERY_5_SECONDS)
  async createPost() {
    await this.cronManager.handleJob(
      'createPost',
      async (context: Record<string, any>, lens: Lens) => {
        const user = await this.userService.getUserById(1);

        if (!user) {
          throw new Error('User not found');
        }

        if (user) {
          lens.capture({
            title: 'Create post',
            message: 'Post created successfully',
            username: user.username,
          });
        }

        if (user.status !== 'active') {
          throw new Error('User is not active');
        }

        const post = new Post();

        post.title = 'New post';
        post.content = 'Post content';
        // post.user = user;

        const created = await this.postRepository.create(post);

        lens.capture({
          title: 'Create post',
          message: 'Post created successfully',
          postTitle: created.title,
        });

        return created;
      },
    );
  }

  async getLatestPosts() {
    return this.postRepository.find({
      order: {
        created_at: 'DESC',
      },
      take: 10,
    });
  }
}
