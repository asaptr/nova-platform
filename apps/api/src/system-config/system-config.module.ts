import { Module } from '@nestjs/common'
import { SystemConfigService } from './system-config.service'
import { BrandController } from './brand.controller'

@Module({
  providers: [SystemConfigService],
  controllers: [BrandController],
  exports: [SystemConfigService],
})
export class SystemConfigModule {}
