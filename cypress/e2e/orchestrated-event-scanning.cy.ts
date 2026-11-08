/// <reference types="cypress" />

describe('Orchestrated draft rescanning', () => {
  const event = {
    title: 'Concerto in piazza',
    description: 'Musica dal vivo in centro.',
    date: '2026-12-10',
    time: '20:00',
    location: 'Teatro Civico di Schio',
    organizer: 'Comune',
    category: 'musica',
    price: 'Gratuito',
    rawText: 'CONCERTO IN PIAZZA',
    sourceUrl: 'https://events.example/concerto',
  };

  it('discards stale responses and applies a rescan proposal only to the draft until explicit publication', () => {
    let finishFirstRescan: (() => void) | undefined;
    let rescans = 0;
    let publications = 0;
    cy.intercept('GET', '/api/auth/session', { statusCode: 200, body: {} });
    cy.intercept('GET', '/api/events?*', { statusCode: 200, body: [] });
    cy.intercept('POST', '/api/process-link', { statusCode: 200, body: { events: [event] } }).as('initialScan');
    cy.intercept('POST', '**/api/events/check-duplicates', { statusCode: 200, body: { duplicates: [] } });
    cy.intercept('POST', '/api/ai/rescan-event', request => {
      rescans++;
      expect(request.body.event.title).to.eq(event.title);
      if (rescans === 1) {
        return new Promise<void>(resolve => {
          finishFirstRescan = () => {
            request.reply({ statusCode: 200, body: { status: 'matched', proposal: { time: '21:00' } } });
            resolve();
          };
        });

      }
      request.reply({ statusCode: 200, body: { status: 'matched', proposal: { time: '22:00' } } });
    }).as('rescan');
    cy.intercept('POST', '/api/events', request => {
      publications++;
      expect(request.body.time).to.eq('22:00');
      request.reply({ statusCode: 201, body: { id: 8, slug: 'concerto-8' } });
    }).as('publishDraft');
    cy.visit('/crea', {
      onBeforeLoad(window) {
        window.localStorage.setItem('eventscanner:autopublish', '0');
      },
    });
    cy.get('input[type="url"]').type(event.sourceUrl);
    cy.contains('button', 'Estrai evento').click();
    cy.wait('@initialScan');
    cy.contains(event.title).should('be.visible');
    cy.contains('button', 'Modifica dettagli').click();
    cy.contains('button', 'Riscansiona fonte').click();
    cy.wrap(null).should(() => expect(finishFirstRescan).to.be.a('function'));
    cy.get('input[name="time"]').clear().type('20:30');
    cy.then(() => finishFirstRescan?.());
    cy.wait('@rescan');
    cy.contains('[role="alert"]', 'bozza è cambiata durante la riscansione').should('be.visible');
    cy.get('input[name="time"]').should('have.value', '20:30');
    cy.then(() => expect(publications).to.eq(0));

    cy.contains('button', 'Riscansiona fonte').click();
    cy.wait('@rescan');
    cy.get('input[name="time"]').should('have.value', '22:00');
    cy.contains('Proposta applicata a questa bozza').should('be.visible');
    cy.then(() => expect(publications).to.eq(0));
    cy.contains('button', 'Salva modifiche').click();
    cy.get('[data-testid="publish-all-events-top"]').click();
    cy.wait('@publishDraft');
    cy.then(() => expect(publications).to.eq(1));
  });

  it('keeps distinct activities that share the same date and time', () => {
    const secondEvent = {
      ...event,
      title: 'Mostra fotografica',
      location: 'Palazzo Toaldi Capra',
    };
    cy.intercept('GET', '/api/auth/session', { statusCode: 200, body: {} });
    cy.intercept('GET', '/api/events?*', { statusCode: 200, body: [] });
    cy.intercept('POST', '/api/process-link', { statusCode: 200, body: { events: [event, secondEvent] } }).as('sameDayScan');
    cy.intercept('POST', '**/api/events/check-duplicates', { statusCode: 200, body: { duplicates: [] } });
    cy.visit('/crea', {
      onBeforeLoad(window) {
        window.localStorage.setItem('eventscanner:autopublish', '0');
      },
    });
    cy.get('input[type="url"]').type(event.sourceUrl);
    cy.contains('button', 'Estrai evento').click();
    cy.wait('@sameDayScan');
    cy.contains(event.title).should('be.visible');
    cy.contains(secondEvent.title).should('be.visible');
  });

  it('updates only the selected draft when multiple events are available', () => {
    const secondEvent = {
      ...event,
      title: 'Mostra fotografica',
      time: '18:00',
      location: 'Palazzo Toaldi Capra',
    };
    cy.intercept('GET', '/api/auth/session', { statusCode: 200, body: {} });
    cy.intercept('GET', '/api/events?*', { statusCode: 200, body: [] });
    cy.intercept('POST', '/api/process-link', { statusCode: 200, body: { events: [event, secondEvent] } }).as('multipleScan');
    cy.intercept('POST', '**/api/events/check-duplicates', { statusCode: 200, body: { duplicates: [] } });
    cy.intercept('POST', '/api/ai/rescan-event', request => {
      expect(request.body.event.title).to.eq(event.title);
      request.reply({ statusCode: 200, body: { status: 'matched', proposal: { time: '22:00' } } });
    }).as('selectedRescan');
    cy.visit('/crea', {
      onBeforeLoad(window) {
        window.localStorage.setItem('eventscanner:autopublish', '0');
      },
    });
    cy.get('input[type="url"]').type(event.sourceUrl);
    cy.contains('button', 'Estrai evento').click();
    cy.wait('@multipleScan');
    cy.contains(event.title).should('be.visible');
    cy.contains(secondEvent.title).should('be.visible');
    cy.get('[data-testid="event-draft-card"]').first().within(() => {
      cy.contains(event.title).should('be.visible');
      cy.contains('button', 'Modifica dettagli').click();
      cy.contains('button', 'Riscansiona fonte').click();
    });
    cy.wait('@selectedRescan');
    cy.get('[data-testid="event-draft-card"]').first().within(() => {
      cy.get('input[name="time"]').should('have.value', '22:00');
      cy.contains('button', 'Salva modifiche').click();
    });
    cy.get('[data-testid="event-draft-card"]').last().within(() => {
      cy.contains('button', 'Modifica dettagli').click();
      cy.get('input[name="time"]').should('have.value', secondEvent.time);
    });
  });

  it('keeps a program-page preview separate from each event cover', () => {
    const pdfUrl = 'https://events.example/program.pdf';
    cy.intercept('GET', '/api/auth/session', { statusCode: 200, body: {} });
    cy.intercept('GET', '/api/events?*', { statusCode: 200, body: [] });
    cy.intercept('POST', '/api/events/check-duplicates', { statusCode: 200, body: { duplicates: [] } });
    cy.fixture('event-poster.png', 'base64').then(image => {
      cy.intercept('POST', '/api/process-pdf', {
        statusCode: 200,
        body: {
          events: [{ ...event, sourceUrl: pdfUrl }],
          previewImageDataUrl: `data:image/png;base64,${image}`,
          debug: { scanStatus: 'completed', scanCounts: { candidates: 1, completed: 1, failed: 0, pending: 0 } },
        },
      }).as('pdfScan');
    });
    cy.visit('/crea', {
      onBeforeLoad(window) {
        window.localStorage.setItem('eventscanner:autopublish', '0');
      },
    });
    cy.get('input[type="url"]').type(pdfUrl);
    cy.contains('button', 'Estrai evento').click();
    cy.wait('@pdfScan');
    cy.get('[data-testid="event-draft-card"]').within(() => {
      cy.contains(event.title).should('be.visible');
      cy.get('img').should('not.exist');
    });
  });
});

