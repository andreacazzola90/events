const PRODUCTION_BASE_URL = 'https://events-scanner.vercel.app';
const LOCAL_BASE_URL = 'http://localhost:3000';

const state = {
  baseUrl: PRODUCTION_BASE_URL,
  auth: null,
  imageBlob: null,
  imageDataUrl: null,
  parsedEvents: [],
  selectedEventIndex: 0,
  debugRawText: ''
};

const elements = {
  email: document.getElementById('email'),
  password: document.getElementById('password'),
  loginBtn: document.getElementById('loginBtn'),
  logoutBtn: document.getElementById('logoutBtn'),
  userStatus: document.getElementById('userStatus'),
  imageInput: document.getElementById('imageInput'),
  captureBtn: document.getElementById('captureBtn'),
  clearCaptureBtn: document.getElementById('clearCaptureBtn'),
  preview: document.getElementById('preview'),
  processBtn: document.getElementById('processBtn'),
  processStatus: document.getElementById('processStatus'),
  eventSection: document.getElementById('eventSection'),
  eventSelector: document.getElementById('eventSelector'),
  title: document.getElementById('title'),
  description: document.getElementById('description'),
  date: document.getElementById('date'),
  time: document.getElementById('time'),
  location: document.getElementById('location'),
  organizer: document.getElementById('organizer'),
  category: document.getElementById('category'),
  price: document.getElementById('price'),
  sourceUrl: document.getElementById('sourceUrl'),
  createBtn: document.getElementById('createBtn'),
  createStatus: document.getElementById('createStatus')
};

function setStatus(target, text, type = 'muted') {
  target.textContent = text;
  target.className = `status ${type}`;
}

function getAuthHeader() {
  if (!state.auth?.email || !state.auth?.password) {
    return null;
  }

  const encoded = btoa(`${state.auth.email}:${state.auth.password}`);
  return `Basic ${encoded}`;
}

function buildApiUrl(path) {
  return `${state.baseUrl}${path}`;
}

async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  return response.blob();
}

async function blobToDataUrl(blob) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Impossibile leggere immagine.'));
    reader.readAsDataURL(blob);
  });
}

function applyEventToForm(event) {
  elements.title.value = event.title || '';
  elements.description.value = event.description || '';
  elements.date.value = event.date || '';
  elements.time.value = event.time || '';
  elements.location.value = event.location || '';
  elements.organizer.value = event.organizer || '';
  elements.category.value = event.category || '';
  elements.price.value = event.price || '';
  elements.sourceUrl.value = event.sourceUrl || '';
}

function refreshEventSelector() {
  elements.eventSelector.innerHTML = '';

  state.parsedEvents.forEach((event, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = `${index + 1}. ${event.title || 'Evento senza titolo'}`;
    elements.eventSelector.appendChild(option);
  });

  elements.eventSelector.value = String(state.selectedEventIndex);
}

function setImagePreview(dataUrl) {
  state.imageDataUrl = dataUrl;
  if (!dataUrl) {
    elements.preview.hidden = true;
    elements.preview.removeAttribute('src');
    return;
  }

  elements.preview.hidden = false;
  elements.preview.src = dataUrl;
}

async function saveState() {
  await chrome.storage.local.set({
    extensionAuth: state.auth,
    extensionBaseUrl: state.baseUrl
  });
}

async function loadSavedSettings() {
  const result = await chrome.storage.local.get(['extensionAuth', 'extensionBaseUrl']);
  const savedBaseUrl = typeof result.extensionBaseUrl === 'string' ? result.extensionBaseUrl.trim() : '';
  state.baseUrl = savedBaseUrl || PRODUCTION_BASE_URL;
  state.auth = result.extensionAuth || null;

  if (state.auth?.email) {
    setStatus(elements.userStatus, `Loggato come ${state.auth.email}`, 'success');
    elements.email.value = state.auth.email;
  }
}

async function loadLatestCapture() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_LAST_CAPTURE' });
  if (!response?.ok || !response?.dataUrl) {
    return;
  }

  const blob = await dataUrlToBlob(response.dataUrl);
  state.imageBlob = blob;
  setImagePreview(response.dataUrl);
  setStatus(elements.processStatus, 'Screenshot area caricato.', 'success');
}

