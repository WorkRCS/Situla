const LOCAL_BASE = "https://situla.invalid";

export function getIframePreconnectTarget(src) {
  if (typeof src !== "string" || !src.trim()) return null;
  try {
    const url = new URL(src.trim(), LOCAL_BASE);
    if (!["http:", "https:"].includes(url.protocol) || url.origin === LOCAL_BASE) return null;
    return Object.freeze({ origin: url.origin, hostname: url.hostname });
  } catch {
    return null;
  }
}
