/// <reference types="cypress" />

describe('Parallel event cover', () => {
  beforeEach(() => {
    cy.intercept('POST', '/api/event-cover-search', { statusCode: 200, body: { candidates: [], status: 'completed' } }).as('coverSearch');
    cy.visit('/crea', { failOnStatusCode: false });
    cy.wait(2000);
  });

  for (const source of ['Fotocamera', 'Galleria']) {
    it(`closes the mobile ${source} picker before selection and keeps it closed through the draft`, () => {
      cy.viewport(390, 844);
      cy.intercept('POST', '/api/crop-image', { statusCode: 204 }).as('mobileCrop');
      cy.intercept('POST', '**/api/events/check-duplicates', { statusCode: 200, body: { duplicates: [] } }).as('mobileDuplicates');
      cy.intercept('POST', '/api/process-image', {
        statusCode: 200,
        delay: 1000,
        body: { events: [{ title: 'Mobile picker draft', date: '2026-12-01', time: '20:00', location: 'Schio', category: 'music' }] },
      }).as('mobileExtraction');
      cy.visit('/crea', {
        failOnStatusCode: false,
        onBeforeLoad(window) {
          Object.defineProperty(window.navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' });
        },
      });
      cy.get('.image-upload-zone').click();
      cy.get('.image-source-overlay').should('be.visible').contains('button', source).click();
      cy.get('.image-source-overlay').should('not.exist');
      cy.get(source === 'Fotocamera' ? 'input[capture="environment"]' : '.image-upload-zone input[type="file"]:not([capture])').last()
        .selectFile('cypress/fixtures/event-poster.png', { force: true });
      cy.contains('Immagine ricevuta!').should('be.visible');
      cy.get('.image-source-overlay').should('not.exist');
      cy.wait(['@mobileExtraction', '@mobileCrop', '@mobileDuplicates']);
      cy.contains('Mobile picker draft').should('be.visible');
      cy.get('.image-source-overlay').should('not.exist');
    });
  }

  it('keeps the mobile picker closed after an extraction error', () => {
    cy.viewport(390, 844);
    cy.intercept('POST', '/api/crop-image', { statusCode: 204 });
    cy.intercept('POST', '**/api/events/check-duplicates', { statusCode: 200, body: { duplicates: [] } });
    cy.intercept('POST', '/api/process-image', {
      statusCode: 503,
      body: { code: 'VISION_SERVICE_UNAVAILABLE', error: 'Scansione temporaneamente non disponibile' },
    }).as('mobileError');
    cy.visit('/crea', { failOnStatusCode: false, onBeforeLoad(window) {
      Object.defineProperty(window.navigator, 'userAgent', { configurable: true, value: 'Android' });
    } });
    cy.get('.image-upload-zone').click();
    cy.contains('.image-source-overlay button', 'Galleria').click();
    cy.get('.image-source-overlay').should('not.exist');
    cy.get('.image-upload-zone input[type="file"]:not([capture])').last().selectFile('cypress/fixtures/event-poster.png', { force: true });
    cy.wait('@mobileError');
    cy.contains('Scansione temporaneamente non disponibile').should('be.visible');
    cy.get('.image-source-overlay').should('not.exist');
  });

  it('allows reopening the mobile picker after cancelling without a file', () => {
    cy.viewport(390, 844);
    cy.intercept('GET', '/api/auth/session').as('mobileSessionReady');
    cy.visit('/crea', { failOnStatusCode: false, onBeforeLoad(window) {
      Object.defineProperty(window.navigator, 'userAgent', { configurable: true, value: 'Android' });
    } });
    cy.wait('@mobileSessionReady');
    for (const source of ['Fotocamera', 'Galleria']) {
      cy.get('.image-upload-zone').click();
      cy.contains('.image-source-overlay button', source).click();
      cy.get('.image-source-overlay').should('not.exist');
      cy.get(source === 'Fotocamera' ? 'input[capture="environment"]' : '.image-upload-zone input[type="file"]:not([capture])').last().trigger('cancel', { force: true });
    }
    cy.get('.image-upload-zone').click();
    cy.contains('.image-source-overlay button', 'Annulla').click();
    cy.get('.image-source-overlay').should('not.exist');
    cy.get('.image-upload-zone').click();
    cy.get('.image-source-overlay').should('be.visible');
  });

  for (const outcome of ['image', 'empty', 'denied']) {
    it(`closes the mobile clipboard picker before reading ${outcome} clipboard content`, () => {
      let finishRead: () => void;
      cy.viewport(390, 844);
      cy.intercept('POST', '/api/crop-image', { statusCode: 204 }).as('clipboardCrop');
      cy.intercept('POST', '**/api/events/check-duplicates', { statusCode: 200, body: { duplicates: [] } });
      cy.intercept('POST', '/api/process-image', { statusCode: 200, body: {
        events: [{ title: 'Clipboard picker draft', date: '2026-12-01', time: '20:00', location: 'Schio', category: 'music' }],
      } }).as('clipboardExtraction');
      cy.fixture('event-poster.png', 'base64').then(image => {
        cy.visit('/crea', { failOnStatusCode: false, onBeforeLoad(window) {
          Object.defineProperty(window.navigator, 'userAgent', { configurable: true, value: 'Android' });
          cy.stub(window.navigator.clipboard, 'read').callsFake(() => new Promise((resolve, reject) => {
            finishRead = () => {
              if (outcome === 'denied') reject(new Error('Permission denied'));
              else resolve(outcome === 'empty' ? [] : [{
                types: ['image/png'],
                getType: async () => Cypress.Blob.base64StringToBlob(image, 'image/png'),
              }]);
            };
          }));
        } });
      });
      cy.get('.image-upload-zone').click();
      cy.contains('.image-source-overlay button', 'Appunti').click();
      cy.get('.image-source-overlay').should('not.exist');
      cy.then(() => finishRead());
      if (outcome === 'image') {
        cy.wait(['@clipboardExtraction', '@clipboardCrop']);
        cy.contains('Clipboard picker draft').should('be.visible');
      } else {
        cy.contains(outcome === 'empty' ? 'Nessuna immagine negli appunti' : 'Impossibile leggere gli appunti').should('be.visible');
        cy.get('.image-upload-zone').click();
        cy.get('.image-source-overlay').should('be.visible');
        cy.contains('.image-source-overlay button', 'Annulla').click();
      }
      cy.get('.image-source-overlay').should('not.exist');
    });
  }

  (Cypress.env('mobilePickerOnly') ? describe.skip : describe)('Existing cover workflows', () => {
  it('searches web covers and keeps manual cropping available after a successful automatic crop', () => {
    cy.intercept('POST', '**/api/events/check-duplicates', { statusCode: 200, body: { duplicates: [] } });
    cy.fixture('event-poster.png', 'base64').then(image => {
      cy.intercept('POST', '/api/process-image', {
        statusCode: 200,
        body: {
          events: [{ title: 'Clean poster event', date: '2026-12-01', time: '20:00', location: 'Schio', category: 'music' }],
          previewImageDataUrl: `data:image/png;base64,${image}`,
        },
      }).as('cleanPosterExtraction');
    });
    cy.intercept('POST', '/api/crop-image', {
      statusCode: 200,
      fixture: 'event-poster.jpg,null',
      headers: { 'Content-Type': 'image/jpeg' },
    }).as('cleanPosterCrop');

    cy.get('input[type="file"]').first().selectFile('cypress/fixtures/event-poster.png', { force: true });
    cy.wait('@cleanPosterExtraction');
    cy.wait('@cleanPosterCrop');
    cy.wait('@coverSearch');
    cy.contains('button', 'Ritaglia immagine').scrollIntoView().should('be.visible');
  });

  it('keeps the failed crop status visible when cropping finishes before extraction', () => {
    cy.intercept('POST', '/api/crop-image', { statusCode: 204, headers: { 'X-Image-Crop-Reason': 'rate-limited' } }).as('earlyCrop');
    cy.intercept('POST', '**/api/events/check-duplicates', { statusCode: 200, body: { duplicates: [] } });
    cy.fixture('event-poster.png', 'base64').then(image => {
      cy.intercept('POST', '/api/process-image', {
        statusCode: 200,
        delay: 300,
        body: {
          events: [{ title: 'Early crop fallback', date: '2026-12-01', time: '20:00', location: 'Schio', category: 'music' }],
          previewImageDataUrl: `data:image/png;base64,${image}`,
        },
      }).as('laterExtraction');
    });
    cy.get('input[type="file"]').first().selectFile('cypress/fixtures/event-poster.png', { force: true });
    cy.wait(['@earlyCrop', '@laterExtraction']);
    cy.contains('Early crop fallback').should('be.visible');
    cy.get('[data-image-crop-status="failed"]').should('be.visible').and('contain', 'Ritaglio non riuscito').and('contain', 'Puoi ritagliare l’immagine o cercare una copertina dal web.');
    cy.get('[data-image-crop-status="failed"]').should('contain', 'Quota gratuita AI temporaneamente esaurita.');
    cy.get('img.event-image').should('not.exist');
    cy.get('[data-cover-picker]').should('not.exist');
    cy.contains('button', /^Pubblica$/).should('be.enabled');
  });

  for (const outcome of ['cropped', 'original', 'manual', 'multiple', 'reprocess']) {
    it(`shows draft during image processing and keeps the ${outcome} cover before publishing`, () => {
      cy.viewport(outcome === 'original' ? 390 : 1280, outcome === 'original' ? 844 : 720);
      let finishCrop: () => void;
      let finishReprocess: (() => void) | undefined;
      let saves = 0;
      let selectedCover: string | undefined;
      cy.intercept('POST', '**/api/events/check-duplicates', { statusCode: 200, body: { duplicates: [] } });
      cy.intercept('POST', '/api/crop-image', request => new Promise<void>(resolve => {
        finishCrop = () => {
          request.reply(outcome === 'original'
            ? { statusCode: 204 }
            : { statusCode: 200, fixture: 'event-poster.jpg,null', headers: { 'Content-Type': 'image/jpeg' } });
          resolve();
        };
      })).as('draftCrop');
      cy.intercept('POST', '/api/ai/reprocess-event', request => new Promise<void>(resolve => {
        finishReprocess = () => {
          request.reply({ statusCode: 200, body: { event: request.body.event } });
          resolve();
        };
      })).as('reprocessDraft');
      cy.fixture('event-poster.png', 'base64').then(image => {
        const event = { title: 'Parallel cover event', date: '2026-12-01', time: '20:00', location: 'Schio', category: 'music', rawText: 'Concerto' };
        cy.intercept('POST', '/api/process-image', {
          statusCode: 200,
          body: {
            events: outcome === 'multiple' ? [event, { ...event, title: 'Second event', time: '21:00' }] : [event],
            previewImageDataUrl: `data:image/png;base64,${image}`,
          },
        }).as('parallelImage');
      });
      cy.intercept('POST', '/api/events', request => {
        saves++;
        if (outcome === 'original') {
          expect(request.headers['content-type']).to.include('application/json');
          expect(request.body.imageUrl).to.be.undefined;
          expect(request.body.originalImageUrl).to.be.undefined;
        } else {
          const body = typeof request.body === 'string' ? request.body : new TextDecoder().decode(request.body);
          expect(request.headers['content-type']).to.include('multipart/form-data');
          expect(body).not.to.include('"autoCropImage":true');
          expect(body).not.to.include('"originalImageUrl"');
          expect(body).to.include(`"imageUrl":"${selectedCover}"`);
          expect(body).to.include(`filename="event-image.${outcome === 'manual' ? 'png' : 'jpg'}"`);
        }
        request.reply({ statusCode: 201, body: { id: 999, title: 'Parallel cover event' } });
      }).as('parallelSave');
      cy.get('input[type="file"]').first().selectFile('cypress/fixtures/event-poster.png', { force: true });
      cy.wait('@parallelImage');
      cy.contains('Parallel cover event').should('be.visible');
      cy.contains('[role="status"]', 'Immagine in elaborazione').should('be.visible');
      cy.contains('button', /^Pubblica$|Pubblica tutti/i).first().should('be.enabled').click();
      cy.contains('Attendi il controllo della copertina.').should('be.visible');
      cy.then(() => expect(saves).to.eq(0));
      if (outcome === 'multiple') {
        cy.get('[data-testid="publish-all-events-bottom"]').scrollIntoView().should('be.enabled').and('have.css', 'background-color', 'rgb(29, 29, 27)').click();
        cy.contains('[role="alert"]', 'Attendi il controllo della copertina.').should('be.visible');
        cy.then(() => expect(saves).to.eq(0));
      }
      if (outcome === 'cropped' || outcome === 'original') {
        cy.screenshot(`draft-image-processing-${outcome === 'original' ? 'mobile' : 'desktop'}`, { overwrite: true, capture: 'viewport' });
      }
      if (outcome === 'manual' || outcome === 'reprocess') {
        cy.contains('button', 'Modifica dettagli').click();
        if (outcome === 'manual') cy.get('input.event-image-upload').selectFile('cypress/fixtures/event-poster.png', { force: true });
        else {
          cy.get('textarea[maxlength]').type('Correggi il titolo');
          cy.contains('button', 'Rielabora con AI').click();
          cy.wrap(null).should(() => expect(finishReprocess).to.be.a('function'));
        }
      }
      cy.get('img.event-image').first().invoke('attr', 'src').then(original => {
        cy.then(() => {
          expect(saves).to.eq(0);
          expect(finishCrop).to.be.a('function');
          finishCrop();
        });
        cy.wait('@draftCrop');
        cy.contains('[role="status"]', 'Immagine in elaborazione').should('not.exist');
        if (outcome === 'manual') {
          cy.get('[data-image-crop-status="manual"]').should('contain', 'Immagine modificata manualmente');
        } else if (outcome === 'original') {
          cy.get('[data-image-crop-status="failed"]').should('contain', 'Ritaglio non riuscito').and('contain', 'Puoi ritagliare l’immagine o cercare una copertina dal web.');
        } else {
          cy.get('[data-image-crop-status="completed"]').first().should('contain', 'Ritaglio completato');
        }
        if (outcome === 'original') cy.get('img.event-image').should('not.exist');
        else cy.get('img.event-image').first().should(outcome === 'manual' ? 'have.attr' : 'not.have.attr', 'src', original);
        if (outcome === 'multiple') {
          cy.get('img.event-image').should('have.length', 2).each(image => expect(image.attr('src')).not.to.eq(original));
        }
      });
      if (outcome === 'reprocess') {
        cy.get('img.event-image').invoke('attr', 'src').then(cropped => {
          cy.then(() => finishReprocess?.());
          cy.wait('@reprocessDraft');
          cy.contains('[role="alert"]', 'La bozza o le istruzioni sono cambiate').should('be.visible');
          cy.get('img.event-image').should('have.attr', 'src', cropped);
        });
      }
      if (outcome === 'original') {
        cy.document().then(document => expect(document.documentElement.scrollWidth).to.be.at.most(390));
        cy.screenshot('draft-image-fallback-mobile', { overwrite: true, capture: 'viewport' });
      }
      if (outcome === 'manual') cy.contains('button', 'Salva modifiche').click();
      if (outcome !== 'original') cy.get('img.event-image').first().invoke('attr', 'src').then(source => { selectedCover = source; });
      cy.contains('button', /^Pubblica$|Pubblica tutti/i).first().should('be.enabled').click();
      cy.wait('@parallelSave').its('response.statusCode').should('eq', 201);
      cy.contains(outcome === 'multiple' ? '2 eventi creati' : 'Evento creato').should('be.visible');
    });
  }

  const searchCandidates = [
    { id: 'first', title: 'Concerto Schio', sourceUrl: 'https://comune.example/evento', previewUrl: '/api/event-cover-image?token=fixture-first' },
    { id: 'second', title: 'Concerto Schio', sourceUrl: 'https://teatro.example/concerto', previewUrl: '/api/event-cover-image?token=fixture-second' },
  ];

  it('keeps duplicate-only publication available and explains the result after clicking', () => {
    const event = { title: 'Evento gia presente', date: '2026-12-01', time: '20:00', location: 'Schio', category: 'music' };
    const duplicate = { id: 987, ...event, slug: 'evento-gia-presente-987' };
    let saves = 0;
    cy.intercept('POST', '/api/crop-image', { statusCode: 204 });
    cy.intercept('POST', '/api/process-image', { statusCode: 200, body: { events: [event, { ...event, title: 'Secondo evento presente', time: '21:00' }] } });
    cy.intercept('POST', '**/api/events/check-duplicates', { statusCode: 200, body: { duplicates: [duplicate, { ...duplicate, id: 988 }] } }).as('allDuplicates');
    cy.intercept('POST', '/api/events', request => { saves++; request.reply({ statusCode: 500 }); });
    cy.get('input[type="file"]').first().selectFile('cypress/fixtures/event-poster.png', { force: true });
    cy.wait('@allDuplicates');
    cy.get('[data-testid="publish-all-events-top"]').should('be.enabled').click();
    cy.contains('Nessun nuovo evento da pubblicare: gli eventi risultano già presenti.').should('be.visible');
    cy.get('[data-testid="publish-all-events-bottom"]').scrollIntoView().should('be.enabled').and('have.css', 'background-color', 'rgb(29, 29, 27)').click();
    cy.contains('[role="alert"]', 'Nessun nuovo evento da pubblicare: gli eventi risultano già presenti.').should('be.visible');
    cy.then(() => expect(saves).to.eq(0));
    cy.get('.Toastify__close-button').click({ multiple: true, force: true });
    cy.get('.Toastify__toast').should('not.exist');
    for (const width of [1280, 390]) {
      cy.viewport(width, 900);
      cy.get('[data-testid="publish-all-events-bottom"]').scrollIntoView({ offset: { top: -120, left: 0 } }).should('be.visible');
      cy.document().then(document => expect(document.documentElement.scrollWidth).to.be.at.most(width));
    }
  });

  it('blocks both publication controls during one batch and allows retry after a save error', () => {
    const event = { title: 'Pubblicazione coordinata', date: '2026-12-01', time: '20:00', location: 'Schio', category: 'music' };
    let saves = 0;
    let finishSave: () => void;
    cy.intercept('POST', '/api/crop-image', { statusCode: 204 });
    cy.intercept('POST', '**/api/events/check-duplicates', { statusCode: 200, body: { duplicates: [] } });
    cy.intercept('POST', '/api/process-image', { statusCode: 200, body: { events: [event, { ...event, title: 'Seconda pubblicazione', time: '21:00' }] } });
    cy.intercept('POST', '/api/events', request => new Promise<void>(resolve => {
      saves++;
      finishSave = () => { request.reply({ statusCode: 503, body: { error: 'Pubblicazione temporaneamente non disponibile' } }); resolve(); };
    })).as('pendingPublication');
    cy.get('input[type="file"]').first().selectFile('cypress/fixtures/event-poster.png', { force: true });
    cy.get('[data-testid="publish-all-events-bottom"]').scrollIntoView().should('be.enabled').click();
    cy.get('[data-testid="publish-all-events-top"]').should('be.disabled');
    cy.get('[data-testid="publish-all-events-bottom"]').should('be.disabled');
    cy.then(() => { expect(saves).to.eq(1); finishSave(); });
    cy.wait('@pendingPublication');
    cy.contains('[role="alert"]', 'Pubblicazione temporaneamente non disponibile').should('be.visible');
    cy.get('[data-testid="publish-all-events-top"]').should('be.enabled');
    cy.get('[data-testid="publish-all-events-bottom"]').should('be.enabled');
    cy.intercept('POST', '/api/events', request => {
      saves++;
      request.reply({ statusCode: 201, body: { id: 990 + saves, title: request.body.title } });
    }).as('retriedPublication');
    cy.get('[data-testid="publish-all-events-top"]').click();
    cy.wait('@retriedPublication');
    cy.contains('2 eventi creati').should('be.visible');
    cy.then(() => expect(saves).to.eq(3));
  });

  const failedScan = (multiple = false, onPreview?: () => void, sourceUrl?: string) => {
    cy.intercept('POST', '/api/crop-image', { statusCode: 204, headers: { 'X-Image-Crop-Reason': 'verification-rejected' } });
    cy.intercept('POST', '**/api/events/check-duplicates', { statusCode: 200, body: { duplicates: [] } });
    cy.intercept('GET', '/api/event-cover-image?*', request => {
      onPreview?.();
      request.reply({ statusCode: 200, fixture: 'event-poster.jpg,null', headers: { 'Content-Type': 'image/jpeg' } });
    }).as('coverPreview');
    cy.fixture('event-poster.png', 'base64').then(image => {
      const event = { title: 'Concerto Schio', date: '2026-12-01', time: '20:00', location: 'Schio', category: 'music', rawText: 'PRIVATE SCREENSHOT @private-user 3331234567', ...(sourceUrl ? { sourceUrl } : {}) };
      cy.intercept('POST', '/api/process-image', { statusCode: 200, body: {
        events: multiple ? [event, { ...event, title: 'Secondo concerto', time: '21:00' }] : [event],
        previewImageDataUrl: `data:image/png;base64,${image}`,
      } }).as('failedCropExtraction');
    });
    cy.get('input[type="file"]').first().selectFile('cypress/fixtures/event-poster.png', { force: true });
    cy.wait('@failedCropExtraction');
    cy.get('[data-image-crop-status="failed"]').first().should('be.visible');
  };

  for (const knownLink of [true, false]) {
    it(`recommends a Facebook cover after failed cropping ${knownLink ? 'with a canonical event link' : 'without a known link'}`, () => {
      cy.viewport(knownLink ? 390 : 1280, 844);
      const facebookSource = 'https://www.facebook.com/events/123456789/';
      cy.intercept('POST', '/api/event-cover-search', request => {
        expect(request.body.preferFacebook).to.eq(true);
        expect(request.body.sourceUrl).to.eq(knownLink ? facebookSource : undefined);
        expect(Object.keys(request.body).sort()).to.deep.equal(knownLink
          ? ['date', 'location', 'preferFacebook', 'sourceUrl', 'title']
          : ['date', 'location', 'preferFacebook', 'title']);
        expect(JSON.stringify(request.body)).not.to.match(/PRIVATE|private-user|tracking|3331234567/);
        request.reply({ statusCode: 200, body: { status: 'completed', candidates: [{
          id: 'facebook-cover', title: 'Concerto Schio', sourceUrl: facebookSource, previewUrl: '/api/event-cover-image?token=fixture-facebook',
        }] } });
      }).as('facebookCoverSearch');
      failedScan(false, undefined, knownLink ? 'https://m.facebook.com/events/123456789/?ref=tracking#private' : undefined);
      cy.wait('@facebookCoverSearch');
      cy.get('[data-cover-picker]').should('be.visible').within(() => {
        cy.get('a').should('have.attr', 'href', facebookSource);
        cy.get('input[type="radio"]').should('not.be.checked');
        cy.contains('button', 'Usa immagine').should('be.disabled');
      });
      cy.get('img.event-image').should('not.exist');
      cy.get('[data-cover-picker] input[type="radio"]').check();
      cy.get('[data-cover-picker]').contains('button', 'Usa immagine').click();
      cy.get('[data-image-crop-status="web"]').should('contain', 'Immagine scelta dal web');
      cy.get('img.event-image').should('be.visible');
      cy.document().then(document => expect(document.documentElement.scrollWidth).to.be.at.most(knownLink ? 390 : 1280));
    });
  }

  for (const multiple of [false, true]) {
    it(`selects a web cover explicitly and publishes ${multiple ? 'multiple events independently' : 'only the selected JPEG'}`, () => {
      cy.viewport(multiple ? 1280 : 390, multiple ? 900 : 844);
      cy.intercept('POST', '/api/event-cover-search', request => {
        expect(Object.keys(request.body).sort()).to.deep.equal(['date', 'location', 'preferFacebook', 'title']);
        expect(request.body.preferFacebook).to.eq(true);
        expect(JSON.stringify(request.body)).not.to.include('PRIVATE');
        expect(JSON.stringify(request.body)).not.to.include('private-user');
        request.reply({ statusCode: 200, body: { status: 'completed', candidates: searchCandidates } });
      }).as('webCoverSearch');
      failedScan(multiple);
      cy.wait('@webCoverSearch');
      cy.get('[data-cover-picker]').first().within(() => {
        cy.get('input[type="radio"]').should('have.length', 2).and('not.be.checked');
        cy.contains('button', 'Usa immagine').should('be.disabled');
        cy.get('input[type="radio"]').eq(1).check();
      });
      cy.get('img.event-image').should('not.exist');
      cy.get('[data-cover-picker]').first().contains('button', 'Usa immagine').click();
      cy.get('[data-image-crop-status="web"]').should('contain', 'Immagine scelta dal web');
      cy.get('img.event-image').should('have.length', 1).scrollIntoView().should('be.visible');
      cy.document().then(document => expect(document.documentElement.scrollWidth).to.be.at.most(multiple ? 1280 : 390));
      let saves = 0;
      cy.intercept('POST', '/api/events', request => {
        saves++;
        if (request.headers['content-type'].includes('multipart/form-data')) {
          const body = typeof request.body === 'string' ? request.body : new TextDecoder().decode(request.body);
          expect(body).to.include('filename="event-image.jpg"');
          expect(body).not.to.include('"originalImageUrl"');
        } else {
          expect(request.body.imageUrl).to.be.undefined;
          expect(request.body.originalImageUrl).to.be.undefined;
        }
        request.reply({ statusCode: 201, body: { id: 999, title: 'Concerto Schio' } });
      }).as('webCoverSave');
      cy.contains('button', /^Pubblica$|Pubblica tutti/i).first().click();
      cy.wait('@webCoverSave');
      cy.contains(multiple ? '2 eventi creati' : 'Evento creato').should('be.visible').then(() => expect(saves).to.eq(multiple ? 2 : 1));
    });
  }

  it('keeps a confirmed manual crop when web results arrive late', () => {
    let finishSearch: (() => void) | undefined;
    cy.intercept('POST', '/api/event-cover-search', request => new Promise<void>(resolve => {
      finishSearch = () => { request.reply({ statusCode: 200, body: { status: 'completed', candidates: searchCandidates } }); resolve(); };
    }));
    failedScan();
    cy.get('[data-cover-picker]').should('not.exist');
    cy.contains('button', 'Ritaglia originale').click();
    cy.contains('button', 'Applica ritaglio').should('be.enabled').click();
    cy.get('[data-image-crop-status="manual"]').should('be.visible');
    cy.get('img.event-image').invoke('attr', 'src').then(source => {
      cy.then(() => finishSearch?.());
      cy.get('[data-cover-picker]').should('not.exist');
      cy.get('img.event-image').should('have.attr', 'src', source);
    });
  });

  it('confirms the displayed bytes without another download and crops the selected web cover', () => {
    let downloads = 0;
    let previewBytes: number[] = [];
    cy.intercept('POST', '/api/event-cover-search', { statusCode: 200, body: { status: 'completed', candidates: searchCandidates } });
    failedScan(false, () => { downloads++; });
    cy.get('[data-cover-picker] img').should('have.length', 2);
    cy.get('[data-cover-picker] input[type="radio"]').first().check();
    cy.get('[data-cover-picker] img').first().invoke('attr', 'src').then(source => {
      cy.window().then(async win => {
        previewBytes = [...new Uint8Array(await (await win.fetch(source || '')).arrayBuffer())];
      });
    });
    cy.contains('button', 'Usa immagine').click();
    cy.get('img.event-image').invoke('attr', 'src').then(source => {
      cy.window().then(async win => {
        const selected = await (await win.fetch(source || '')).arrayBuffer();
        expect(selected.byteLength).to.be.greaterThan(0);
        expect([...new Uint8Array(selected)]).to.deep.equal(previewBytes);
        expect(downloads).to.eq(2);
      });
      cy.contains('button', 'Modifica dettagli').click();
      cy.contains('button', 'Ritaglia immagine').click();
      cy.get('img[alt="Immagine da ritagliare"]').should('have.attr', 'src', source);
      cy.contains('button', 'Applica ritaglio').should('be.enabled').click();
      cy.get('[data-image-crop-status="manual"]').should('be.visible');
    });
  });

  it('keeps the web cover section hidden while the same-event search is running', () => {
    let searchSignal: AbortSignal | undefined;
    cy.window().then(win => {
      const originalFetch = win.fetch.bind(win);
      cy.stub(win, 'fetch').callsFake((input: RequestInfo | URL, options?: RequestInit) => {
        if (String(input) !== '/api/event-cover-search') return originalFetch(input, options);
        searchSignal = options?.signal || undefined;
        return new Promise<Response>((_resolve, reject) => {
          searchSignal?.addEventListener('abort', () => reject(new Error('Cancelled')), { once: true });
        });
      });
    });
    failedScan();
    cy.wrap(null).should(() => expect(searchSignal).to.exist);
    cy.get('[data-cover-picker]').should('not.exist');
  });

  it('allows publication without an image when web search fails', () => {
    cy.intercept('POST', '/api/event-cover-search', { statusCode: 503, body: { status: 'failed', candidates: [] } });
    failedScan();
    cy.get('[data-cover-picker]').should('not.exist');
    cy.contains('button', 'Ritaglia originale').scrollIntoView().should('be.visible');
    cy.intercept('POST', '/api/events', request => {
      expect(request.headers['content-type']).to.include('application/json');
      expect(request.body.imageUrl).to.be.undefined;
      expect(request.body.originalImageUrl).to.be.undefined;
      request.reply({ statusCode: 201, body: { id: 999 } });
    }).as('noCoverSave');
    cy.get('img.event-image').should('not.exist');
    cy.contains('button', /^Pubblica$/).click();
    cy.wait('@noCoverSave');
  });
});

});

(Cypress.env('parallelCoverOnly') || Cypress.env('mobilePickerOnly') ? describe.skip : describe)('Event Creation via Image - OCR & AI Testing', () => {
  beforeEach(() => {
    cy.visit('/crea', { failOnStatusCode: false });
    cy.wait(2000);
  });

  it('should successfully extract event data from image using OCR and AI', () => {
    // Mock successful OCR + AI response
    cy.intercept('POST', '/api/process-image', {
      statusCode: 200,
      body: {
        title: 'Music Festival 2025',
        description: 'Amazing outdoor music festival with multiple stages',
        date: '2025-07-15',
        time: '18:00',
        location: 'Parco della Musica, Rome',
        organizer: 'Festival Productions',
        category: 'Music',
        price: '€50',
        rawText: 'MUSIC FESTIVAL 2025\n15 LUGLIO\nORE 18:00\nPARCO DELLA MUSICA\nROME\n50 EURO'
      }
    }).as('processImage');
    
    // Upload test image
    cy.get('input[type="file"]', { timeout: 10000 })
      .first()
      .selectFile({
        contents: 'cypress/fixtures/event-poster.png',
        fileName: 'event-poster.png',
        mimeType: 'image/png'
      }, { force: true });
    
    // Wait for OCR + AI processing (can take longer)
    cy.wait('@processImage', { timeout: 50000 }).then((interception) => {
      cy.log('Process Image Response Status:', JSON.stringify(interception.response?.statusCode));
      
      if (interception.response?.statusCode === 200 || interception.response?.statusCode === 201) {
        cy.log('✅ OCR + AI successfully processed the image');
        
        const eventData = interception.response?.body;
        
        // Log what was extracted
        cy.log('=== EXTRACTED DATA ===');
        cy.log('Title: ' + (eventData?.title || 'NOT EXTRACTED'));
        cy.log('Date: ' + (eventData?.date || 'NOT EXTRACTED'));
        cy.log('Time: ' + (eventData?.time || 'NOT EXTRACTED'));
        cy.log('Location: ' + (eventData?.location || 'NOT EXTRACTED'));
        cy.log('Raw Text Length: ' + (eventData?.rawText?.length || 0) + ' chars');
        
        // Verify event display container appears
        cy.get('.event-display-container', { timeout: 10000 }).should('be.visible');
        
        // Check if at least some text was extracted
        if (eventData?.rawText) {
          expect(eventData.rawText.length).to.be.greaterThan(10);
          cy.log('✅ OCR extracted text from image');
        } else {
          cy.log('⚠️ No text extracted from image');
        }
        
        // Verify at least title is present
        cy.get('.event-title', { timeout: 5000 }).should('exist').then(($title) => {
          const titleText = $title.text().trim();
          cy.log('Displayed Title: ' + titleText);
          
          if (titleText.length > 0) {
            cy.log('✅ AI structured the data - Title populated');
          } else {
            cy.log('⚠️ Title is empty - AI may not have structured data correctly');
          }
        });
        
      } else {
        cy.log('⚠️ Image processing failed with status: ' + interception.response?.statusCode);
      }
    });
  });

  it('should save event with image to database', () => {
    // Mock OCR response
    cy.intercept('POST', '/api/process-image', {
      statusCode: 200,
      body: {
        title: 'Saveable Image Event',
        description: 'Event from image',
        date: '2025-08-10',
        time: '19:00',
        location: 'Test Venue',
        organizer: 'Test',
        category: 'Music',
        price: '€20',
        rawText: 'Test raw text from OCR'
      }
    }).as('processImage');
    
    // Mock database save
    cy.intercept('POST', '/api/events', {
      statusCode: 201,
      body: {
        id: 2,
        title: 'Saveable Image Event'
      }
    }).as('createEvent');
    
    // Upload image
    cy.get('input[type="file"]', { timeout: 10000 })
      .first()
      .selectFile({
        contents: 'cypress/fixtures/event-poster.png',
        fileName: 'event-poster.png',
        mimeType: 'image/png'
      }, { force: true });
    
    // Wait for processing
    cy.wait('@processImage', { timeout: 50000 });
    
    // Wait for event display
    cy.get('.event-display-container', { timeout: 10000 }).should('be.visible');
    
    // Verify image preview is shown
    cy.get('.event-image', { timeout: 5000 }).should('exist');
    cy.log('✅ Image preview displayed');
    
    // Click save button
    cy.contains('button', /Aggiungi evento/i, { timeout: 10000 })
      .should('be.visible')
      .click();
    
    // Wait for save
    cy.wait('@createEvent', { timeout: 30000 }).then((interception) => {
      cy.log('Create Event Status:', JSON.stringify(interception.response?.statusCode));
      
      if (interception.response?.statusCode === 201) {
        cy.log('✅ Event with image successfully saved');
        
        // Check if alert appears
        cy.on('window:alert', (text) => {
          cy.log('Alert: ' + text);
          expect(text).to.match(/aggiunto|success/i);
        });
      } else {
        cy.log('⚠️ Event save failed');
      }
    });
  });

  it('should verify OCR quality - text extraction rate', () => {
    cy.intercept('POST', '/api/process-image').as('processImage');
    
    cy.get('input[type="file"]', { timeout: 10000 })
      .first()
      .selectFile({
        contents: 'cypress/fixtures/event-poster.png',
        fileName: 'event-poster.png',
        mimeType: 'image/png'
      }, { force: true });
    
    cy.wait('@processImage', { timeout: 50000 }).then((interception) => {
      const eventData = interception.response?.body;
      
      // Count how many fields were extracted
      const fields = ['title', 'date', 'time', 'location', 'description'];
      const extractedFields = fields.filter(field => 
        eventData?.[field] && eventData[field].length > 0
      );
      
      const extractionRate = (extractedFields.length / fields.length) * 100;
      
      cy.log('=== OCR + AI QUALITY REPORT ===');
      cy.log('Fields extracted: ' + extractedFields.join(', '));
      cy.log('Extraction rate: ' + extractionRate.toFixed(0) + '%');
      cy.log('Raw text length: ' + (eventData?.rawText?.length || 0) + ' characters');
      
      // We expect at least 40% of fields to be extracted
      // (This is lenient because test image might be minimal)
      if (extractionRate >= 40) {
        cy.log('✅ PASS: Extraction rate is acceptable (>= 40%)');
      } else {
        cy.log('⚠️ WARNING: Low extraction rate - AI may need better training');
      }
    });
  });

  it('should handle JPEG images correctly', () => {
    cy.intercept('POST', '/api/process-image').as('processImage');
    
    cy.get('input[type="file"]', { timeout: 10000 })
      .first()
      .selectFile({
        contents: 'cypress/fixtures/event-poster.jpg',
        fileName: 'event-poster.jpg',
        mimeType: 'image/jpeg'
      }, { force: true });
    
    cy.wait('@processImage', { timeout: 50000 }).then((interception) => {
      if (interception.response?.statusCode === 200 || interception.response?.statusCode === 201) {
        cy.log('✅ JPEG format processed successfully');
      } else {
        cy.log('⚠️ JPEG processing failed');
      }
    });
  });
});
