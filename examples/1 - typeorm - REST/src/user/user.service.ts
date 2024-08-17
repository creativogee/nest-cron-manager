import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.model';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async createUser(data: User): Promise<User> {
    return this.userRepository.save(data);
  }

  async updateUser(data: User): Promise<User> {
    return this.userRepository.save(data);
  }

  async getUserById(id: number): Promise<User> {
    return this.userRepository.findOne({ where: { id } });
  }

  async getAll(): Promise<User[]> {
    return this.userRepository.find();
  }
}