function getBaseUrlCandidates(preferredBaseUrls = []) {
  const candidates = [...preferredBaseUrls, state.baseUrl, LOCAL_BASE_URL, PRODUCTION_BASE_URL]
    .map((value) => (value || '').trim())
    .filter(Boolean);

  return [...new Set(candidates)];
}

async function fetchWithBaseUrlFallback(path, requestInit, options = {}) {
  const preferredBaseUrls = Array.isArray(options.preferredBaseUrls) ? options.preferredBaseUrls : [];
  const persistSuccessfulBaseUrl = options.persistSuccessfulBaseUrl !== false;
  const candidates = getBaseUrlCandidates(preferredBaseUrls);
  let lastResponse = null;
  let lastError = null;

  for (const candidateBaseUrl of candidates) {
    try {
      const response = await fetch(`${candidateBaseUrl}${path}`, requestInit);

      if (response.ok) {
        if (persistSuccessfulBaseUrl && state.baseUrl !== candidateBaseUrl) {
          state.baseUrl = candidateBaseUrl;
          await saveState();
        }
        return response;
      }

      lastResponse = response;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastResponse) {
    return lastResponse;
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error('Impossibile contattare il backend.');
}

async function login() {
  const email = elements.email.value.trim().toLowerCase();
  const password = elements.password.value;

  if (!email || !password) {
    setStatus(elements.userStatus, 'Inserisci email e password.', 'error');
    return;
  }

  setStatus(elements.userStatus, 'Login in corso...', 'muted');

  try {
    const response = await fetchWithBaseUrlFallback('/api/auth/extension-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || 'Login fallito.');
    }

    state.auth = { email, password };
    await saveState();
    setStatus(elements.userStatus, `Loggato come ${email}`, 'success');
  } catch (error) {
    setStatus(elements.userStatus, error instanceof Error ? error.message : 'Login fallito.', 'error');
  }
}

async function logout() {
  state.auth = null;
  elements.password.value = '';
  await saveState();
  setStatus(elements.userStatus, 'Non autenticato', 'muted');
}

async function handleImageUpload(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  state.imageBlob = file;
  const dataUrl = await blobToDataUrl(file);
  setImagePreview(dataUrl);
  setStatus(elements.processStatus, 'Immagine caricata.', 'success');
}

async function startAreaSelection() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) {
    setStatus(elements.processStatus, 'Tab attiva non trovata.', 'error');
    return;
  }

  if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
    setStatus(elements.processStatus, 'Apri un sito web normale per usare lo screenshot.', 'error');
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content-script.js']
    });

    await chrome.tabs.sendMessage(tab.id, { type: 'START_AREA_SELECTION' });
    setStatus(elements.processStatus, 'Seleziona un\'area nella pagina, poi riapri il popup.', 'success');
    setTimeout(() => window.close(), 350);
  } catch (error) {
    setStatus(
      elements.processStatus,
      error instanceof Error ? error.message : 'Impossibile avviare la selezione area.',
      'error'
    );
  }
}

async function clearCurrentImage() {
  state.imageBlob = null;
  setImagePreview(null);
  await chrome.runtime.sendMessage({ type: 'CLEAR_LAST_CAPTURE' });
  setStatus(elements.processStatus, 'Immagine rimossa.', 'muted');
}

