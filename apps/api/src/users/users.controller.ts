import { Controller, Get, Patch, Post, Body, UseGuards } from '@nestjs/common'
import { UsersService } from './users.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CurrentUser } from '../common/decorators/current-user.decorator'

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private users: UsersService) {}

  @Get('me')
  profile(@CurrentUser('sub') userId: string) {
    return this.users.getProfile(userId)
  }

  @Patch('me')
  update(@CurrentUser('sub') userId: string, @Body() body: { fullName?: string; phone?: string }) {
    return this.users.updateProfile(userId, body)
  }

  @Post('me/change-password')
  changePassword(
    @CurrentUser('sub') userId: string,
    @Body() body: { oldPassword: string; newPassword: string },
  ) {
    return this.users.changePassword(userId, body.oldPassword, body.newPassword)
  }

  @Get('me/balance')
  balance(@CurrentUser('sub') userId: string) {
    return this.users.getBalance(userId)
  }
}
