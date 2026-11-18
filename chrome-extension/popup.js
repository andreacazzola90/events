import { getSupportedSocialPage, isSameCaptureTab } from './social-import-utils.mjs';

const PRODUCTION_BASE_URL = 'https://events-scanner.vercel.app';
const LOCAL_BASE_URL = 'http://localhost:3000';

const state = {
  baseUrl: PRODUCTION_BASE_URL,
  auth: null,
  isAdmin: false,
  imageBlob: null,
  imageDataUrl: null,
  parsedEvents: [],
  selectedEventIndex: 0,
  debugRawText: '',
  socialInput: null,
  socialImportActive: false
};

const elements = {
  email: document.getElementById('email'),
  password: document.getElementById('password'),
  loginBtn: document.getElementById('loginBtn'),
  logoutBtn: document.getElementById('logoutBtn'),
  userStatus: document.getElementById('userStatus'),
  socialImportSection: document.getElementById('socialImportSection'),
  openFacebookBtn: document.getElementById('openFacebookBtn'),
  openInstagramBtn: document.getElementById('openInstagramBtn'),
  selectFacebookTextBtn: document.getElementById('selectFacebookTextBtn'),
  captureStoryBtn: document.getElementById('captureStoryBtn'),
  socialTextPreview: document.getElementById('socialTextPreview'),
  socialImagePreview: document.getElementById('socialImagePreview'),
  socialConsent: document.getElementById('socialConsent'),
  analyzeSocialBtn: document.getElementById('analyzeSocialBtn'),
  socialStatus: document.getElementById('socialStatus'),
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
    elements.email.value = state.auth.email;
  }
}

function updateSocialAccess() {
  elements.socialImportSection.hidden = !state.isAdmin;
}

async function refreshAdminRole() {
  state.isAdmin = false;
  updateSocialAccess();
  if (!state.auth?.email || !state.auth?.password) {
    if (state.socialImportActive || state.socialInput) discardSocialDraft();
    setStatus(elements.userStatus, 'Non autenticato', 'muted');
    return false;
  }

  const auth = state.auth;
  try {
    const response = await fetch(buildApiUrl('/api/auth/extension-login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: auth.email, password: auth.password }),
      redirect: 'error',
      signal: AbortSignal.timeout(8_000)
    });
    const data = await response.json().catch(() => ({}));
    if (state.auth !== auth) return false;
    if (!response.ok) {
      throw new Error('Ruolo non verificabile.');
    }

    state.isAdmin = data?.user?.isAdmin === true;
    if (!state.isAdmin && (state.socialImportActive || state.socialInput)) discardSocialDraft();
    setStatus(
      elements.userStatus,
      state.isAdmin ? `Admin: ${state.auth.email}` : `Loggato come ${state.auth.email} (non admin)`,
      state.isAdmin ? 'success' : 'muted'
    );
    updateSocialAccess();
    return state.isAdmin;
  } catch {
    if (state.auth !== auth) return false;
    if (state.socialImportActive || state.socialInput) discardSocialDraft();
    setStatus(elements.userStatus, 'Ruolo admin non verificabile. Riprova il login.', 'error');
    updateSocialAccess();
    return false;
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

async function loadLatestSocialCapture() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_LAST_SOCIAL_CAPTURE' });
  if (response?.error) {
    setStatus(elements.socialStatus, response.error, 'error');
  }
  if (!response?.ok || !response?.dataUrl) {
    return false;
  }

  if (!state.isAdmin) {
    return false;
  }

  state.imageBlob = null;
  state.socialImportActive = false;
  elements.imageInput.value = '';
  setImagePreview(null);
  state.socialInput = { image: response.dataUrl };
  elements.socialImagePreview.src = response.dataUrl;
  elements.socialImagePreview.hidden = false;
  elements.socialTextPreview.hidden = true;
  elements.socialTextPreview.value = '';
  elements.socialConsent.checked = false;
  setStatus(elements.socialStatus, 'Ritaglio della story pronto per l’anteprima locale.', 'success');
  return true;
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

    if (state.socialImportActive || state.socialInput) discardSocialDraft();
    state.auth = { email, password };
    await saveState();
    state.isAdmin = data?.user?.isAdmin === true;
    updateSocialAccess();
    setStatus(
      elements.userStatus,
      state.isAdmin ? `Admin: ${email}` : `Loggato come ${email} (non admin)`,
      state.isAdmin ? 'success' : 'muted'
    );
  } catch (error) {
    setStatus(elements.userStatus, error instanceof Error ? error.message : 'Login fallito.', 'error');
  }
}

async function logout() {
  if (state.socialImportActive || state.socialInput) discardSocialDraft();
  state.auth = null;
  state.isAdmin = false;
  state.socialImportActive = false;
  resetSocialPreview();
  await chrome.runtime.sendMessage({ type: 'CLEAR_SOCIAL_CAPTURE' });
  elements.password.value = '';
  await saveState();
  updateSocialAccess();
  setStatus(elements.userStatus, 'Non autenticato', 'muted');
}

