// ***********************************************************
// This example support/e2e.ts is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

// Import commands.js using ES2015 syntax:
import './commands';

// Alternatively you can use CommonJS syntax:
// require('./commands')

// Ignore uncaught exceptions from React hydration errors
Cypress.on('uncaught:exception', (err, runnable) => {
  // Ignore React hydration errors and other non-critical errors
  if (
    err.message.includes('Hydration') ||
    err.message.includes('hydration') ||
    err.message.includes('Minified React error') ||
    err.message.includes('Cannot read properties of null')
  ) {
    return false;
  }
  // Let Cypress fail on other errors
  return true;
});
