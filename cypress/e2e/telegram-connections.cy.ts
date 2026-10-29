import React from 'react';
import { createRoot } from 'react-dom/client';
import TelegramAdmin from '../../app/cron/TelegramAdmin';

const disconnected = { connected: false, status: 'disconnected', botUsername: null, lastError: null as string | null, counts: {}, sources: [], published: 0, discarded: 0 };
const connected = { ...disconnected, connected: true, status: 'active', botUsername: 'event_fixture_bot', counts: { pending: 2, failed: 1 }, published: 3, discarded: 4,
  sources: [{ id: 'source', chatId: '-100123', title: 'Canale autorizzato', chatType: 'channel', isActive: true, consentedAt: '2026-10-29', verifiedAt: '2026-10-29', lastError: null, lastScannedAt: '2026-10-29' }] };

function renderTelegram(status: typeof disconnected | typeof connected = disconnected) {
  cy.intercept('GET', '/api/admin/telegram', { body: status }).as('telegramStatus');
  cy.request('/auth').then(response => {
    const styles = [...String(response.body).matchAll(/href="([^"]+\.css(?:\?[^"]*)?)"/g)].map(match => `<link rel="stylesheet" href="${match[1]}">`).join('');
    cy.intercept('GET', '/__telegram-component-test', { headers: { 'content-type': 'text/html' }, body: `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">${styles}</head><body style="background:#152229"><main class="cron-page p-6"><div id="telegram-root" class="max-w-6xl mx-auto"></div></main></body></html>` });
    cy.visit('/__telegram-component-test');
    cy.document().then(document => { createRoot(document.getElementById('telegram-root')!).render(React.createElement(TelegramAdmin)); });
    cy.wait('@telegramStatus');
  });
}

describe('Telegram admin con provider simulato, senza bot o database', () => {
  it('distingue un token Telegram revocato da una sessione admin scaduta', () => {
    renderTelegram();
    cy.intercept('POST', '/api/admin/telegram', { statusCode: 401, body: { error: 'telegram_token_revoked' } }).as('revoked');
    cy.get('input[aria-label="Token bot"]').type('fixture-only-not-a-real-token');
    cy.contains('button', 'Collega bot').click();
    cy.wait('@revoked');
    cy.get('[role="alert"]').should('contain.text', 'Token revocato').and('not.contain.text', 'Accesso admin richiesto');
  });

  it('maschera e cancella il token dopo errore senza localStorage', () => {
    renderTelegram();
    cy.intercept('POST', '/api/admin/telegram', { statusCode: 502, body: { error: 'telegram_webhook_failed' } }).as('connect');
    cy.get('input[aria-label="Token bot"]').should('have.attr', 'type', 'password').type('fixture-only-not-a-real-token');
    cy.contains('button', 'Collega bot').click();
    cy.wait('@connect').its('request.body.action').should('equal', 'connect');
    cy.get('[role="alert"]').should('contain.text', 'Registrazione webhook non riuscita');
    cy.get('input[aria-label="Token bot"]').should('have.value', '');
    cy.window().then(window => expect(JSON.stringify(window.localStorage)).not.to.contain('fixture-only'));
    cy.get('body').should('not.contain.text', 'fixture-only-not-a-real-token');
  });

  it('richiede consenso distinto prima di verificare la fonte e mostra il limite privacy', () => {
    renderTelegram(connected);
    cy.intercept('POST', '/api/admin/telegram', { statusCode: 400, body: { error: 'privacy_mode_limited' } }).as('saveSource');
    cy.get('input[aria-label="Chat ID del canale o gruppo"]').type('-100456');
    cy.contains('button', 'Verifica e autorizza fonte').should('be.disabled');
    cy.get('input[type="checkbox"]').check();
    cy.contains('button', 'Verifica e autorizza fonte').click();
    cy.wait('@saveSource').its('request.body').should('include', { action: 'save-source', chatId: '-100456', consent: true });
    cy.get('[role="alert"]').should('contain.text', 'fonte non e attiva');
  });

  it('mette in pausa una fonte e disconnette con risultato remoto onesto', () => {
    renderTelegram(connected);
    cy.intercept('POST', '/api/admin/telegram', { body: { saved: true } }).as('pause');
    cy.intercept('GET', '/api/admin/telegram', { body: { ...connected, sources: connected.sources.map(source => ({ ...source, isActive: false })) } });
    cy.get('button[aria-label="Metti in pausa Canale autorizzato"]').click();
    cy.wait('@pause').its('request.body').should('include', { action: 'pause-source', sourceId: 'source' });
    cy.contains('In pausa').should('be.visible');
    cy.intercept('POST', '/api/admin/telegram', { body: { connected: false, remoteRemoved: false } }).as('disconnect');
    cy.intercept('GET', '/api/admin/telegram', { body: disconnected });
    cy.contains('button', 'Disconnetti').click();
    cy.wait('@disconnect').its('request.body.action').should('equal', 'disconnect');
    cy.contains('Accesso locale rimosso').should('be.visible');
    cy.contains('Non collegato').should('be.visible');
  });

  it('blocca reconnect dopo timeout remoto e permette retry della disconnessione', () => {
    renderTelegram({ ...disconnected, status: 'disconnect_unknown', lastError: 'telegram_disconnect_unconfirmed' });
    cy.contains('Disconnessione da confermare').should('be.visible');
    cy.get('input[aria-label="Token bot"]').type('fixture-only-not-a-real-token');
    cy.contains('button', 'Collega bot').should('be.disabled');
    cy.intercept('POST', '/api/admin/telegram', { body: { connected: false, remoteRemoved: true, status: 'disconnected' } }).as('retryDisconnect');
    cy.intercept('GET', '/api/admin/telegram', { body: disconnected });
    cy.contains('button', 'Disconnetti').click();
    cy.wait('@retryDisconnect').its('request.body.action').should('equal', 'disconnect');
    cy.contains('Non collegato').should('be.visible');
    cy.get('input[aria-label="Token bot"]').type('fixture-only-not-a-real-token');
    cy.contains('button', 'Collega bot').should('not.be.disabled');
  });

  it('non permette operazioni remote sovrapposte mentre la disconnessione e in corso', () => {
    renderTelegram({ ...disconnected, status: 'disconnecting' });
    cy.contains('Disconnessione in corso').should('be.visible');
    cy.contains('button', 'Disconnetti').should('be.disabled');
    cy.get('input[aria-label="Token bot"]').type('fixture-only-not-a-real-token');
    cy.contains('button', 'Collega bot').should('be.disabled');
    cy.get('button[aria-label="Aggiorna stato Telegram"]').should('not.be.disabled');
  });

  for (const width of [1280, 390]) {
    it(`stato e controlli leggibili a ${width}px senza overflow`, () => {
      cy.viewport(width, 900);
      renderTelegram({ ...connected, botUsername: 'very_long_authorized_eventsbot_12' });
      cy.contains('Pubblicati: 3').should('be.visible');
      cy.contains('Falliti: 1').should('be.visible');
      cy.get('[data-testid="telegram-admin"]').should('be.visible');
      cy.document().then(document => expect(document.documentElement.scrollWidth).to.be.at.most(width));
      cy.screenshot(`telegram-admin-${width}`, { capture: 'fullPage' });
    });
  }

  it('le API reali rifiutano sessioni anonime senza toccare provider o database', () => {
    cy.request({ url: '/api/admin/telegram', failOnStatusCode: false }).its('status').should('eq', 401);
    cy.request({ method: 'POST', url: '/api/admin/telegram', body: { action: 'connect', token: 'fixture' }, failOnStatusCode: false }).its('status').should('eq', 401);
    cy.request({ method: 'POST', url: '/api/telegram/webhook', body: {}, failOnStatusCode: false }).its('status').should('eq', 401);
  });
});