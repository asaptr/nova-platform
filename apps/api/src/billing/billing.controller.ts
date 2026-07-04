import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { BillingService } from './billing.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CurrentUser } from '../common/decorators/current-user.decorator'

@Controller('billing')
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(private billing: BillingService) {}

  @Get('transactions')
  transactions(
    @CurrentUser('sub') userId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('type') type?: string,
  ) {
    return this.billing.getTransactions(userId, +page, +limit, type)
  }

  @Get('usage')
  usage(
    @CurrentUser('sub') userId: string,
    @Query('vmId') vmId?: string,
  ) {
    return this.billing.getBillingUsage(userId, vmId)
  }
}
