import { describe, expect, it } from 'vitest';

import { visiblePost, type PostVisibilityInput } from './discussion-visibility';

const post: PostVisibilityInput = {
  authorId: 'author',
  body: 'What does question 3 mean by stable?',
  hiddenAt: null,
  deletedAt: null,
};

describe('visiblePost', () => {
  it('shows an ordinary post to everyone in the course', () => {
    expect(visiblePost(post, { userId: 'classmate', moderates: false })).toEqual({
      body: post.body,
      state: 'visible',
      mine: false,
    });
  });

  it('marks the reader’s own post as theirs', () => {
    expect(visiblePost(post, { userId: 'author', moderates: false }).mine).toBe(true);
  });

  it('withholds a hidden post from students, its author included', () => {
    const hidden = { ...post, hiddenAt: new Date() };

    expect(visiblePost(hidden, { userId: 'classmate', moderates: false })).toMatchObject({
      body: null,
      state: 'hidden',
    });
    expect(visiblePost(hidden, { userId: 'author', moderates: false }).body).toBeNull();
  });

  it('still shows a hidden post to whoever moderates, so it can be restored', () => {
    const hidden = { ...post, hiddenAt: new Date() };

    expect(visiblePost(hidden, { userId: 'teacher', moderates: true })).toMatchObject({
      body: post.body,
      state: 'hidden',
    });
  });

  it('shows nobody a deleted post, not even a moderator', () => {
    const deleted = { ...post, deletedAt: new Date(), hiddenAt: new Date() };

    expect(visiblePost(deleted, { userId: 'teacher', moderates: true })).toMatchObject({
      body: null,
      state: 'deleted',
    });
  });
});
