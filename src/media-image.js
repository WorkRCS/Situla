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
