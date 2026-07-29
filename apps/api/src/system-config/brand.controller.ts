import { Controller, Get } from '@nestjs/common'
import { SystemConfigService } from './system-config.service'

@Controller('brand')
export class BrandController {
  constructor(private systemConfig: SystemConfigService) {}

  @Get()
  getBrand() {
    return this.systemConfig.getBrandConfig()
  }
}