async function handleImageUpload(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  if (state.socialImportActive || state.socialInput) discardSocialDraft();
  state.imageBlob = file;
  state.socialImportActive = false;
  resetSocialPreview();
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
    if (state.socialImportActive || state.socialInput) discardSocialDraft();
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content-script.js']
    });

    await chrome.tabs.sendMessage(tab.id, { type: 'START_AREA_SELECTION', purpose: 'general' });
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

function resetSocialPreview() {
  state.socialInput = null;
  elements.socialTextPreview.value = '';
  elements.socialTextPreview.hidden = true;
  elements.socialImagePreview.removeAttribute('src');
  elements.socialImagePreview.hidden = true;
  elements.socialConsent.checked = false;
}

function discardSocialDraft() {
  resetSocialPreview();
  state.socialImportActive = false;
  state.parsedEvents = [];
  state.selectedEventIndex = 0;
  elements.eventSelector.innerHTML = '';
  elements.eventSection.hidden = true;
}

async function prepareSocialImport() {
  state.imageBlob = null;
  state.socialImportActive = false;
  state.debugRawText = '';
  elements.imageInput.value = '';
  setImagePreview(null);
  resetSocialPreview();
  state.parsedEvents = [];
  state.selectedEventIndex = 0;
  elements.eventSection.hidden = true;
  elements.eventSelector.innerHTML = '';
  await chrome.runtime.sendMessage({ type: 'CLEAR_LAST_CAPTURE' });
}

async function openSocialSite(url) {
  try {
    await chrome.tabs.create({ url });
  } catch {
    setStatus(elements.socialStatus, 'Impossibile aprire il sito nel browser.', 'error');
  }
}

async function getSocialTab(expectedKind) {
  if (!await refreshAdminRole()) {
    setStatus(elements.socialStatus, 'Funzione disponibile solo per un admin verificato.', 'error');
    return null;
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const kind = tab?.url ? getSupportedSocialPage(tab.url) : null;
  if (!tab?.id || kind !== expectedKind) {
    setStatus(
      elements.socialStatus,
      expectedKind === 'facebook-event'
        ? 'Apri una pagina Facebook di un singolo evento e seleziona il testo da analizzare.'
        : 'Apri una story Instagram attiva, poi ritaglia solo la locandina.',
      'error'
    );
    return null;
  }
  return tab;
}

async function selectFacebookText() {
  const tab = await getSocialTab('facebook-event');
  if (!tab) return;

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (expectedUrl) => window.location.href === expectedUrl
        ? window.getSelection()?.toString().trim() || ''
        : '',
      args: [tab.url],
    });
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!isSameCaptureTab(tab, activeTab)) {
      setStatus(elements.socialStatus, 'La scheda è cambiata. Seleziona il testo e riprova.', 'error');
      return;
    }
    const text = results?.[0]?.result;
    if (typeof text !== 'string' || text.trim().length < 2 || text.length > 10_000) {
      setStatus(elements.socialStatus, 'Seleziona manualmente il testo dell’evento nella pagina, poi riprova.', 'error');
      return;
    }

    await prepareSocialImport();
    state.socialInput = { text: text.trim() };
    elements.socialTextPreview.value = text.trim();
    elements.socialTextPreview.hidden = false;
    setStatus(elements.socialStatus, 'Testo selezionato solo localmente. Verifica l’anteprima prima di inviarla.', 'success');
  } catch {
    setStatus(elements.socialStatus, 'Impossibile leggere la selezione della pagina attiva.', 'error');
  }
}

async function captureInstagramStory() {
  const tab = await getSocialTab('instagram-story');
  if (!tab) return;

  try {
    await prepareSocialImport();
    await chrome.runtime.sendMessage({ type: 'CLEAR_SOCIAL_CAPTURE' });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content-script.js']
    });
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'START_AREA_SELECTION',
      purpose: 'social-story',
      expectedUrl: tab.url,
    });
    if (!response?.ok) throw new Error('Impossibile avviare il ritaglio.');
    setStatus(elements.socialStatus, 'Seleziona solo la locandina della story, poi riapri il popup.', 'success');
    setTimeout(() => window.close(), 350);
  } catch (error) {
    setStatus(elements.socialStatus, error instanceof Error ? error.message : 'Impossibile avviare il ritaglio.', 'error');
  }
}

