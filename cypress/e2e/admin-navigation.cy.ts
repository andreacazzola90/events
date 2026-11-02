import React from 'react';
import { createRoot } from 'react-dom/client';
import AdminLogClient from '../../app/admin/AdminLogClient';
import { SiteSettingsProvider } from '../../app/components/SiteSettingsProvider';

function renderAdmin() {
  cy.intercept('GET', '/api/admin/cron-status*', { body: { runs: [] } }).as('runs');
  cy.intercept('GET', '/api/admin/event-log*', { body: { events: [], total: 0 } }).as('events');
  cy.intercept('GET', '/api/admin/messaging*', { body: { platform: 'telegram', status: 'disconnected', sources: [], listing: 'administered-public-only' } });
  cy.intercept('GET', '/api/admin/instagram-story', { body: {
    igUserId: '', hasAccessToken: false, graphApiVersion: 'v22.0', autoPublish: false,
    publishDays: [3], timeZone: 'Europe/Rome', lastRunSlot: null, lastRunAt: null,
    lastMediaId: null, lastError: null, envFallback: { igUserId: false, accessToken: false },
  } });
  cy.intercept('GET', '/api/site-settings', { body: { categories: [], quotes: [] } });
  cy.intercept({ method: '+(POST|PUT|DELETE)', url: '/api/**' }, () => {
    throw new Error('Navigation must not start jobs or write real data');
  });
  cy.request('/auth').then(response => {
    const styles = [...String(response.body).matchAll(/href="([^"]+\.css(?:\?[^"]*)?)"/g)]
      .map(match => `<link rel="stylesheet" href="${match[1]}">`).join('');
    cy.intercept('GET', '/__admin-navigation-test', {
      headers: { 'content-type': 'text/html' },
      body: `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">${styles}</head><body><div id="admin-root"></div></body></html>`,
    });
    cy.visit('/__admin-navigation-test');
    cy.document().then(document => {
      createRoot(document.getElementById('admin-root')!).render(
        React.createElement(SiteSettingsProvider, null, React.createElement(AdminLogClient)),
      );
    });
    cy.wait('@runs');
  });
}

describe('Grouped admin navigation without real account or database operations', () => {
  it('groups all destinations and exposes source and series management', () => {
    cy.viewport(1280, 900); renderAdmin();
    cy.get('h1').should('have.text', 'Amministrazione');
    for (const group of ['Monitoraggio', 'Fonti e canali', 'Pubblicazione', 'Sito']) {
      cy.contains('nav h2', group).should('be.visible');
    }
    cy.contains('nav a', 'Fonti e scansioni').should('have.attr', 'href', '/cron');
    cy.contains('nav a', 'Rassegne').should('have.attr', 'href', '/admin/rassegne');
    cy.get('nav [aria-current="location"]').should('have.text', 'Esecuzioni automatiche');
    cy.document().then(document => expect(document.documentElement.scrollWidth).to.be.at.most(1280));
    cy.screenshot('admin-navigation-desktop', { capture: 'fullPage', overwrite: true });
  });

  it('opens every existing panel and keeps one active destination', () => {
    cy.viewport(1280, 900); renderAdmin();
    for (const label of ['Eventi importati', 'Account e canali', 'Story Instagram', 'Categorie e citazioni', 'Esecuzioni automatiche']) {
      cy.contains('nav button', label).click();
      cy.get('#admin-section-heading').should('have.text', label);
      cy.get('nav [aria-current="location"]').should('have.length', 1).and('have.text', label);
    }
    cy.contains('Nessuna esecuzione registrata.').should('be.visible');
  });

  it('supports native keyboard activation without a horizontal tab strip', () => {
    cy.viewport(1280, 900); renderAdmin();
    cy.get('[data-testid="admin-shell"]').click('topLeft');
    cy.window().then(window => window.focus());
    cy.contains('nav button', 'Eventi importati').focus().should('be.focused');
    cy.press(Cypress.Keyboard.Keys.ENTER);
    cy.get('#admin-section-heading').should('have.text', 'Eventi importati');
    cy.get('input[placeholder="Cerca titolo, luogo, URL…"]').should('be.visible');
  });

  it('keeps the selected section when moving between desktop and mobile', () => {
    cy.viewport(1280, 900); renderAdmin();
    cy.contains('nav button', 'Account e canali').click();
    cy.viewport(390, 844);
    cy.get('nav select').should('be.visible').and('have.value', 'messaging');
    cy.get('nav optgroup').should('have.length', 4);
    cy.get('nav select').select('appearance');
    cy.get('#admin-section-heading').should('have.text', 'Categorie e citazioni');
    cy.viewport(1280, 900);
    cy.get('nav [aria-current="location"]').should('have.text', 'Categorie e citazioni');
  });

  it('shows all mobile destinations without overflowing the viewport', () => {
    cy.viewport(390, 844); renderAdmin();
    cy.get('nav select').should('be.visible').find('option').should('have.length', 7);
    cy.get('nav select').select('messaging');
    cy.contains('Account personale Telegram').should('be.visible');
    cy.document().then(document => expect(document.documentElement.scrollWidth).to.be.at.most(390));
    cy.screenshot('admin-navigation-mobile', { capture: 'fullPage', overwrite: true });
  });

  for (const path of ['/cron', '/admin/rassegne']) {
    it(`opens ${path} from the mobile section menu`, () => {
      cy.viewport(390, 844); renderAdmin();
      cy.intercept('GET', path, { headers: { 'content-type': 'text/html' }, body: '<!doctype html><html><body>Navigation destination</body></html>' });
      cy.get('nav select').select(path);
      cy.location('pathname').should('eq', path);
    });
  }
});