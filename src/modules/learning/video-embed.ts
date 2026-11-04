const YOUTUBE_ID = /^[\w-]{11}$/u;
const VIMEO_ID = /^\d{1,12}$/u;
const VIMEO_HASH = /^[\da-f]{1,32}$/u;

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);
const YOUTUBE_NOCOOKIE_HOSTS = new Set(['youtube-nocookie.com', 'www.youtube-nocookie.com']);
const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com']);

export function embedUrlOf(address: string): string | null {
  const url = parsed(address.trim());
  if (url === null) return null;

  return youtubeEmbed(url) ?? vimeoEmbed(url);
}

function parsed(address: string): URL | null {
  try {
    const url = new URL(address);
    const plain =
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      url.username === '' &&
      url.password === '';

    return plain ? url : null;
  } catch {
    return null;
  }
}

function youtubeEmbed(url: URL): string | null {
  const id = youtubeId(url);

  return id !== null && YOUTUBE_ID.test(id)
    ? `https://www.youtube-nocookie.com/embed/${id}`
    : null;
}

function youtubeId(url: URL): string | null {
  const [first, second] = url.pathname.split('/').filter(Boolean);
  if (url.hostname === 'youtu.be') return first ?? null;
  if (YOUTUBE_NOCOOKIE_HOSTS.has(url.hostname))
    return first === 'embed' ? (second ?? null) : null;
  if (!YOUTUBE_HOSTS.has(url.hostname)) return null;
  if (first === 'watch') return url.searchParams.get('v');

  return first === 'embed' || first === 'shorts' || first === 'live' ? (second ?? null) : null;
}

function vimeoEmbed(url: URL): string | null {
  const found = vimeoVideo(url);
  if (found === null || !VIMEO_ID.test(found.id)) return null;
  if (found.hash !== null && !VIMEO_HASH.test(found.hash)) return null;

  const query = found.hash === null ? 'dnt=1' : `h=${found.hash}&dnt=1`;

  return `https://player.vimeo.com/video/${found.id}?${query}`;
}

function vimeoVideo(url: URL): { id: string; hash: string | null } | null {
  const parts = url.pathname.split('/').filter(Boolean);

  if (url.hostname === 'player.vimeo.com') {
    return parts.length === 2 && parts[0] === 'video'
      ? { id: parts[1] ?? '', hash: url.searchParams.get('h') }
      : null;
  }
  if (!VIMEO_HOSTS.has(url.hostname)) return null;

  if (parts[0] === 'channels' && parts.length === 3) return { id: parts[2] ?? '', hash: null };
  if (parts.length === 1) return { id: parts[0] ?? '', hash: null };
  if (parts.length === 2) return { id: parts[0] ?? '', hash: parts[1] ?? null };

  return null;
}
