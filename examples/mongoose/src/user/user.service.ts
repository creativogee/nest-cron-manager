import { Injectable } from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from './user.model';

@Injectable()
export class UserService {
  constructor(
    @InjectModel(User.name)
    private readonly userRepository: Model<User>,
  ) {}

  async createUser(data: User): Promise<User> {
    return this.userRepository.create(data);
  }

  async updateUser(data: User): Promise<User> {
    return this.userRepository.create(data);
  }

  async getUserById(id: number): Promise<User> {
    return this.userRepository.findOne({ _id: id }).exec();
  }

  async getAll(): Promise<User[]> {
    return this.userRepository.find().exec();
  }
}
