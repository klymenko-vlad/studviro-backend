import { InvalidInputError } from '../../common/errors/domain.error';
import type { CompletionRule, LearningMaterialKind } from '../../database/schema';

import { embedUrlOf } from './video-embed';

export interface MaterialPayload {
  readonly kind: LearningMaterialKind;
  readonly title?: string | null;
  readonly body?: string | null;
  readonly url?: string | null;
  readonly storageKey?: string | null;
  readonly completionRule?: CompletionRule;
}

const BODY_LIMITS: Partial<Record<LearningMaterialKind, number>> = {
  text: 20_000,
  page: 100_000,
  label: 1000,
};

export function assertPayloadMatchesKind(input: MaterialPayload): void {
  if (input.kind !== 'label' && !input.title?.trim()) {
    throw new InvalidInputError('LEARNING_MATERIAL_TITLE_MISSING', 'A material needs a title');
  }

  switch (input.kind) {
    case 'file': {
      if (!input.storageKey) {
        throw new InvalidInputError(
          'LEARNING_MATERIAL_FILE_MISSING',
          'A file material needs the key of an uploaded object',
        );
      }

      return;
    }
    case 'link': {
      if (!isHttpUrl(input.url)) {
        throw new InvalidInputError(
          'LEARNING_MATERIAL_URL_INVALID',
          'A link material needs an http or https address',
        );
      }

      return;
    }
    case 'video': {
      if (!input.url || embedUrlOf(input.url) === null) {
        throw new InvalidInputError(
          'LEARNING_MATERIAL_VIDEO_UNSUPPORTED',
          'A video must be a YouTube or Vimeo address',
        );
      }

      return;
    }
    case 'label': {
      if ((input.completionRule ?? 'none') !== 'none') {
        throw new InvalidInputError(
          'COMPLETION_RULE_NOT_APPLICABLE',
          'A label cannot be completed',
          { kind: 'label', rule: input.completionRule },
        );
      }
      assertBody(input.kind, input.body);

      return;
    }
    case 'text':
    case 'page': {
      assertBody(input.kind, input.body);

      return;
    }
    case 'folder': {
      return;
    }
  }
}

function assertBody(kind: LearningMaterialKind, body: string | null | undefined): void {
  if (!body?.trim()) {
    throw new InvalidInputError(
      'LEARNING_MATERIAL_BODY_MISSING',
      'This material needs something to say',
    );
  }

  const limit = BODY_LIMITS[kind];
  if (limit !== undefined && body.length > limit) {
    throw new InvalidInputError(
      'LEARNING_MATERIAL_BODY_TOO_LONG',
      `This material can hold at most ${limit} characters`,
      { limit },
    );
  }
}

function isHttpUrl(value: string | null | undefined): boolean {
  if (!value) return false;

  try {
    const url = new URL(value);

    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
