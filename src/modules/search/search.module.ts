import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../authorization/authorization.module';

import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [AuthorizationModule],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
