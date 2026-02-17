import { Module } from '@nestjs/common';
import { LinksController } from './links.controller';
import { LinksService } from './links.service';
import { FraudModule } from '../fraud/fraud.module';

@Module({
  imports: [FraudModule],
  controllers: [LinksController],
  providers: [LinksService],
})
export class LinksModule {}
