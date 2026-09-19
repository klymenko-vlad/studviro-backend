import { InvalidInputError } from '../../common/errors/domain.error';
import type { LearningMaterialKind } from '../../database/schema';

export interface MaterialPayload {
  readonly kind: LearningMaterialKind;
  readonly body?: string | null;
  readonly url?: string | null;
  readonly storageKey?: string | null;
}

/**
 * Three kinds share one row, so the row alone cannot say which columns matter.
 * This is where a material of a kind is required to carry the one thing that
 * kind is made of, before anything is written.
 */
export function assertPayloadMatchesKind(input: MaterialPayload): void {
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
    case 'text': {
      if (!input.body?.trim()) {
        throw new InvalidInputError(
          'LEARNING_MATERIAL_BODY_MISSING',
          'A text material needs something to say',
        );
      }
    }
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
