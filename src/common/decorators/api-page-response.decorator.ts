import { applyDecorators, type Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, ApiProperty } from '@nestjs/swagger';

import { PageMetaDto } from '../dto/pagination.dto';

/** Cached so repeated calls for the same model reuse one schema name. */
const pageDtoCache = new WeakMap<Type<unknown>, Type<unknown>>();

/**
 * Builds a *named* page schema per model — `UserResponseDtoPage` rather than an
 * anonymous `allOf`. Generated clients turn a named schema into a real type with
 * required fields; an `allOf` composition becomes an intersection whose members
 * are all optional, which is how `items` ends up possibly-undefined on the
 * frontend even though the server always sends it.
 */
export function PageDtoOf<T>(model: Type<T>): Type<{ items: T[]; meta: PageMetaDto }> {
  const cached = pageDtoCache.get(model);
  if (cached) {
    return cached as Type<{ items: T[]; meta: PageMetaDto }>;
  }

  class PageOf {
    @ApiProperty({ type: model, isArray: true })
    items!: T[];

    @ApiProperty({ type: PageMetaDto })
    meta!: PageMetaDto;
  }

  // The class name becomes the schema name in the document, so it has to be
  // unique per model and stable across runs.
  Object.defineProperty(PageOf, 'name', { value: `${model.name}Page` });

  pageDtoCache.set(model, PageOf);
  return PageOf;
}

export function ApiPageResponse<T>(model: Type<T>) {
  const pageDto = PageDtoOf(model);

  return applyDecorators(
    ApiExtraModels(PageMetaDto, model, pageDto),
    ApiOkResponse({ type: pageDto }),
  );
}
