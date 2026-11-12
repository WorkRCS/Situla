const TMDB_IMAGE_HOST = "image.tmdb.org";
const TMDB_SIZE_PATTERN = /^w(\d+)$/;

export function optimizeTmdbImageUrl(value, targetSize = "w185") {
  if (typeof value !== "string" || !/^w\d+$/.test(targetSize)) return value;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== TMDB_IMAGE_HOST) return value;
    const segments = url.pathname.split("/");
    const sizeIndex = segments.findIndex((segment) => segment === "original" || TMDB_SIZE_PATTERN.test(segment));
    if (sizeIndex < 0) return value;

    const currentSize = segments[sizeIndex];
    const currentWidth = TMDB_SIZE_PATTERN.exec(currentSize)?.[1];
    const targetWidth = Number(targetSize.slice(1));
    if (currentSize !== "original" && Number(currentWidth) <= targetWidth) return value;

    segments[sizeIndex] = targetSize;
    url.pathname = segments.join("/");
    return url.toString();
  } catch {
    return value;
  }
}


const SHARE_POSTER_HOSTS = new Set([
  "image.tmdb.org",
  "cdn.myanimelist.net",
  "m.media-amazon.com",
  "images.metahub.space",
  "static.tvmaze.com",
  "is1-ssl.mzstatic.com"
]);

export const SHARE_POSTER_MAX_BYTES = 8 * 1024 * 1024;

/**
 * Only allow the known public image CDNs used by the Movie, TV, and Anime
 * catalogue. This URL is fetched server-side by the same-origin share endpoint.
 */
export function normalizeSharePosterUrl(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    if (!SHARE_POSTER_HOSTS.has(url.hostname.toLowerCase())) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

/** Return a safe, supported image MIME type by inspecting its file signature. */
export function detectSharePosterMimeType(value) {
  if (!(value instanceof Uint8Array) || value.byteLength < 12) return null;
  const bytes = value;
  const ascii = (start, end) => String.fromCharCode(...bytes.subarray(start, end));

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (ascii(0, 8) === "\\x89PNG\\r\\n\\x1a\\n") return "image/png";
  if (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a") return "image/gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(4, 8) === "ftyp" && ["avif", "avis"].includes(ascii(8, 12))) return "image/avif";
  return null;
}
