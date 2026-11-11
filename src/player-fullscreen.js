/**
 * Try to keep the device in landscape while the embedded player iframe is fullscreen.
 * Browsers that do not support Screen Orientation locking simply keep their normal
 * fullscreen behavior; unsupported/rejected locks must never interrupt playback.
 */
export function attachFullscreenLandscapeLock(
  playerFrame,
  {
    documentRef = typeof document !== "undefined" ? document : null,
    screenRef = typeof screen !== "undefined" ? screen : null
  } = {}
) {
  if (!playerFrame || !documentRef || typeof documentRef.addEventListener !== "function") {
    return () => {};
  }

  const orientation = screenRef?.orientation;
  if (!orientation || typeof orientation.lock !== "function") return () => {};

  let pending = false;
  let locked = false;
  let disposed = false;

  const releaseOrientation = () => {
    try {
      if (typeof orientation.unlock === "function") orientation.unlock();
    } catch {}
    locked = false;
  };

  const onFullscreenChange = () => {
    const playerIsFullscreen = documentRef.fullscreenElement === playerFrame;

    if (!playerIsFullscreen) {
      if (locked || pending) releaseOrientation();
      return;
    }

    if (locked || pending || disposed) return;

    pending = true;
    try {
      // Called synchronously during fullscreenchange, immediately after the user's
      // fullscreen action. Mobile browsers commonly require an active fullscreen context.
      Promise.resolve(orientation.lock("landscape"))
        .then(() => {
          if (disposed || documentRef.fullscreenElement !== playerFrame) {
            releaseOrientation();
            return;
          }
          locked = true;
        })
        .catch(() => {
          // iOS Safari and some desktop browsers do not allow programmatic orientation lock.
        })
        .finally(() => {
          pending = false;
        });
    } catch {
      pending = false;
    }
  };

  documentRef.addEventListener("fullscreenchange", onFullscreenChange);

  return () => {
    disposed = true;
    documentRef.removeEventListener("fullscreenchange", onFullscreenChange);
    if (locked || pending) releaseOrientation();
  };
}
