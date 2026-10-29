/// <reference types="cypress" />

describe('Mobile header', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/auth/session', {});
    cy.intercept('GET', '/api/favorites', []);
  });

  it('centers the brand and keeps secondary controls in the left menu', () => {
    cy.viewport(390, 844);
    cy.visit('/crea', { failOnStatusCode: false });
    cy.get('.site-header').should('be.visible');

    cy.get('.site-brand').then($brand => {
      const brand = $brand[0].getBoundingClientRect();
      expect(Math.abs((brand.left + brand.width / 2) - 195)).to.be.lessThan(2);
      cy.get('#mobile-navigation-menu').should('not.exist');
      cy.get('button[aria-label="Apri menu"]').then($button => {
        expect($button[0].getBoundingClientRect().left).to.be.at.least(16);
        expect($button[0].getBoundingClientRect().right).to.be.lessThan(brand.left);
      });
      cy.get('a.header-icon-control[href="/crea"]').then($button => {
        expect($button[0].getBoundingClientRect().left).to.be.greaterThan(brand.right);
        expect(390 - $button[0].getBoundingClientRect().right).to.be.at.least(16);
      });
    });

    cy.get('html').then($html => {
      expect($html[0].scrollWidth).to.be.at.most(390);
    });
    cy.get('button[aria-label="Apri menu"]').click();
    cy.get('#mobile-navigation-menu').should('be.visible').within(() => {
      cy.contains('Eventi').should('be.visible');
      cy.contains('Calendario').should('be.visible');
      cy.contains('Invia una segnalazione').should('be.visible');
      cy.contains('Scarica l’app').should('be.visible');
    });
    cy.get('#mobile-navigation-menu').should('have.attr', 'open');
    cy.get('#mobile-navigation-menu').then($menu => {
      const bounds = $menu[0].getBoundingClientRect();
      expect(bounds.left).to.equal(0);
      expect(bounds.top).to.equal(0);
      expect(bounds.width).to.equal(390);
      expect(bounds.height).to.equal(844);
    });
    cy.get('body').should('have.css', 'overflow', 'hidden');
    cy.focused().should('have.attr', 'aria-label', 'Chiudi menu');
    cy.get('#mobile-navigation-menu button[aria-label="Chiudi menu"]').click();
    cy.get('#mobile-navigation-menu').should('not.exist');
    cy.get('body').should('not.have.css', 'overflow', 'hidden');
    cy.focused().should('have.attr', 'aria-label', 'Apri menu');
  });

  it('handles native dialog cancellation and restores previous scroll styles', () => {
    cy.viewport(320, 568);
    cy.visit('/');
    cy.get('button[aria-label="Apri menu"]').click();
    cy.get('#mobile-navigation-menu button[aria-label="Chiudi menu"]').click();
    cy.get('#mobile-navigation-menu').should('not.exist');
    cy.get('body').then($body => { $body[0].style.overflow = 'clip'; });
    cy.get('button[aria-label="Apri menu"]').click();
    cy.get('#mobile-navigation-menu').trigger('cancel');
    cy.get('#mobile-navigation-menu').should('not.exist');
    cy.get('body').should($body => {
      expect($body[0].style.overflow).to.equal('clip');
    });
  });

  it('closes on navigation and when switching to desktop', () => {
    cy.viewport(390, 844);
    cy.visit('/');
    cy.get('button[aria-label="Apri menu"]').click();
    cy.get('#mobile-navigation-menu a[href="/eventi"]').click();
    cy.location('pathname').should('equal', '/eventi');
    cy.get('#mobile-navigation-menu').should('not.exist');
    cy.get('button[aria-label="Apri menu"]').click();
    cy.get('#mobile-navigation-menu a[href="/eventi"]').should('have.attr', 'aria-current', 'page');
    cy.viewport(1280, 800);
    cy.get('#mobile-navigation-menu').should('not.exist');
    cy.get('body').should('not.have.css', 'overflow', 'hidden');
    cy.get('.desktop-nav').should('be.visible');
  });

  for (const width of [320, 390, 768]) {
    it(`shows a clipped next date filter without a scrollbar at ${width}px`, () => {
      cy.viewport(width, 844);
      cy.intercept('GET', '/api/events?*', []).as('filteredEvents');
      cy.visit('/');
      cy.get('button[aria-label="Apri menu"]').click();
      cy.get('#mobile-navigation-menu button[aria-label="Chiudi menu"]').click();
      cy.get('#mobile-navigation-menu').should('not.exist');
      cy.get('.quick-filters-scroll').should('have.css', 'scrollbar-width', 'none');
      cy.get('.quick-filters-scroll').then($track => {
        const track = $track[0];
        const bounds = track.getBoundingClientRect();
        const lastButton = track.querySelector('button:last-child')!.getBoundingClientRect();
        expect(track.scrollWidth).to.be.greaterThan(track.clientWidth);
        expect(Math.abs(bounds.right - track.ownerDocument.documentElement.clientWidth)).to.be.lessThan(1);
        expect(lastButton.left).to.be.lessThan(bounds.right);
        expect(lastButton.right).to.be.greaterThan(bounds.right);
      });
      cy.get('.quick-filters-scroll').scrollTo('right');
      cy.get('.quick-filters-scroll button').last().should('be.visible');
      cy.get('.quick-filters-scroll button').last().click({ scrollBehavior: false });
      cy.wait('@filteredEvents');
      cy.get('.quick-filters-scroll button').last().should('have.attr', 'aria-pressed', 'true');
      cy.get('html').then($html => {
        expect($html[0].scrollWidth).to.be.at.most(width);
      });
    });
  }
});