import { Controller, Post, Get, Patch, Body, Param, Req, UseGuards } from '@nestjs/common'
import { AdminAuthService } from './admin-auth.service'
import { AdminJwtGuard } from './admin-jwt.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { RolesGuard } from '../common/guards/roles.guard'
import { CurrentUser } from '../common/decorators/current-user.decorator'

@Controller('admin/auth')
export class AdminAuthController {
  constructor(private adminAuth: AdminAuthService) {}

  @Post('login')
  login(@Body() body: { email: string; password: string }, @Req() req: any) {
    return this.adminAuth.login(body.email, body.password, req.ip)
  }

  @Get('admins')
  @UseGuards(AdminJwtGuard, RolesGuard)
  @Roles('superadmin')
  listAdmins() {
    return this.adminAuth.listAdmins()
  }

  @Post('admins')
  @UseGuards(AdminJwtGuard, RolesGuard)
  @Roles('superadmin')
  createAdmin(
    @CurrentUser('sub') actorId: string,
    @Body() body: { email: string; password: string; fullName: string; role: 'admin' | 'superadmin' },
  ) {
    return this.adminAuth.createAdmin(actorId, body)
  }

  @Patch('admins/:id/toggle')
  @UseGuards(AdminJwtGuard, RolesGuard)
  @Roles('superadmin')
  toggleAdmin(
    @Param('id') id: string,
    @CurrentUser('sub') actorId: string,
    @Body() body: { status: 'active' | 'inactive' },
  ) {
    return this.adminAuth.toggleAdmin(id, actorId, body.status)
  }
}
