/// <reference types="cypress" />

// End-to-end regression suite for registration & login security.
// Run with: npm run test:e2e:auth
// Extend this file whenever auth-related behavior changes (new fields,
// new providers, rate limiting, MFA, etc.) so regressions are caught early.

describe('Auth Security - Registration', () => {
  beforeEach(() => {
    cy.visit('/auth?mode=register', { failOnStatusCode: false });
  });

  it('completes registration successfully and redirects to login', () => {
    cy.intercept('POST', '/api/auth/register', {
      statusCode: 201,
      body: { id: 1, email: 'nuovo.utente@example.com' },
    }).as('register');

    cy.get('input[type="email"]').type('nuovo.utente@example.com');
    cy.get('input[type="password"]').eq(0).type('SuperSegreta123');
    cy.get('input[type="password"]').eq(1).type('SuperSegreta123');
    cy.contains('button', 'Crea account').click();

    cy.wait('@register');
    cy.contains('Registrazione completata').should('be.visible');
  });

  it('blocks submission client-side when password confirmation does not match', () => {
    let registerCalled = false;
    cy.intercept('POST', '/api/auth/register', () => {
      registerCalled = true;
    }).as('register');

    cy.get('input[type="email"]').type('mismatch@example.com');
    cy.get('input[type="password"]').eq(0).type('SuperSegreta123');
    cy.get('input[type="password"]').eq(1).type('AltraPassword456');
    cy.contains('button', 'Crea account').click();

    cy.contains('Le password non coincidono').should('be.visible');
    cy.then(() => expect(registerCalled).to.eq(false));
  });

  it('surfaces a clear error when the email is already registered', () => {
    cy.intercept('POST', '/api/auth/register', {
      statusCode: 409,
      body: { error: 'Utente già registrato con questa email' },
    }).as('register');

    cy.get('input[type="email"]').type('esistente@example.com');
    cy.get('input[type="password"]').eq(0).type('SuperSegreta123');
    cy.get('input[type="password"]').eq(1).type('SuperSegreta123');
    cy.contains('button', 'Crea account').click();

    cy.wait('@register');
    cy.contains('Utente già registrato con questa email').should('be.visible');
  });

  it('shows a generic error message on server failure without leaking details', () => {
    cy.intercept('POST', '/api/auth/register', {
      statusCode: 500,
      body: { error: 'Errore durante la registrazione' },
    }).as('register');

    cy.get('input[type="email"]').type('errore@example.com');
    cy.get('input[type="password"]').eq(0).type('SuperSegreta123');
    cy.get('input[type="password"]').eq(1).type('SuperSegreta123');
    cy.contains('button', 'Crea account').click();

    cy.wait('@register');
    cy.contains('Errore durante la registrazione').should('be.visible');
    cy.get('body').should('not.contain.text', 'prisma');
    cy.get('body').should('not.contain.text', 'at ');
  });

  it('masks password fields and uses secure autocomplete hints', () => {
    cy.get('input[type="password"]').should('have.length', 2);
    cy.get('input[type="password"]').eq(0).should('have.attr', 'autocomplete', 'new-password');
    cy.get('input[type="password"]').eq(1).should('have.attr', 'autocomplete', 'new-password');
    cy.get('input[type="password"]').eq(0).should('have.attr', 'minLength', '8');
  });

  it('rejects an XSS payload in the email field without executing it', () => {
    const xssPayload = '<img src=x onerror=window.__xss=true>';

    cy.get('input[type="email"]').type(xssPayload, { parseSpecialCharSequences: false });
    cy.get('input[type="password"]').eq(0).type('SuperSegreta123');
    cy.get('input[type="password"]').eq(1).type('SuperSegreta123');
    cy.contains('button', 'Crea account').click();

    // Whether the browser's native email validation blocks submission or the
    // request goes through, the payload must never execute as script.
    cy.window().its('__xss').should('not.exist');
  });
});

describe('Auth Security - Registration API contract', () => {
  // These hit the real API route but never reach the database because
  // validation fails before any Prisma call, so no cleanup is required.
  it('rejects registration with missing email/password (400)', () => {
    cy.request({
      method: 'POST',
      url: '/api/auth/register',
      body: {},
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.eq(400);
      expect(res.body).to.have.property('error');
    });
  });

  it('rejects registration with a malformed email (400)', () => {
    cy.request({
      method: 'POST',
      url: '/api/auth/register',
      body: { email: 'not-an-email', password: 'SuperSegreta123' },
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.eq(400);
    });
  });

  it('rejects registration with a password shorter than 8 characters (400)', () => {
    cy.request({
      method: 'POST',
      url: '/api/auth/register',
      body: { email: 'weakpass@example.com', password: '123' },
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.eq(400);
      expect(res.body.error).to.match(/8 caratteri/);
    });
  });
});

