import { Body, Controller, Post, Put } from '@nestjs/common';
import { User } from './user.model';
import { UserService } from './user.service';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  async create(@Body() data: User) {
    return this.userService.createUser(data);
  }

  @Put()
  async update(@Body() data: User) {
    return this.userService.updateUser(data);
  }
}
