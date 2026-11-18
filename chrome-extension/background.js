import { getCropPixels, getSupportedSocialPage, isSameCaptureTab } from './social-import-utils.mjs';

const SOCIAL_CAPTURE_MAX_BYTES = 1_500_000;
const SOCIAL_CAPTURE_KEYS = ['lastSocialCaptureDataUrl', 'lastSocialCaptureAt', 'lastSocialCaptureError'];

function getActiveTab(windowId) {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, windowId }, (tabs) => resolve(tabs[0] || null));
  });
}

function getTab(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.get(tabId, (tab) => resolve(chrome.runtime.lastError ? null : tab));
  });
}

function captureVisibleTab(windowId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError || !dataUrl) {
        reject(new Error(chrome.runtime.lastError?.message || 'Impossibile catturare screenshot.'));
        return;
      }
      resolve(dataUrl);
    });
  });
}

async function cropDataUrl(dataUrl, rect, dpr, viewport, purpose) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const imageBitmap = await createImageBitmap(blob);
  const pixels = getCropPixels(rect, dpr, viewport, {
    width: imageBitmap.width,
    height: imageBitmap.height,
  }, { maxAreaRatio: purpose === 'social-story' ? 0.85 : 1 });
  if (!pixels) {
    imageBitmap.close();
    throw new Error('Ritaglio non valido o fuori dai limiti dello screenshot.');
  }

  const canvas = new OffscreenCanvas(pixels.sw, pixels.sh);
  const context = canvas.getContext('2d');
  if (!context) {
    imageBitmap.close();
    throw new Error('Impossibile elaborare il ritaglio.');
  }
  context.drawImage(
    imageBitmap,
    pixels.sx,
    pixels.sy,
    pixels.sw,
    pixels.sh,
    0,
    0,
    pixels.sw,
    pixels.sh
  );
  imageBitmap.close();

  const outputBlob = await canvas.convertToBlob({ type: 'image/png' });
  if (purpose === 'social-story' && outputBlob.size > SOCIAL_CAPTURE_MAX_BYTES) {
    throw new Error('Area troppo grande. Seleziona un ritaglio più piccolo.');
  }
  const bytes = new Uint8Array(await outputBlob.arrayBuffer());
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return `data:image/png;base64,${btoa(binary)}`;
}

async function handleAreaSelected(message, sender) {
  const tabId = sender?.tab?.id;
  const windowId = sender?.tab?.windowId;
  if (!Number.isInteger(tabId) || !Number.isInteger(windowId) || !sender.tab.url) {
    throw new Error('Scheda di acquisizione non valida.');
  }

  const purpose = message.purpose === 'social-story' ? 'social-story' : 'general';
  const original = { id: tabId, windowId, url: sender.tab.url, active: true };
  const currentTab = await getTab(tabId);
  const activeTab = await getActiveTab(windowId);
  if (!isSameCaptureTab(original, currentTab) || !isSameCaptureTab(original, activeTab)) {
    throw new Error('La scheda è cambiata. Riapri la story e ripeti il ritaglio.');
  }
  if (purpose === 'social-story' &&
    (currentTab.url !== message.expectedUrl || getSupportedSocialPage(currentTab.url) !== 'instagram-story')) {
    throw new Error('Apri una story Instagram valida prima di catturare il ritaglio.');
  }

  const dataUrl = await captureVisibleTab(windowId);
  const [tabAfterCapture, activeAfterCapture] = await Promise.all([
    getTab(tabId),
    getActiveTab(windowId),
  ]);
  if (!isSameCaptureTab(original, tabAfterCapture) || !isSameCaptureTab(original, activeAfterCapture)) {
    throw new Error('La scheda è cambiata durante la cattura. Nessun ritaglio è stato conservato.');
  }

  const croppedDataUrl = await cropDataUrl(
    dataUrl,
    message.rect,
    message.devicePixelRatio,
    message.viewport,
    purpose,
  );
  if (purpose === 'social-story') {
    await chrome.storage.session.set({
      lastSocialCaptureDataUrl: croppedDataUrl,
      lastSocialCaptureAt: Date.now(),
    });
  } else {
    await chrome.storage.local.set({
      lastCaptureDataUrl: croppedDataUrl,
      lastCaptureAt: Date.now(),
    });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'AREA_SELECTED') {
    handleAreaSelected(message, sender)
      .then(() => sendResponse({ ok: true }))
      .catch(async (error) => {
        if (message.purpose === 'social-story') {
          await chrome.storage.session.set({
            lastSocialCaptureError: 'Ritaglio non completato. Verifica che la story sia attiva nella stessa scheda e riprova.',
          }).catch(() => undefined);
        }
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Errore durante il ritaglio screenshot.',
        });
      });
    return true;
  }

  if (message?.type === 'GET_LAST_CAPTURE') {
    chrome.storage.local.get(['lastCaptureDataUrl', 'lastCaptureAt'], (result) => {
      sendResponse({
        ok: true,
        dataUrl: result.lastCaptureDataUrl || null,
        capturedAt: result.lastCaptureAt || null,
      });
    });
    return true;
  }

  if (message?.type === 'GET_LAST_SOCIAL_CAPTURE') {
    chrome.storage.session.get(SOCIAL_CAPTURE_KEYS).then(async (result) => {
      await chrome.storage.session.remove(SOCIAL_CAPTURE_KEYS);
      sendResponse({
        ok: true,
        dataUrl: result.lastSocialCaptureAt && Date.now() - result.lastSocialCaptureAt < 120_000
          ? result.lastSocialCaptureDataUrl || null
          : null,
        error: result.lastSocialCaptureError || null,
      });
    }).catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message?.type === 'CLEAR_LAST_CAPTURE') {
    chrome.storage.local.remove(['lastCaptureDataUrl', 'lastCaptureAt'], () => {
      sendResponse({ ok: true });
    });
    chrome.storage.session.remove(SOCIAL_CAPTURE_KEYS).catch(() => undefined);
    return true;
  }

  if (message?.type === 'CLEAR_SOCIAL_CAPTURE') {
    chrome.storage.session.remove(SOCIAL_CAPTURE_KEYS)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  return false;
});
