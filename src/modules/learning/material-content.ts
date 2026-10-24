import type { LearningMaterialKind } from '../../database/schema';

import { embedUrlOf } from './video-embed';

const LABEL_TITLE_LENGTH = 80;
const KINDS_WITH_BODY: readonly LearningMaterialKind[] = ['text', 'page', 'label'];

export interface ContentInput {
  readonly title?: string | null;
  readonly body?: string | null;
  readonly url?: string | null;
}

export interface ContentColumns {
  title?: string;
  body?: string | null;
  url?: string | null;
}

export function contentColumns(
  kind: LearningMaterialKind,
  input: ContentInput,
): ContentColumns {
  const columns: ContentColumns = {};

  if (kind === 'label') {
    if (typeof input.body === 'string') columns.title = labelTitleOf(input.body);
  } else if (typeof input.title === 'string') {
    columns.title = input.title;
  }

  if (KINDS_WITH_BODY.includes(kind) && input.body !== undefined) columns.body = input.body;
  if (kind === 'link' && input.url !== undefined) columns.url = input.url;
  if (kind === 'video' && input.url !== undefined) {
    columns.url = input.url === null ? null : embedUrlOf(input.url);
  }

  return columns;
}

export function labelTitleOf(body: string): string {
  const line =
    body
      .split('\n')
      .map((part) => part.replaceAll(/\s+/gu, ' ').trim())
      .find(Boolean) ?? '';

  return line.length <= LABEL_TITLE_LENGTH
    ? line
    : `${line.slice(0, LABEL_TITLE_LENGTH - 1).trimEnd()}…`;
}
