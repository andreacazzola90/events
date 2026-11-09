import React from 'react';
import { createRoot } from 'react-dom/client';
import MessagingAccountsTab from '../../app/admin/MessagingAccountsTab';

const disconnected = { platform: 'telegram', status: 'disconnected', listing: 'administered-public-only', sources: [] };
const connected = { ...disconnected, status: 'connected', sources: [{ id: '123456789', reference: '@fixture', title: 'Canale verificato', kind: 'broadcast', active: true, consentedAt: '2026-11-02' }] };
function renderAccounts(status: object = disconnected, statusCode = 200, delay = 0) {
  cy.intercept('GET', '/api/admin/messaging*', { statusCode, body: status, delay }).as('status');
  cy.intercept('/api/admin/telegram*', () => { throw new Error('Personal accounts must not call bot pipeline'); });
  cy.intercept({ method: 'POST', url: '/api/events*' }, () => { throw new Error('Account connection must not publish'); });
  cy.request('/auth').then(response => {
    const styles = [...String(response.body).matchAll(/href="([^"]+\.css(?:\?[^"]*)?)"/g)].map(match => `<link rel="stylesheet" href="${match[1]}">`).join('');
    cy.intercept('GET', '/__messaging-component-test', { headers: { 'content-type': 'text/html' }, body: `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">${styles}</head><body style="background:#152229"><main class="cron-page p-6"><div id="messaging-root" class="max-w-6xl mx-auto"></div></main></body></html>` });
    cy.visit('/__messaging-component-test');
    cy.document().then(document => { createRoot(document.getElementById('messaging-root')!).render(React.createElement(MessagingAccountsTab)); });
    cy.wait('@status');
  });
}
describe('Personal messaging accounts: isolated fake provider flows', () => {
  it('status slower than the polling interval still publishes its confirmed result', () => {
    renderAccounts(connected, 200, 4200);
    cy.contains('[role="status"]', 'Collegato', { timeout: 6500 }).should('be.visible');
    cy.get('input[aria-label="Fonte da autorizzare"]').should('be.visible');
  });
  it('a hanging status clears old connected state and sensitive source fields at timeout', () => {
    renderAccounts(connected);
    cy.get('input[aria-label="Fonte da autorizzare"]').type('@sensitive'); cy.get('input[type="checkbox"]').check();
    cy.then(() => {
      cy.stub(AbortSignal, 'timeout').callsFake(() => { const controller = new AbortController(); setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), 80); return controller.signal; });
    });
    cy.intercept('GET', '/api/admin/messaging*', { body: connected, delay: 20000 });
    cy.contains('[role="status"]', 'Servizio non disponibile', { timeout: 6000 }).should('be.visible');
    cy.get('input[aria-label="Fonte da autorizzare"]').should('not.exist');
    cy.intercept('POST', '/api/admin/messaging', { body: connected });
    cy.get('button[aria-label="Aggiorna stato"]').click();
    cy.get('input[aria-label="Fonte da autorizzare"]').should('have.value', ''); cy.get('input[type="checkbox"]').should('not.be.checked');
  });
  it('poll transition from code to password clears the previous credential', () => {
    renderAccounts({ ...disconnected, status: 'code' });
    cy.get('input[aria-label="Codice Telegram"]').type('private-code');
    cy.intercept('GET', '/api/admin/messaging*', { body: { ...disconnected, status: 'password' } });
    cy.get('input[aria-label="Password 2FA"]', { timeout: 6000 }).should('have.value', '');
  });
  it('unavailable worker never appears connected', () => {
    renderAccounts({ error: 'worker_unavailable' }, 503);
    cy.get('[role="alert"]').should('contain.text', 'Servizio non disponibile');
    cy.contains('button', 'Collega account').should('not.exist');
  });
  it('losing the worker removes a previously confirmed connected state', () => {
    renderAccounts(connected);
    cy.intercept('POST', '/api/admin/messaging', { statusCode: 503, body: { error: 'worker_unavailable' } }).as('offline');
    cy.get('button[aria-label="Aggiorna stato"]').click(); cy.wait('@offline');
    cy.get('[role="alert"]').should('contain.text', 'Servizio non disponibile');
    cy.contains('[role="status"]', 'Collegato').should('not.exist');
    cy.get('input[aria-label="Fonte da autorizzare"]').should('not.exist');
  });
  it('platform tabs support keyboard navigation and clear the previous form', () => {
    renderAccounts();
    cy.intercept('GET', '/api/admin/messaging*', { body: { ...disconnected, platform: 'whatsapp' } });
    cy.get('#messaging-tab-telegram').focus().type('{rightarrow}');
    cy.get('#messaging-tab-whatsapp').should('have.attr', 'aria-selected', 'true').and('be.focused');
    cy.get('#messaging-platform-panel').should('have.attr', 'aria-labelledby', 'messaging-tab-whatsapp');
    cy.get('input[aria-label="Telefono internazionale"]').should('not.exist');
  });
  it('Telegram code, invalid code, 2FA and confirmed login clear transient secrets', () => {
    renderAccounts();
    let status: object = disconnected;
    cy.intercept('GET', '/api/admin/messaging*', request => request.reply(status));
    cy.intercept('POST', '/api/admin/messaging', request => {
      if (request.body.action === 'start') status = { ...disconnected, status: 'code' };
      if (request.body.action === 'code' && request.body.code === 'bad-code') { request.reply({ statusCode: 400, body: { error: 'code_invalid' } }); return; }
      if (request.body.action === 'code') status = { ...disconnected, status: 'password' };
      if (request.body.action === 'password') status = connected;
      request.reply(status);
    }).as('command');
    cy.get('input[aria-label="Telefono internazionale"]').type('+391234567890'); cy.contains('button', 'Collega account').click(); cy.wait('@command');
    cy.get('input[aria-label="Codice Telegram"]').type('bad-code'); cy.contains('button', 'Conferma').click(); cy.wait('@command');
    cy.get('[role="alert"]').should('contain.text', 'Codice non valido'); cy.get('input[aria-label="Codice Telegram"]').should('have.value', '').type('fixture-code');
    cy.contains('button', 'Conferma').click(); cy.wait('@command');
    cy.get('input[aria-label="Password 2FA"]').should('have.attr', 'type', 'password').type('fixture-password'); cy.contains('button', 'Conferma').click(); cy.wait('@command');
    cy.contains('[role="status"]', 'Collegato').should('be.visible'); cy.get('input[type="password"]').should('not.exist');
    cy.window().then(window => expect(JSON.stringify(window.localStorage)).not.to.contain('fixture-'));
  });
  it('requires per-source consent, can pause and shows unconfirmed remote logout', () => {
    renderAccounts(connected);
    cy.intercept('POST', '/api/admin/messaging', { body: { ...connected, availableSources: [{ id: '987654321', reference: '@other', title: 'Altro canale', kind: 'broadcast' }] } }).as('list');
    cy.contains('button', 'Aggiorna gruppi e canali').click(); cy.wait('@list');
    cy.contains('button', 'Seleziona').click();
    cy.get('input[aria-label="Fonte da autorizzare"]').should('have.value', '@other'); cy.contains('button', 'Verifica e autorizza fonte').should('be.disabled');
    cy.get('input[type="checkbox"]').check();
    cy.intercept('POST', '/api/admin/messaging', { body: connected }).as('authorize');
    cy.contains('button', 'Verifica e autorizza fonte').click(); cy.wait('@authorize').its('request.body').should('include', { action: 'authorize', consent: true, source: '@other', platform: 'telegram' });
    const paused = { ...connected, sources: connected.sources.map(source => ({ ...source, active: false })) };
    cy.intercept('POST', '/api/admin/messaging', { body: paused }).as('pause'); cy.intercept('GET', '/api/admin/messaging*', { body: paused });
    cy.get('button[aria-label="Metti in pausa Canale verificato"]').click(); cy.wait('@pause').its('request.body.action').should('equal', 'pause'); cy.contains('In pausa').should('be.visible');
    cy.intercept('POST', '/api/admin/messaging', { body: { ...disconnected, remoteRemoved: false } }).as('logout'); cy.intercept('GET', '/api/admin/messaging*', { body: { ...disconnected, remoteRemoved: false } });
    cy.contains('button', 'Disconnetti').click(); cy.wait('@logout'); cy.contains('Logout remoto non confermato').should('be.visible');
  });
  it('selects a joined supergroup and requires explicit automatic-publication consent', () => {
    renderAccounts(connected);
    cy.intercept('POST', '/api/admin/messaging', {
      body: { ...connected, availableSources: [{ id: 'group:supergroup:12345', title: 'Gruppo eventi', kind: 'group', groupType: 'supergroup' }] },
    }).as('groups');
    cy.contains('button', 'Aggiorna gruppi e canali').click(); cy.wait('@groups');
    cy.contains('button', 'Seleziona').click();
    cy.get('input[aria-label="Fonte da autorizzare"]').should('have.value', 'group:supergroup:12345');
    cy.contains('Acconsento alla lettura dei soli nuovi annunci pubblici di eventi').should('be.visible');
    cy.contains('button', 'Verifica e autorizza fonte').should('be.disabled');
    cy.get('input[type="checkbox"]').check();
    const granted = {
      ...connected,
      sources: [{ id: 'group:supergroup:12345', title: 'Gruppo eventi', kind: 'group', groupType: 'supergroup', active: true }],
      scanning: [{ sourceId: 'group:supergroup:12345', active: true, backlog: 2, messagesSeen: 4, messagesDiscarded: 1 }],
    };
    cy.intercept('POST', '/api/admin/messaging', { body: granted }).as('grant');
    cy.contains('button', 'Verifica e autorizza fonte').click();
    cy.wait('@grant').its('request.body').should('include', { action: 'authorize', consent: true, source: 'group:supergroup:12345', platform: 'telegram' });
    cy.contains('Scansione e pubblicazione autorizzate').should('be.visible');
    cy.contains('Coda: 2 · esaminati: 4 · scartati: 1').should('be.visible');
  });
  it('makes bounded group-list truncation visible to admins', () => {
    renderAccounts(connected);
    cy.intercept('POST', '/api/admin/messaging', {
      body: { ...connected, availableSourcesTruncated: true, availableSources: [] },
    }).as('groups');
    cy.contains('button', 'Aggiorna gruppi e canali').click(); cy.wait('@groups');
    cy.contains('Elenco limitato ai primi 500 dialoghi').should('be.visible');
  });
  it('WhatsApp QR expires and newsletter listing is honestly unsupported', () => {
    renderAccounts();
    const qr = { platform: 'whatsapp', status: 'qr', listing: 'unsupported', sources: [], qr: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0uUAAAAASUVORK5CYII=', qrExpiresAt: Date.now() + 45000 };
    cy.intercept('GET', '/api/admin/messaging*', { body: qr }); cy.contains('[role="tab"]', 'WhatsApp').click();
    cy.get('img[alt="QR temporaneo per collegare il proprio account WhatsApp"]').should('be.visible');
    cy.intercept('POST', '/api/admin/messaging', { body: { ...qr, qrExpiresAt: Date.now() - 1 } }); cy.get('button[aria-label="Aggiorna stato"]').click(); cy.contains('QR scaduto').should('be.visible');
    cy.intercept('POST', '/api/admin/messaging', { body: { ...qr, qr: undefined, status: 'connected' } }); cy.get('button[aria-label="Aggiorna stato"]').click(); cy.contains('Elenco dei canali seguiti non supportato').should('be.visible');
  });
  for (const width of [1280, 390]) it(`account controls at ${width}px have no horizontal overflow`, () => {
    cy.viewport(width, 900); renderAccounts(connected);
    cy.get('[data-testid="messaging-account"]').should('be.visible');
    cy.document().then(document => expect(document.documentElement.scrollWidth).to.be.at.most(width));
    cy.screenshot(`messaging-admin-${width}`, { capture: 'fullPage', overwrite: true });
  });
});