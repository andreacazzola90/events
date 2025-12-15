// ***********************************************
// This example commands.ts shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************

/// <reference types="cypress" />

// Custom command to login
Cypress.Commands.add('login', (email: string, password: string) => {
  cy.visit('/auth/signin');
  cy.get('input[name="email"]').type(email);
  cy.get('input[name="password"]').type(password);
  cy.get('button[type="submit"]').click();
  cy.url().should('not.include', '/auth/signin');
});

// Custom command to wait for API response
Cypress.Commands.add('waitForEventCreation', () => {
  cy.intercept('POST', '/api/events').as('createEvent');
  cy.wait('@createEvent', { timeout: 30000 }).its('response.statusCode').should('eq', 201);
});

// Extend Cypress namespace
declare global {
  namespace Cypress {
    interface Chainable {
      login(email: string, password: string): Chainable<void>;
      waitForEventCreation(): Chainable<void>;
    }
  }
}

export {};
