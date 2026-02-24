async function cropDataUrl(dataUrl, rect, dpr) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const imageBitmap = await createImageBitmap(blob);

  const scale = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const sx = Math.max(0, Math.round(rect.x * scale));
  const sy = Math.max(0, Math.round(rect.y * scale));
  const sw = Math.max(1, Math.round(rect.width * scale));
  const sh = Math.max(1, Math.round(rect.height * scale));

  const constrainedWidth = Math.min(sw, imageBitmap.width - sx);
  const constrainedHeight = Math.min(sh, imageBitmap.height - sy);

  const canvas = new OffscreenCanvas(constrainedWidth, constrainedHeight);
  const context = canvas.getContext('2d');

  context.drawImage(
    imageBitmap,
    sx,
    sy,
    constrainedWidth,
    constrainedHeight,
    0,
    0,
    constrainedWidth,
    constrainedHeight
  );

  const outputBlob = await canvas.convertToBlob({ type: 'image/png' });
  const buffer = await outputBlob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';

  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }

  return `data:image/png;base64,${btoa(binary)}`;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'AREA_SELECTED') {
    const windowId = sender?.tab?.windowId;
    const rect = message.rect;
    const dpr = message.devicePixelRatio;

    chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, async (dataUrl) => {
      try {
        if (chrome.runtime.lastError || !dataUrl) {
          sendResponse({
            ok: false,
            error: chrome.runtime.lastError?.message || 'Impossibile catturare screenshot.'
          });
          return;
        }

        const croppedDataUrl = await cropDataUrl(dataUrl, rect, dpr);
        await chrome.storage.local.set({
          lastCaptureDataUrl: croppedDataUrl,
          lastCaptureAt: Date.now()
        });

        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Errore durante il ritaglio screenshot.'
        });
      }
    });

    return true;
  }

  if (message?.type === 'GET_LAST_CAPTURE') {
    chrome.storage.local.get(['lastCaptureDataUrl', 'lastCaptureAt'], (result) => {
      sendResponse({
        ok: true,
        dataUrl: result.lastCaptureDataUrl || null,
        capturedAt: result.lastCaptureAt || null
      });
    });
    return true;
  }

  if (message?.type === 'CLEAR_LAST_CAPTURE') {
    chrome.storage.local.remove(['lastCaptureDataUrl', 'lastCaptureAt'], () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  return false;
});
