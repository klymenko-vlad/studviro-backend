import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import { SearchQueryDto, SearchResultsDto } from './dto/search.dto';
import { SearchService } from './search.service';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('search')
@ApiBearerAuth('access-token')
@Controller({ path: 'institutions/:institutionId/search', version: '1' })
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  @RequirePermission('institution:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'search',
    summary: 'Search everything the caller may see',
    description:
      'Permission decides what is searched rather than what is filtered afterwards, so a kind the caller cannot read is never queried and an empty result cannot be read as proof that something does not exist.',
  })
  @ApiOkResponse({ type: SearchResultsDto })
  @ApiErrorResponses({ notFound: true })
  async find(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Query() query: SearchQueryDto,
    @CurrentUser('id') userId: string,
  ): Promise<SearchResultsDto> {
    return SearchResultsDto.from(await this.search.search(institutionId, userId, query.q));
  }
}
