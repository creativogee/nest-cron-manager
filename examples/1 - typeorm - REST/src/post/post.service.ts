import { UserService } from '@/user/user.service';
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { CronManager, Lens } from 'nest-cron-manager';
import { Repository } from 'typeorm';
import { Post } from './post.model';

@Injectable()
export class PostService {
  constructor(
    @InjectRepository(Post)
    private readonly postRepository: Repository<Post>,
    private readonly cronManager: CronManager,
    private readonly userService: UserService,
  ) {}

  /**
   * Called as inline jobType
   */
  @Cron(CronExpression.EVERY_5_SECONDS)
  async createPost() {
    await this.cronManager.handleJob(
      'createPost',
      async (
        context: Record<string, any>,
        config: Record<string, any>,
        lens: Lens,
      ) => {
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

        const post = this.postRepository.create({
          title: 'New post',
          content: 'Post content',
          user,
        });

        await this.postRepository.save(post);

        lens.capture({
          title: 'Create post',
          message: 'Post created successfully',
          postTitle: post.title,
        });
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
