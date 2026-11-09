import React from 'react';
import { createRoot } from 'react-dom/client';
import TelegramPage from '../../app/admin/servizi/telegram/page';
import WhatsAppPage from '../../app/admin/servizi/whatsapp/page';
import InstagramPage from '../../app/admin/servizi/instagram/page';
import ServiceNavigation from '../../app/admin/servizi/ServiceNavigation';

const disconnected = { platform: 'whatsapp', status: 'disconnected', listing: 'unsupported', sources: [] };
const connected = { ...disconnected, status: 'connected', sources: [{ id: '12345@newsletter', title: 'Newsletter autorizzata', kind: 'newsletter', active: true, consentedAt: '2026-11-09' }] };
const instagram = { configured: true, connected: true, status: 'active', username: 'fixture', tokenExpiresAt: null, tokenExpiresSoon: false, lastError: null, lastRunAt: null, lastRun: null, sources: [] };
const bot = { connected: false, status: 'disconnected', botUsername: null, lastError: null, counts: {}, sources: [], published: 0, discarded: 0 };

function renderService(platform: 'telegram' | 'whatsapp' | 'instagram', status: object = connected, navigate = false) {
  cy.intercept('GET', '/api/admin/messaging*', { body: status }).as('account');
  cy.intercept('GET', '/api/admin/telegram', { body: bot });
  cy.intercept('GET', '/api/admin/instagram-scan', { body: instagram });
  cy.intercept('POST', '/api/admin/run-cron*', () => { throw new Error('Manual service scans must never call aggregate cron'); });
  cy.intercept('POST', '/api/events*', () => { throw new Error('Service UI must not publish events directly'); });
  cy.request('/auth').then(response => {
    const styles = [...String(response.body).matchAll(/href="([^"]+\.css(?:\?[^"]*)?)"/g)].map(match => `<link rel="stylesheet" href="${match[1]}">`).join('');
    cy.intercept('GET', `/admin/servizi/${platform}`, { headers: { 'content-type': 'text/html' }, body: `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">${styles}</head><body style="background:#152229"><main class="cron-page p-6"><div id="service-root"></div></main></body></html>` });
    if (navigate) cy.get(`nav[aria-label="Servizi di scraping"] a[href="/admin/servizi/${platform}"]`).click();
    else cy.visit(`/admin/servizi/${platform}`);
    const Page = platform === 'telegram' ? TelegramPage : platform === 'whatsapp' ? WhatsAppPage : InstagramPage;
    cy.document().then(document => {
      createRoot(document.getElementById('service-root')!).render(React.createElement(React.Fragment, null, React.createElement(ServiceNavigation), React.createElement(Page)));
    });
  });
}

describe('Dedicated service pages with simulated providers and no database writes', () => {
  it('navigates between all dedicated service pages through their real links', () => {
    renderService('whatsapp', disconnected);
    cy.contains('Client non ufficiale').should('be.visible');
    renderService('telegram', { ...disconnected, platform: 'telegram' }, true);
    cy.location('pathname').should('eq', '/admin/servizi/telegram');
    cy.get('input[aria-label="Token bot"]').should('be.visible');
    renderService('instagram', connected, true);
    cy.location('pathname').should('eq', '/admin/servizi/instagram');
    cy.get('[data-testid="instagram-scan-admin"]').should('be.visible');
    cy.get('input[aria-label="Token bot"]').should('not.exist');
  });
  it('renders only the chosen access flow and links to all three service pages', () => {
    renderService('whatsapp', disconnected);
    cy.get('nav[aria-label="Servizi di scraping"]').within(() => {
      for (const name of ['telegram', 'whatsapp', 'instagram']) cy.get(`a[href="/admin/servizi/${name}"]`).should('be.visible');
    });
    cy.get('input[aria-label="Telefono internazionale"]').should('not.exist');
    cy.get('input[aria-label="Token bot"]').should('not.exist');
    cy.contains('Collega Instagram').should('not.exist');
    cy.contains('button', 'Avvia scraping').should('be.disabled');
    cy.contains('Client non ufficiale').should('be.visible');
  });
  it('verifies WhatsApp with a provider request, distinguishes preview/publication and reports counters', () => {
    renderService('whatsapp');
    cy.wait('@account');
    cy.intercept('POST', '/api/admin/messaging', { body: { ...connected, connectionVerified: true } }).as('verify');
    cy.contains('button', 'Verifica connessione').click();
    cy.wait('@verify').its('request.body').should('include', { action: 'status', platform: 'whatsapp' });
    cy.contains('[role="status"]', 'Connessione verificata presso il provider').should('be.visible');
    cy.intercept('POST', '/api/admin/messaging/run', request => {
      expect(request.body).to.deep.equal({ platform: 'whatsapp', dryRun: true });
      request.reply({ status: 'success', dryRun: true, visited: 2, wouldPublish: 1, duplicates: 1, discarded: 0, failed: 0, published: 0 });
    }).as('preview');
    cy.contains('button', 'Prova senza pubblicare').click(); cy.wait('@preview');
    cy.contains('[role="status"]', 'nessuna pubblicazione').should('be.visible');
    cy.intercept('POST', '/api/admin/messaging/run', request => {
      expect(request.body).to.deep.equal({ platform: 'whatsapp', dryRun: false });
      request.reply({ status: 'partial-error', dryRun: false, visited: 2, published: 1, duplicates: 0, failed: 1 });
    }).as('scan');
    cy.contains('button', 'Avvia scraping').click(); cy.wait('@scan');
    cy.contains('[role="status"]', 'Risultato parziale').should('be.visible');
    cy.contains('dt', 'Pubblicati').parent().should('contain.text', '1');
  });
  it('disables publication for paused newsletters and shows sanitized provider errors', () => {
    renderService('whatsapp', { ...connected, sources: connected.sources.map(source => ({ ...source, active: false })) });
    cy.wait('@account'); cy.contains('button', 'Avvia scraping').should('be.disabled');
    cy.intercept('POST', '/api/admin/messaging', { statusCode: 503, body: { error: 'worker_unavailable' } });
    cy.contains('button', 'Verifica connessione').click();
    cy.get('[role="alert"]').should('contain.text', 'Servizio non disponibile');
    cy.contains('Connessione verificata').should('not.exist');
  });
  it('keeps Telegram personal and bot access on its page without WhatsApp or Meta access fields', () => {
    renderService('telegram', { ...disconnected, platform: 'telegram' });
    cy.get('input[aria-label="Telefono internazionale"]').should('be.visible');
    cy.get('input[aria-label="Token bot"]').should('be.visible');
    cy.contains('Collega Instagram').should('not.exist');
    cy.get('#messaging-tab-whatsapp').should('not.exist');
  });
  it('uses Meta verification and an explicit owner-scoped actual run on the Instagram page', () => {
    renderService('instagram');
    cy.get('[data-testid="messaging-account"]').should('not.exist');
    cy.intercept('POST', '/api/admin/instagram-scan', { body: { verified: true } }).as('verifyMeta');
    cy.contains('button', 'Verifica connessione').click(); cy.wait('@verifyMeta').its('request.body.action').should('equal', 'verify');
    cy.contains('Connessione verificata presso Meta').should('be.visible');
    cy.intercept('POST', '/api/admin/instagram-scan/run', request => {
      expect(request.body).to.deep.equal({ dryRun: false });
      request.reply({ status: 'success', dryRun: false, published: 1, duplicates: 0, discarded: 0, failed: 0,
        storiesFetched: 1, storiesInWindow: 1, storiesScanned: 1, storiesSkipped: 0, storiesDeferred: 0, storiesFailed: 0,
        storyFetchErrors: 0, eventsExtracted: 1, storyEventsExtracted: 1, storyEventsWouldPublish: 0 });
    }).as('instagramRun');
    cy.contains('button', 'Avvia scraping').click(); cy.wait('@instagramRun');
    cy.contains('Pubblicati: 1').should('be.visible');
  });
});