describe('Manual crop privacy', () => {
  const openDraftCropper = () => {
    cy.intercept('GET', '/api/auth/session', {
      statusCode: 200,
      body: { user: { id: '7', email: 'crop-user@example.test' } },
    }).as('cropSession');
    cy.intercept('GET', '/api/events?*', { statusCode: 200, body: [] });
    cy.intercept('POST', '/api/crop-image', { statusCode: 204 }).as('automaticCrop');
    cy.intercept('POST', '/api/events/check-duplicates', { statusCode: 200, body: { duplicates: [] } });
    cy.intercept('POST', '/api/scan-learning/crop-sample', request => {
      expect(request.headers['content-type']).to.include('multipart/form-data');
      request.reply({ statusCode: 204 });
    }).as('cropLearning');
    cy.fixture('event-poster.png', 'base64').then(image => {
      cy.intercept('POST', '/api/process-image', {
        statusCode: 200,
        body: {
          events: [{ title: 'Consent crop draft', date: '2026-12-10', time: '20:00', location: 'Schio' }],
          previewImageDataUrl: `data:image/png;base64,${image}`,
        },
      }).as('cropExtraction');
    });
    cy.visit('/crea', {
      onBeforeLoad(window) {
        window.localStorage.setItem('eventscanner:autopublish', '0');
      },
    });
    cy.wait('@cropSession');
    cy.get('input[type="file"]').first().selectFile('cypress/fixtures/event-poster.png', { force: true });
    cy.wait(['@cropExtraction', '@automaticCrop']);
    cy.contains('Consent crop draft').should('be.visible');
    cy.contains('button', 'Ritaglia originale').click();
    cy.get('[role="dialog"]').should('be.visible');
  };

  it('applies a manual crop without asking for consent or submitting a sample', () => {
    openDraftCropper();
    cy.contains('label', 'Acconsento a conservare privatamente').should('not.exist');
    cy.contains('button', 'Applica ritaglio').click();
    cy.get('[data-image-crop-status="manual"]').should('be.visible');
    cy.get('@cropLearning.all').should('have.length', 0);
  });
});
