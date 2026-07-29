import { Module } from '@nestjs/common'
import { SystemConfigService } from './system-config.service'
import { BrandController } from './brand.controller'
import { SetupController } from './setup.controller'

@Module({
  providers: [SystemConfigService],
  controllers: [BrandController, SetupController],
  exports: [SystemConfigService],
})
export class SystemConfigModule {}
