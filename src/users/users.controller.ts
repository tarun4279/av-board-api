import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { UsersService } from './users.service';
import type {
  CreateUserInput,
  MarkBusyInput,
  UpdateUserInput,
  UpdateUserTagsInput,
} from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  async createUser(@Body() body: CreateUserInput) {
    return await this.usersService.create(body);
  }

  @Get(':id')
  async getUser(@Param('id') id: string) {
    return await this.usersService.getById(id);
  }

  @Patch(':id')
  async updateUser(@Param('id') id: string, @Body() body: UpdateUserInput) {
    return await this.usersService.update(id, body);
  }

  @Delete(':id')
  async deleteUser(@Param('id') id: string) {
    await this.usersService.delete(id);
    return { deleted: true };
  }

  @Put(':id/tags')
  async updateUserTags(
    @Param('id') id: string,
    @Body() body: UpdateUserTagsInput,
  ) {
    return await this.usersService.updateTags(id, body);
  }

  @Post(':id/busy')
  async markUserBusy(@Param('id') id: string, @Body() body: MarkBusyInput) {
    return await this.usersService.markBusy(id, body);
  }
}
