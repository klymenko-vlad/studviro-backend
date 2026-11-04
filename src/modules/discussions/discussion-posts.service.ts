import { Injectable } from '@nestjs/common';

import { EntityNotFoundError } from '../../common/errors/domain.error';
import { encodeCursor } from '../../database/repository/cursor';
import type { DiscussionPost } from '../../database/schema';

import { DiscussionAccessService, type DiscussionCaller } from './discussion-access.service';
import {
  DiscussionAttachmentsService,
  type AttachmentView,
} from './discussion-attachments.service';
import {
  DiscussionPostsRepository,
  type PostPageQuery,
  type PostRow,
  type RowPage,
} from './discussion-posts.repository';
import {
  visiblePost,
  type DiscussionViewer,
  type PostState,
  type VisiblePost,
} from './discussion-visibility';
import { DiscussionsRepository } from './discussions.repository';

const EXCERPT_LENGTH = 200;

export interface QuoteView {
  readonly postId: string;
  readonly author: { id: string; displayName: string };
  readonly excerpt: string | null;
  readonly state: PostState;
}

export interface PostView extends VisiblePost {
  readonly id: string;
  readonly author: { id: string; displayName: string; isTeacher: boolean };
  readonly createdAt: Date;
  readonly editedAt: Date | null;
  readonly attachments: AttachmentView[];
  readonly parentPostId: string | null;
  readonly replyCount: number;
  readonly quote: QuoteView | null;
}

export interface PostPage {
  readonly items: PostView[];
  readonly hasNextPage: boolean;
  readonly nextCursor: string | null;
}

@Injectable()
export class DiscussionPostsService {
  constructor(
    private readonly access: DiscussionAccessService,
    private readonly threads: DiscussionsRepository,
    private readonly posts: DiscussionPostsRepository,
    private readonly attachments: DiscussionAttachmentsService,
  ) {}

  async topLevel(
    caller: DiscussionCaller,
    threadId: string,
    query: PostPageQuery,
  ): Promise<PostPage> {
    const viewer = await this.access.viewer(caller);
    const { thread } = await this.access.thread(caller, threadId, viewer);
    const found = await this.posts.topLevel(thread.id, viewer.moderates, query);

    return this.pageOf(caller.offeringId, viewer, found);
  }

  async replies(
    caller: DiscussionCaller,
    threadId: string,
    postId: string,
    query: PostPageQuery,
  ): Promise<PostPage> {
    const viewer = await this.access.viewer(caller);
    const { thread } = await this.access.thread(caller, threadId, viewer);
    const parent = await this.threads.findPost(thread.id, postId);
    if (parent?.parentPostId !== null) {
      throw new EntityNotFoundError('discussion post', postId);
    }

    return this.pageOf(caller.offeringId, viewer, await this.posts.replies(parent.id, query));
  }

  async one(offeringId: string, viewer: DiscussionViewer, postId: string): Promise<PostView> {
    const row = (await this.posts.byIds([postId])).get(postId);
    if (row === undefined) throw new EntityNotFoundError('discussion post', postId);

    const [view] = await this.viewsOf(offeringId, viewer, [{ ...row, replyCount: 0 }]);
    if (view === undefined) throw new EntityNotFoundError('discussion post', postId);

    return view;
  }

  private async pageOf(
    offeringId: string,
    viewer: DiscussionViewer,
    found: RowPage<PostRow & { replyCount?: number }>,
  ): Promise<PostPage> {
    const last = found.rows.at(-1)?.post;

    return {
      items: await this.viewsOf(offeringId, viewer, found.rows),
      hasNextPage: found.hasNextPage,
      nextCursor:
        found.hasNextPage && last ? encodeCursor({ value: last.createdAt, id: last.id }) : null,
    };
  }

  private async viewsOf(
    offeringId: string,
    viewer: DiscussionViewer,
    rows: readonly (PostRow & { replyCount?: number })[],
  ): Promise<PostView[]> {
    const quotedIds = rows.flatMap(({ post }) =>
      post.quotedPostId ? [post.quotedPostId] : [],
    );
    const [teachers, files, quoted] = await Promise.all([
      this.threads.teachersOf(offeringId),
      this.attachments.byPost(rows.map((row) => row.post.id)),
      this.posts.byIds(quotedIds),
    ]);

    return rows.map(({ post, authorName, replyCount }) => {
      const visible = visiblePost(post, viewer);
      const quote = post.quotedPostId ? quoted.get(post.quotedPostId) : undefined;

      return {
        id: post.id,
        author: {
          id: post.authorId,
          displayName: authorName,
          isTeacher: teachers.includes(post.authorId),
        },
        createdAt: post.createdAt,
        editedAt: post.deletedAt === null ? post.editedAt : null,
        attachments: visible.body === null ? [] : (files.get(post.id) ?? []),
        parentPostId: post.parentPostId,
        replyCount: replyCount ?? 0,
        quote: quote === undefined ? null : quoteOf(quote, viewer),
        ...visible,
      };
    });
  }
}

function quoteOf(
  { post, authorName }: { post: DiscussionPost; authorName: string },
  viewer: DiscussionViewer,
): QuoteView {
  const { body, state } = visiblePost(post, viewer);

  return {
    postId: post.id,
    author: { id: post.authorId, displayName: authorName },
    excerpt: body === null ? null : excerptOf(body),
    state,
  };
}

function excerptOf(body: string): string {
  const flat = body.replaceAll(/\s+/gu, ' ').trim();

  return flat.length <= EXCERPT_LENGTH
    ? flat
    : `${flat.slice(0, EXCERPT_LENGTH - 1).trimEnd()}…`;
}
