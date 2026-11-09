export const FACEBOOK_EVENT_UNAVAILABLE = 'Facebook non rende disponibili i dettagli di questo evento senza accesso. Verifica che sia pubblico oppure carica uno screenshot.';

export function isFacebookEventSource(value: string): boolean {
  const { hostname } = new URL(value);
  return /(^|\.)facebook\.com$/i.test(hostname) || /^(www\.)?(fb\.com|fb\.me)$/i.test(hostname);
}

export function normalizeFacebookEventUrl(value: string): string {
  const url = new URL(value);
  if (!isFacebookEventSource(value)) return value;
  const eventId = url.pathname.match(/^\/events\/(?:[^/]+\/)?(\d+)\/?$/)?.[1];
  if (eventId) {
    url.protocol = 'https:';
    url.hostname = 'www.facebook.com';
    url.pathname = `/events/${eventId}/`;
    url.search = '';
    url.hash = '';
  }
  return url.toString();
}

export function hasFacebookEventDetails(text: string): boolean {
  const title = text.trim().split('\n')[0]?.trim() ?? '';
  const genericTitle = /^(?:facebook|error|errore|pagina non disponibile|page not found|content (?:isn't|not) available)(?:\s*[-|·:].*)?$/i;
  if (!title || genericTitle.test(title) || /^(?:log\s*in|accedi|iscriviti|sign\s*up|registrati)\b/i.test(title)) return false;
  const numericDate = /\b\d{4}-\d{2}-\d{2}(?=T|\b)|\b\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?\b/;
  const months = 'gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre|january|february|march|april|may|june|july|august|september|october|november|december|gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic|jan|jun|jul|aug|sep|oct|dec';
  const writtenDate = new RegExp(`\\b(?:\\d{1,2}\\s+(?:${months})|(?:${months})\\s+\\d{1,2})\\b`, 'i');
  return numericDate.test(text) || writtenDate.test(text) || /\b(?:oggi|domani|today|tomorrow)\b/i.test(text);
}