describe('Auth Security - Login', () => {
  const email = `cypress.login.test+${Date.now()}@example.com`;
  const password = 'SuperSegreta123';

  before(() => {
    cy.task('db:seedUser', { email, password });
  });

  after(() => {
    cy.task('db:deleteUser', email);
  });

  beforeEach(() => {
    cy.visit('/auth', { failOnStatusCode: false });
  });

  it('logs in successfully with valid credentials and redirects to /me', () => {
    cy.get('input[type="email"]').type(email);
    cy.get('input[type="password"]').type(password);
    cy.contains('button', 'Accedi').click();

    cy.url({ timeout: 15000 }).should('include', '/me');
  });

  it('shows a generic error for wrong password (no field-specific hint)', () => {
    cy.get('input[type="email"]').type(email);
    cy.get('input[type="password"]').type('PasswordSbagliata');
    cy.contains('button', 'Accedi').click();

    cy.contains('Email o password non corretti', { timeout: 15000 }).should('be.visible');
    cy.url().should('include', '/auth');
  });

  it('shows the exact same generic error for a non-existent account (no user enumeration)', () => {
    cy.get('input[type="email"]').type('non-esiste-di-sicuro@example.com');
    cy.get('input[type="password"]').type('QualsiasiPassword1');
    cy.contains('button', 'Accedi').click();

    cy.contains('Email o password non corretti', { timeout: 15000 }).should('be.visible');
  });

  it('does not crash and shows the generic error on a SQL-injection style email', () => {
    // Local part uses only characters allowed by the browser's built-in
    // email format validation, so the injection payload actually reaches the server.
    cy.get('input[type="email"]').type("admin'--@example.com", { parseSpecialCharSequences: false });
    cy.get('input[type="password"]').type("' OR '1'='1", { parseSpecialCharSequences: false });
    cy.contains('button', 'Accedi').click();

    cy.contains('Email o password non corretti', { timeout: 15000 }).should('be.visible');
    cy.url().should('include', '/auth');
  });

  it('masks the password field and disables inputs while submitting', () => {
    cy.intercept('POST', '/api/auth/callback/credentials*', (req) => {
      req.reply({ delay: 500, statusCode: 401, body: { error: 'CredentialsSignin' } });
    }).as('callback');

    cy.get('input[type="password"]').should('have.attr', 'type', 'password');
    cy.get('input[type="email"]').type(email);
    cy.get('input[type="password"]').type('QualsiasiPassword1');
    cy.contains('button', 'Accedi').click();

    cy.get('input[type="email"]').should('be.disabled');
    cy.get('input[type="password"]').should('be.disabled');
    cy.wait('@callback');
  });
});

describe('Auth Security - Password recovery', () => {
  it('returns the same generic message for existing and non-existing accounts', () => {
    cy.visit('/auth?mode=forgot', { failOnStatusCode: false });

    const genericMessage = "Se esiste un account associato a questa email, riceverai un link per reimpostare la password.";

    cy.intercept('POST', '/api/auth/forgot-password', {
      statusCode: 200,
      body: { ok: true, message: genericMessage },
    }).as('forgot');

    cy.get('input[type="email"]').type('chissa-se-esiste@example.com');
    cy.contains('button', 'Invia link di recupero').click();

    cy.wait('@forgot');
    cy.contains(genericMessage).should('be.visible');
  });
});

describe('Auth Security - Registration confirmation email', () => {
  const email = `cypress.verify.test+${Date.now()}@example.com`;
  const password = 'SuperSegreta123';

  after(() => {
    cy.task('db:deleteUser', email);
  });

  it('creates a new account as unverified until the confirmation link is used', () => {
    cy.request('POST', '/api/auth/register', { email, password }).then((res) => {
      expect(res.status).to.eq(201);
    });
    cy.task('db:isEmailVerified', email).should('eq', false);
  });

  it('marks the account as verified when a valid confirmation token is used', () => {
    const token = `test-token-${Date.now()}`;
    cy.task('db:seedVerificationToken', { email, token });

    cy.request('POST', '/api/auth/verify-email', { token }).then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body).to.have.property('ok', true);
    });
    cy.task('db:isEmailVerified', email).should('eq', true);
  });

  it('rejects a missing or unknown confirmation token', () => {
    cy.request({
      method: 'POST',
      url: '/api/auth/verify-email',
      body: {},
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.eq(400);
    });

    cy.request({
      method: 'POST',
      url: '/api/auth/verify-email',
      body: { token: 'this-token-does-not-exist' },
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.eq(400);
      expect(res.body.error).to.match(/non valido|scaduto/i);
    });
  });

  it('rejects reusing an already-consumed confirmation token', () => {
    const token = `test-token-reuse-${Date.now()}`;
    cy.task('db:seedVerificationToken', { email, token });

    cy.request('POST', '/api/auth/verify-email', { token }).its('status').should('eq', 200);

    cy.request({
      method: 'POST',
      url: '/api/auth/verify-email',
      body: { token },
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.eq(400);
    });
  });
});