async function processImage() {
  if (!state.imageBlob) {
    setStatus(elements.processStatus, 'Carica un\'immagine o cattura una zona della pagina.', 'error');
    return;
  }

  setStatus(elements.processStatus, 'Estrazione in corso...', 'muted');

  try {
    const formData = new FormData();
    formData.append('image', state.imageBlob, 'event-image.png');

    const headers = {};
    const authHeader = getAuthHeader();
    if (authHeader) {
      headers.Authorization = authHeader;
    }

    const response = await fetchWithBaseUrlFallback('/api/process-image', {
      method: 'POST',
      headers,
      body: formData
    }, {
      preferredBaseUrls: [PRODUCTION_BASE_URL],
      persistSuccessfulBaseUrl: false
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || 'Elaborazione immagine fallita.');
    }

    const events = Array.isArray(data?.events) ? data.events : [];
    if (events.length === 0) {
      throw new Error('Nessun evento trovato nell\'immagine.');
    }

    state.parsedEvents = events;
    state.selectedEventIndex = 0;
    state.debugRawText = data?.debug?.ocrRaw || '';

    refreshEventSelector();
    applyEventToForm(state.parsedEvents[0]);

    elements.eventSection.hidden = false;
    setStatus(elements.processStatus, `Trovati ${events.length} evento/i.`, 'success');
  } catch (error) {
    setStatus(elements.processStatus, error instanceof Error ? error.message : 'Errore OCR.', 'error');
  }
}

function getEventFromForm() {
  return {
    title: elements.title.value.trim(),
    description: elements.description.value.trim(),
    date: elements.date.value.trim(),
    time: elements.time.value.trim(),
    location: elements.location.value.trim(),
    organizer: elements.organizer.value.trim(),
    category: elements.category.value.trim() || 'other',
    price: elements.price.value.trim(),
    sourceUrl: elements.sourceUrl.value.trim(),
    rawText: state.debugRawText || ''
  };
}

async function createEvent() {
  const eventPayload = getEventFromForm();

  if (!eventPayload.title || !eventPayload.date || !eventPayload.location) {
    setStatus(elements.createStatus, 'Titolo, data e luogo sono obbligatori.', 'error');
    return;
  }

  setStatus(elements.createStatus, 'Creazione evento...', 'muted');

  try {
    const headers = {};
    const authHeader = getAuthHeader();
    if (authHeader) {
      headers.Authorization = authHeader;
    }

    let response;
    if (state.imageBlob) {
      const formData = new FormData();
      formData.append('eventData', JSON.stringify(eventPayload));

      const imageFileName = state.imageBlob instanceof File && state.imageBlob.name
        ? state.imageBlob.name
        : 'event-image.png';

      formData.append('image', state.imageBlob, imageFileName);

      response = await fetch(buildApiUrl('/api/events'), {
        method: 'POST',
        headers,
        body: formData
      });
    } else {
      headers['Content-Type'] = 'application/json';
      response = await fetch(buildApiUrl('/api/events'), {
        method: 'POST',
        headers,
        body: JSON.stringify(eventPayload)
      });
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data?.message || data?.error || 'Creazione evento fallita.');
    }

    const slug = data?.slug ? `/events/${data.slug}` : '';
    setStatus(
      elements.createStatus,
      slug ? `Evento creato con successo (${slug}).` : 'Evento creato con successo.',
      'success'
    );
  } catch (error) {
    setStatus(elements.createStatus, error instanceof Error ? error.message : 'Errore creazione evento.', 'error');
  }
}

function onEventSelectionChange() {
  const nextIndex = Number.parseInt(elements.eventSelector.value, 10);
  if (Number.isNaN(nextIndex) || !state.parsedEvents[nextIndex]) {
    return;
  }

  state.selectedEventIndex = nextIndex;
  applyEventToForm(state.parsedEvents[nextIndex]);
}

async function init() {
  await loadSavedSettings();
  await loadLatestCapture();

  elements.loginBtn.addEventListener('click', login);
  elements.logoutBtn.addEventListener('click', logout);
  elements.imageInput.addEventListener('change', handleImageUpload);
  elements.captureBtn.addEventListener('click', startAreaSelection);
  elements.clearCaptureBtn.addEventListener('click', clearCurrentImage);
  elements.processBtn.addEventListener('click', processImage);
  elements.eventSelector.addEventListener('change', onEventSelectionChange);
  elements.createBtn.addEventListener('click', createEvent);

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'AREA_SELECTION_CANCELLED') {
      setStatus(elements.processStatus, message.reason || 'Selezione annullata.', 'error');
    }
  });
}

init().catch((error) => {
  setStatus(elements.processStatus, error instanceof Error ? error.message : 'Errore inizializzazione.', 'error');
});
