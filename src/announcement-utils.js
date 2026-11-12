export function parseAnnouncementDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getAnnouncementStatus(status, scheduledAt, now = new Date()) {
  if (status === 'draft') return 'draft';
  if (status !== 'publish') return null;
  const date = parseAnnouncementDate(scheduledAt);
  if (!date) return null;
  return date.getTime() > now.getTime() ? 'scheduled' : 'published';
}

export function resolveAnnouncementMedia(mediaUrl = '', uploadedImageUrl = '') {
  if (uploadedImageUrl) return { type: 'image', src: uploadedImageUrl };
  const raw = String(mediaUrl || '').trim();
  if (!raw) return null;
  let url;
  try {
    url = new URL(raw);
    if (url.protocol !== 'https:') return null;
  } catch {
    return null;
  }
  if (/\.(?:avif|gif|jpe?g|png|webp)(?:$|\?)/i.test(url.pathname + url.search)) {
    return { type: 'image', src: url.href };
  }
  const host = url.hostname.toLowerCase();
  if (host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com') ||
      host === 'youtube-nocookie.com' || host.endsWith('.youtube-nocookie.com')) {
    const videoId = host === 'youtu.be'
      ? url.pathname.split('/').filter(Boolean)[0]
      : url.pathname.includes('/embed/')
        ? url.pathname.split('/embed/')[1]?.split('/')[0]
        : url.searchParams.get('v');
    if (videoId && /^[a-zA-Z0-9_-]{6,20}$/.test(videoId)) {
      return { type: 'iframe', src: 'https://www.youtube-nocookie.com/embed/' + videoId };
    }
  }
  if (host === 'vimeo.com' || host.endsWith('.vimeo.com')) {
    const videoId = url.pathname.split('/').filter(Boolean).find((part) => /^\d{5,15}$/.test(part));
    if (videoId) return { type: 'iframe', src: 'https://player.vimeo.com/video/' + videoId };
  }
  return { type: 'link', src: url.href };
}
