export const POST_STATES = ['visible', 'hidden', 'deleted'] as const;
export type PostState = (typeof POST_STATES)[number];

export interface PostVisibilityInput {
  readonly authorId: string;
  readonly body: string;
  readonly hiddenAt: Date | null;
  readonly deletedAt: Date | null;
}

export interface DiscussionViewer {
  readonly userId: string;
  readonly moderates: boolean;
}

export interface VisiblePost {
  readonly body: string | null;
  readonly state: PostState;
  readonly mine: boolean;
}

/**
 * A removed post keeps its place in the conversation, so the replies around it
 * still read in order, but its text goes to nobody: deleted is gone, and
 * hidden is withheld from everyone except the people who can restore it.
 */
export function visiblePost(post: PostVisibilityInput, viewer: DiscussionViewer): VisiblePost {
  const mine = post.authorId === viewer.userId;

  if (post.deletedAt !== null) return { body: null, state: 'deleted', mine };
  if (post.hiddenAt !== null) {
    return { body: viewer.moderates ? post.body : null, state: 'hidden', mine };
  }

  return { body: post.body, state: 'visible', mine };
}
