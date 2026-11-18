const FACEBOOK_HOSTS = new Set(['facebook.com', 'www.facebook.com', 'm.facebook.com']);
const INSTAGRAM_HOSTS = new Set(['instagram.com', 'www.instagram.com']);

export function getSupportedSocialPage(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' || url.port || url.username || url.password) return null;

    if (FACEBOOK_HOSTS.has(url.hostname) && /^\/events\/\d+\/?$/.test(url.pathname)) {
      return 'facebook-event';
    }

    if (INSTAGRAM_HOSTS.has(url.hostname) && /^\/stories\/[^/]+\/\d+\/?$/.test(url.pathname)) {
      return 'instagram-story';
    }
  } catch {
    return null;
  }

  return null;
}

export function getCropPixels(rect, dpr, viewport, image, { maxAreaRatio = 1 } = {}) {
  if (!rect || !viewport || !image) return null;
  if (![rect.x, rect.y, rect.width, rect.height, dpr, viewport.width, viewport.height, image.width, image.height]
    .every(Number.isFinite)) return null;
  if (dpr < 0.5 || dpr > 4 || viewport.width <= 0 || viewport.height <= 0 ||
    image.width <= 0 || image.height <= 0 || rect.x < 0 || rect.y < 0 ||
    rect.width < 8 || rect.height < 8 ||
    rect.x + rect.width > viewport.width || rect.y + rect.height > viewport.height ||
    rect.width * rect.height > viewport.width * viewport.height * maxAreaRatio) return null;

  const sx = Math.round(rect.x * dpr);
  const sy = Math.round(rect.y * dpr);
  const sw = Math.round(rect.width * dpr);
  const sh = Math.round(rect.height * dpr);
  if (sw < 1 || sh < 1 || sx + sw > image.width || sy + sh > image.height) return null;
  return { sx, sy, sw, sh };
}

export function isSameCaptureTab(original, current) {
  return Boolean(original?.id && original.active && current?.active &&
    original.id === current.id && original.windowId === current.windowId &&
    original.url === current.url);
}
