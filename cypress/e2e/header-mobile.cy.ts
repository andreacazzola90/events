/// <reference types="cypress" />

describe('Mobile header', () => {
  it('centers the brand and keeps secondary controls in the left menu', () => {
    cy.viewport(390, 844);
    cy.visit('/crea', { failOnStatusCode: false });
    cy.get('.site-header').should('be.visible');

    cy.get('.site-brand').then($brand => {
      const brand = $brand[0].getBoundingClientRect();
      expect(Math.abs((brand.left + brand.width / 2) - 195)).to.be.lessThan(2);
      cy.get('#mobile-navigation-menu').should('not.exist');
      cy.get('button[aria-label="Apri menu"]').then($button => {
        expect($button[0].getBoundingClientRect().right).to.be.lessThan(brand.left);
      });
      cy.get('a.header-icon-control[href="/crea"]').then($button => {
        expect($button[0].getBoundingClientRect().left).to.be.greaterThan(brand.right);
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
  });
});