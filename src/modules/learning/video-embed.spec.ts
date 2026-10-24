import { describe, expect, it } from 'vitest';

import { embedUrlOf } from './video-embed';

const YOUTUBE = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ';

describe('embedUrlOf', () => {
  it.each([
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s',
    'https://m.youtube.com/watch?feature=share&v=dQw4w9WgXcQ',
    'http://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ?si=abc',
    'https://www.youtube.com/embed/dQw4w9WgXcQ',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube.com/live/dQw4w9WgXcQ',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    '  https://youtu.be/dQw4w9WgXcQ  ',
  ])('turns the YouTube address %s into the privacy embed', (url) => {
    expect(embedUrlOf(url)).toBe(YOUTUBE);
  });

  it.each([
    ['https://vimeo.com/76979871', 'https://player.vimeo.com/video/76979871?dnt=1'],
    ['https://www.vimeo.com/76979871', 'https://player.vimeo.com/video/76979871?dnt=1'],
    [
      'https://player.vimeo.com/video/76979871',
      'https://player.vimeo.com/video/76979871?dnt=1',
    ],
    [
      'https://vimeo.com/76979871/8272103f6e',
      'https://player.vimeo.com/video/76979871?h=8272103f6e&dnt=1',
    ],
    [
      'https://player.vimeo.com/video/76979871?h=8272103f6e',
      'https://player.vimeo.com/video/76979871?h=8272103f6e&dnt=1',
    ],
    [
      'https://vimeo.com/channels/staffpicks/76979871',
      'https://player.vimeo.com/video/76979871?dnt=1',
    ],
  ])('turns the Vimeo address %s into the do-not-track player', (url, embed) => {
    expect(embedUrlOf(url)).toBe(embed);
  });

  it.each([
    '',
    'not a url',
    'https://example.org/watch?v=dQw4w9WgXcQ',
    'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
    'https://evil.example/youtu.be/dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ"><script>',
    'https://www.youtube.com/channel/UC123',
    'https://www.youtube.com/playlist?list=PL123',
    'https://vimeo.com/about',
    'https://vimeo.com/76979871/not-a-hash!',
    'javascript:alert(1)//youtu.be/dQw4w9WgXcQ',
    'ftp://youtu.be/dQw4w9WgXcQ',
    'https://user:pass@youtu.be/dQw4w9WgXcQ',
  ])('refuses %s', (url) => {
    expect(embedUrlOf(url)).toBeNull();
  });
});