async function analyzeSocialPreview() {
  if (elements.analyzeSocialBtn.disabled) return;
  const input = state.socialInput;
  if (!input) {
    setStatus(elements.socialStatus, 'Seleziona un testo o ritaglia una locandina prima di procedere.', 'error');
    return;
  }
  if (!elements.socialConsent.checked) {
    setStatus(elements.socialStatus, 'Conferma di avere il diritto di condividere questo contenuto.', 'error');
    return;
  }
  const auth = state.auth;
  elements.analyzeSocialBtn.disabled = true;
  try {
    if (!await refreshAdminRole()) {
      setStatus(elements.socialStatus, 'Ruolo admin non valido. Nessun contenuto è stato inviato.', 'error');
      return;
    }
    if (state.auth !== auth || state.socialInput !== input || !elements.socialConsent.checked) return;

    setStatus(elements.socialStatus, 'Analisi dell’anteprima confermata…', 'muted');
    const authHeader = getAuthHeader();
    if (!authHeader) throw new Error('Effettua il login prima di inviare l’anteprima.');

    const response = await fetch(buildApiUrl('/api/admin/social-browser-import'), {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ...input, consent: true }),
      redirect: 'error',
      signal: AbortSignal.timeout(40_000)
    });
    const data = await response.json().catch(() => ({}));
    if (state.auth !== auth || state.socialInput !== input) return;
    if (!response.ok) {
      throw new Error(data?.error === 'admin_required' || data?.error === 'unauthorized'
        ? 'Ruolo admin non valido. Nessun evento è stato creato.'
        : 'Analisi non disponibile. Riprova con una nuova anteprima.');
    }

    const events = Array.isArray(data?.events) ? data.events : [];
    if (events.length === 0) {
      state.parsedEvents = [];
      elements.eventSection.hidden = true;
      setStatus(elements.socialStatus, 'Nessun evento verificabile trovato. Non è stata creata alcuna bozza.', 'error');
      return;
    }

    state.imageBlob = null;
    state.debugRawText = '';
    state.socialImportActive = true;
    state.parsedEvents = events;
    state.selectedEventIndex = 0;
    refreshEventSelector();
    applyEventToForm(events[0]);
    elements.sourceUrl.value = '';
    elements.eventSection.hidden = false;
    setStatus(elements.socialStatus, 'Anteprima analizzata. Rivedi i campi e crea l’evento solo quando vuoi.', 'success');
  } catch (error) {
    setStatus(elements.socialStatus, error instanceof Error ? error.message : 'Analisi non disponibile.', 'error');
  } finally {
    if (state.socialInput === input) resetSocialPreview();
    elements.analyzeSocialBtn.disabled = false;
  }
}

async function clearCurrentImage() {
  state.imageBlob = null;
  elements.imageInput.value = '';
  setImagePreview(null);
  await chrome.runtime.sendMessage({ type: 'CLEAR_LAST_CAPTURE' });
  setStatus(elements.processStatus, 'Immagine rimossa.', 'muted');
}

async function processImage() {
  if (!state.imageBlob) {
    setStatus(elements.processStatus, 'Carica un\'immagine o cattura una zona della pagina.', 'error');
    return;
  }

  if (state.socialImportActive || state.socialInput) discardSocialDraft();
  state.socialImportActive = false;
  resetSocialPreview();
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
  if (state.socialImportActive && !await refreshAdminRole()) {
    setStatus(elements.userStatus, 'Ruolo admin non valido. L’evento non è stato creato.', 'error');
    return;
  }

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
    if (state.imageBlob && !state.socialImportActive) {
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
  await refreshAdminRole();
  const hasSocialCapture = await loadLatestSocialCapture();
  if (!hasSocialCapture) await loadLatestCapture();

  elements.loginBtn.addEventListener('click', login);
  elements.logoutBtn.addEventListener('click', logout);
  elements.openFacebookBtn.addEventListener('click', () => openSocialSite('https://www.facebook.com/'));
  elements.openInstagramBtn.addEventListener('click', () => openSocialSite('https://www.instagram.com/'));
  elements.selectFacebookTextBtn.addEventListener('click', selectFacebookText);
  elements.captureStoryBtn.addEventListener('click', captureInstagramStory);
  elements.analyzeSocialBtn.addEventListener('click', analyzeSocialPreview);
  elements.imageInput.addEventListener('change', handleImageUpload);
  elements.captureBtn.addEventListener('click', startAreaSelection);
  elements.clearCaptureBtn.addEventListener('click', clearCurrentImage);
  elements.processBtn.addEventListener('click', processImage);
  elements.eventSelector.addEventListener('change', onEventSelectionChange);
  elements.createBtn.addEventListener('click', createEvent);

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'AREA_SELECTION_CANCELLED') {
      setStatus(
        message.purpose === 'social-story' ? elements.socialStatus : elements.processStatus,
        message.reason || 'Selezione annullata.',
        'error'
      );
    }
  });
}

init().catch((error) => {
  setStatus(elements.processStatus, error instanceof Error ? error.message : 'Errore inizializzazione.', 'error');
});
