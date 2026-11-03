/// <reference types="cypress" />

const describeByTitle = (title: string, suite: () => void) => {
  const grep = Cypress.env('grep') as string | undefined;
  (grep && !new RegExp(grep).test(title) ? describe.skip : describe)(title, suite);
};

describeByTitle('Event Creation via Link - AI Testing', () => {
  beforeEach(() => {
    cy.visit('/crea', { failOnStatusCode: false });
    cy.wait(2000);
  });

  it('should successfully extract event data from a link using AI', () => {
    // Mock successful API response
    cy.intercept('POST', '/api/process-link', {
      statusCode: 200,
      body: {
        events: [{
          title: 'Test Concert Event',
          description: 'Live music performance',
          date: '2025-12-20',
          time: '21:00',
          location: 'Test Arena, Milan',
          organizer: 'Test Productions',
          category: 'Music',
          price: '€30',
          rawText: 'Mock event text'
        }],
        imageUrl: 'https://example.com/event.jpg'
      }
    }).as('processLink');
    
    // Enter a test URL
    cy.get('input[type="url"]', { timeout: 10000 })
      .should('be.visible')
      .clear()
      .type('https://www.dice.fm/event/test-concert-2025');
    
    // Click the extract button
    cy.contains('button', /Extract Event/i).click();
    
    // Wait for AI processing (with longer timeout)
    cy.wait('@processLink', { timeout: 40000 }).then((interception) => {
      cy.log('Process Link Response:', JSON.stringify(interception.response?.statusCode));
      
      // Check if request was successful
      if (interception.response?.statusCode === 200 || interception.response?.statusCode === 201) {
        cy.log('✅ AI successfully processed the link');
        
        // Verify event data is displayed
        cy.get('.event-display-container', { timeout: 10000 }).should('be.visible');
        
        // Check that at least title is extracted
        cy.get('.event-title', { timeout: 5000 }).should('exist').then(($title) => {
          const titleText = $title.text().trim();
          cy.log('Extracted Title: ' + titleText);
          expect(titleText.length).to.be.greaterThan(0);
        });
        
      } else {
        cy.log('⚠️ AI processing returned status: ' + interception.response?.statusCode);
      }
    });
  });

  it('should allow saving the extracted event to database', () => {
    // Mock process-link response
    cy.intercept('POST', '/api/process-link', {
      statusCode: 200,
      body: {
        events: [{
          title: 'Saveable Event',
          description: 'Event for database test',
          date: '2025-12-25',
          time: '20:00',
          location: 'Test Location',
          organizer: 'Test Org',
          category: 'Test',
          price: '€10',
          rawText: 'Test data'
        }],
        imageUrl: null
      }
    }).as('processLink');
    
    // Mock database save response
    cy.intercept('POST', '/api/events', {
      statusCode: 201,
      body: {
        id: 1,
        title: 'Saveable Event',
        createdAt: new Date().toISOString()
      }
    }).as('createEvent');
    
    // Process a link
    cy.get('input[type="url"]', { timeout: 10000 })
      .clear()
      .type('https://www.eventbrite.com/e/test-event-tickets');
    
    cy.contains('button', /Extract Event/i).click();
    cy.wait('@processLink', { timeout: 40000 });
    
    // Wait for event display
    cy.get('.event-display-container', { timeout: 10000 }).should('be.visible');
    
    // Click "Aggiungi evento" button
    cy.contains('button', /Aggiungi evento/i, { timeout: 10000 }).should('be.visible').click();
    
    // Wait for save
    cy.wait('@createEvent', { timeout: 30000 }).then((interception) => {
      cy.log('Create Event Response:', JSON.stringify(interception.response?.statusCode));
      
      if (interception.response?.statusCode === 201) {
        cy.log('✅ Event successfully saved to database');
      } else {
        cy.log('⚠️ Event save failed with status: ' + interception.response?.statusCode);
      }
    });
  });

  it('should handle invalid or empty URLs gracefully', () => {
    // Try with empty URL
    cy.contains('button', /Extract Event/i).click();
    
    // Should stay on same page
    cy.url().should('include', '/crea');
    cy.wait(1000);
    
    // Try with invalid URL
    cy.get('input[type="url"]', { timeout: 10000 })
      .clear()
      .type('not-a-valid-url');
    
    cy.contains('button', /Extract Event/i).click();
    cy.wait(2000);
    
    // Should handle gracefully
    cy.url().should('include', '/crea');
  });
});

describeByTitle('Fullscreen 3D scanning', () => {
  const scene = '[data-scan-scene]';
  const draft = { title: 'Scansione mock 3D', date: '2026-12-20', time: '21:00', location: 'Schio', category: 'music' };
  const submitLink = (url = 'https://example.com/evento') => {
    cy.get('input[type="url"]').clear().type(url);
    cy.contains('button', 'Estrai evento').click();
  };
  const visit = (onBeforeLoad?: (window: Cypress.AUTWindow) => void, path = '/crea') => {
    cy.visit(path, { onBeforeLoad(window) {
      window.localStorage.setItem('eventscanner:autopublish', '0');
      onBeforeLoad?.(window);
    } });
    cy.wait('@scanSession');
    cy.get('[data-testid="autopublish-toggle"]').should('not.be.checked');
  };
  const mockLink = (body: object, statusCode = 200, delay = 3000) => {
    cy.intercept('POST', '/api/process-link', { statusCode, delay, body }).as('scanLink');
  };
  const expectUnderHeader = () => {
    cy.get('.site-header').then(header => {
      const bottom = header[0].getBoundingClientRect().bottom;
      cy.get(scene).should(overlay => {
        const bounds = overlay[0].getBoundingClientRect();
        expect(bounds.top).to.be.closeTo(bottom, 1);
        expect(bounds.left).to.equal(0);
        expect(bounds.right).to.equal(overlay[0].ownerDocument.documentElement.clientWidth);
        expect(bounds.bottom).to.equal(overlay[0].ownerDocument.defaultView!.innerHeight);
      });
    });
    cy.get('.site-header').should('have.css', 'z-index', '50');
    cy.get(scene).should('have.css', 'z-index', '40');
    cy.get('.site-header').should(header => expect(header[0].closest('[inert]')).to.equal(null));
  };

  beforeEach(() => {
    cy.intercept('POST', '**/api/**', { statusCode: 503, body: { error: 'Unconfigured scan mock' } });
    cy.intercept('GET', '/api/auth/session', { statusCode: 200, body: {} }).as('scanSession');
    cy.intercept('GET', '/api/events?*', { statusCode: 200, body: [] });
    cy.intercept('POST', '**/api/events/check-duplicates', { statusCode: 200, body: { duplicates: [] } });
    cy.intercept('POST', '/api/event-cover-search', { statusCode: 200, body: { candidates: [], status: 'completed' } });
    cy.intercept('POST', '/api/crop-image', { statusCode: 204 });
    cy.intercept('POST', '/api/events', request => {
      throw new Error(`Unexpected automatic publication: ${request.url}`);
    });
  });

  it('covers the pending link below the menu and exits immediately to the draft', () => {
    mockLink({ events: [draft], imageUrl: null });
    visit();
    submitLink();
    cy.get(scene).should('be.visible').and('have.attr', 'data-loading-phase', 'scan-link');
    cy.get(`${scene} [role="status"]`).should('have.attr', 'aria-live', 'polite').and('contain', 'Scansione pagina web in corso');
    cy.get('body > main').should('have.attr', 'inert');
    cy.get('body > main input').first().then(input => {
      input[0].focus();
      expect(input[0].ownerDocument.activeElement).not.to.equal(input[0]);
    });
    expectUnderHeader();
    cy.wait('@scanLink');
    cy.get(scene).should('not.exist');
    cy.get('body > main').should('not.have.attr', 'inert');
    cy.get('.event-display-container').should('be.visible');
  });

  for (const outcome of ['error', 'empty', 'network']) {
    it(`removes the overlay and restores the page after ${outcome}`, () => {
      if (outcome === 'network') {
        cy.intercept('POST', '/api/process-link', request => new Promise<void>(resolve => {
          setTimeout(() => {
            request.destroy();
            resolve();
          }, 3000);
        })).as('scanLink');
      } else {
        mockLink(outcome === 'empty' ? { events: [] } : { error: 'Errore scansione simulato' }, outcome === 'error' ? 503 : 200);
      }
      visit();
      cy.document().then(document => {
        document.body.style.overflow = 'clip';
        document.documentElement.style.overflow = 'auto';
      });
      cy.get('body > footer').invoke('attr', 'inert', 'preexisting');
      submitLink();
      cy.get(scene).should('be.visible');
      cy.wait('@scanLink');
      cy.get(scene).should('not.exist');
      cy.get('body > main').should('not.have.attr', 'inert');
      cy.get('body > footer').should('have.attr', 'inert', 'preexisting');
      cy.get('[role="alert"]').should('be.visible').and('contain', outcome === 'empty' ? 'Nessun evento trovato' : outcome === 'network' ? 'connessione' : 'Errore scansione simulato');
      cy.document().then(document => {
        expect(document.body.style.overflow).to.equal('clip');
        expect(document.documentElement.style.overflow).to.equal('auto');
      });
    });
  }

  it('keeps the mobile menu usable and restores overflow when the request finishes inside the dialog', () => {
    cy.viewport(390, 844);
    mockLink({ events: [] }, 200, 4000);
    visit();
    submitLink();
    cy.get(scene).should('be.visible');
    cy.get('button[aria-label="Apri menu"]').click();
    cy.get('#mobile-navigation-menu').should('be.visible');
    cy.wait('@scanLink');
    cy.get(scene).should('not.exist');
    cy.get('#mobile-navigation-menu button[aria-label="Chiudi menu"]').click();
    cy.document().should(document => {
      expect(document.body.style.overflow).to.equal('');
      expect(document.documentElement.style.overflow).to.equal('');
      expect(document.defaultView!.getComputedStyle(document.body).overflow).not.to.equal('hidden');
    });
    cy.get('body > main').should('not.have.attr', 'inert');
  });

  it('unmounts on menu navigation while the link request is still pending', () => {
    cy.viewport(390, 844);
    mockLink({ events: [] }, 200, 12000);
    visit();
    submitLink();
    cy.get(scene).should('be.visible');
    cy.get('button[aria-label="Apri menu"]').click();
    cy.get('#mobile-navigation-menu').contains('a', 'Eventi').click();
    cy.location('pathname').should('equal', '/eventi');
    cy.get(scene).should('not.exist');
    cy.get('body > main').should('not.have.attr', 'inert');
    cy.document().should(document => {
      expect(document.body.style.overflow).to.equal('');
      expect(document.documentElement.style.overflow).to.equal('');
    });
  });

  it('keeps menu focus accessible during a pending scan and restores it after Escape', () => {
    let finish: () => void;
    cy.viewport(390, 844);
    cy.intercept('POST', '/api/process-link', request => new Promise<void>(resolve => {
      finish = () => { request.reply({ events: [] }); resolve(); };
    })).as('scanLink');
    visit();
    submitLink();
    cy.get(scene).should('be.visible');
    cy.get('button[aria-label="Apri menu"]').focus().should('be.focused').click();
    cy.get('#mobile-navigation-menu').should('be.visible').and('have.attr', 'open');
    cy.focused().should('have.attr', 'aria-label', 'Chiudi menu');
    cy.focused().type('{esc}');
    cy.get('#mobile-navigation-menu').should('not.exist');
    cy.focused().should('have.attr', 'aria-label', 'Apri menu');
    cy.get(scene).should('be.visible');
    cy.get('body > main').should('have.attr', 'inert');
    cy.then(() => finish());
    cy.wait('@scanLink');
    cy.get(scene).should('not.exist');
    cy.focused().should('have.attr', 'aria-label', 'Apri menu');
  });

  it('does not reopen the image picker or accept another drop through the scanning portal', () => {
    let finish: () => void;
    let scans = 0;
    cy.viewport(390, 844);
    cy.intercept('POST', '/api/process-image', request => new Promise<void>(resolve => {
      scans += 1;
      finish = () => { request.reply({ events: [] }); resolve(); };
    })).as('scanFile');
    visit(window => {
      Object.defineProperty(window.navigator, 'userAgent', { configurable: true, value: 'Android' });
    });
    cy.get('.image-upload-zone').click();
    cy.contains('.image-source-overlay button', 'Galleria').click();
    cy.get('.image-upload-zone input[type="file"]:not([capture])').last()
      .selectFile('cypress/fixtures/event-poster.png', { force: true });
    cy.get(scene).should('be.visible').click('center');
    cy.get('.image-source-overlay').should('not.exist');
    cy.get(scene).selectFile('cypress/fixtures/event-poster.png', { action: 'drag-drop' });
    cy.then(() => { expect(scans).to.equal(1); finish(); });
    cy.wait('@scanFile');
    cy.get(scene).should('not.exist');
    cy.get('.image-source-overlay').should('not.exist');
  });

  for (const first of ['link', 'image']) {
    it(`keeps overlapping scans inert until the final release when ${first} finishes first`, () => {
      const finishes: Record<string, () => void> = {};
      for (const source of ['link', 'image']) {
        cy.intercept('POST', `/api/process-${source}`, request => new Promise<void>(resolve => {
          finishes[source] = () => { request.reply({ events: [] }); resolve(); };
        })).as(`overlap${source}`);
      }
      visit();
      cy.get('body > footer').invoke('attr', 'inert', 'preexisting');
      cy.get('input[type="file"]').first().selectFile('cypress/fixtures/event-poster.png', { force: true });
      cy.get(scene).should('have.length', 1);
      cy.get('input[type="url"]').type('https://example.com/evento', { force: true });
      cy.contains('button', 'Estrai evento').click({ force: true });
      cy.get(scene).should('have.length', 2);
      cy.wrap(finishes).should(callbacks => {
        expect(callbacks.link).to.be.a('function');
        expect(callbacks.image).to.be.a('function');
      });
      cy.then(() => finishes[first]());
      cy.wait(`@overlap${first}`);
      cy.get(scene).should('have.length', 1);
      cy.get('body > main').should('have.attr', 'inert');
      cy.get('body > footer').should('have.attr', 'inert', '');
      const last = first === 'link' ? 'image' : 'link';
      cy.then(() => finishes[last]());
      cy.wait(`@overlap${last}`);
      cy.get(scene).should('not.exist');
      cy.get('body > main').should('not.have.attr', 'inert');
      cy.get('body > footer').should('have.attr', 'inert', 'preexisting');
    });
  }

  it('tracks header ResizeObserver changes and desktop/mobile orientation', () => {
    mockLink({ events: [] }, 200, 12000);
    visit();
    submitLink();
    cy.get(scene).should('be.visible');
    expectUnderHeader();
    cy.get('.site-header').invoke('css', 'height', '92px');
    expectUnderHeader();
    cy.viewport(390, 844);
    expectUnderHeader();
    cy.viewport(844, 390);
    expectUnderHeader();
    cy.document().should(document => expect(document.documentElement.scrollWidth).to.equal(document.documentElement.clientWidth));
  });

  it('renders real WebGL geometry and handles context loss without losing status', () => {
    mockLink({ events: [] }, 200, 12000);
    visit();
    submitLink();
    cy.get(scene).should('have.attr', 'data-scene-state', 'ready');
    cy.get(`${scene} canvas`).should('be.visible').then(canvas => {
      const element = canvas[0] as HTMLCanvasElement;
      expect(element.width).to.be.greaterThan(0);
      expect(element.height).to.be.greaterThan(0);
      const context = element.getContext('webgl2');
      expect(context).not.to.equal(null);
      expect(context!.getParameter(context!.VERSION)).to.contain('WebGL');
      element.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    });
    cy.get(scene).should('have.attr', 'data-scene-state', 'fallback');
    cy.get(`${scene} [role="status"]`).should('be.visible');
  });

  it('keeps an accessible fallback when WebGL is unavailable', () => {
    mockLink({ events: [] });
    visit(window => {
      const original = window.HTMLCanvasElement.prototype.getContext;
      cy.stub(window.HTMLCanvasElement.prototype, 'getContext').callsFake(function(this: HTMLCanvasElement, type: string, ...args: unknown[]) {
        if (type === 'webgl2' || type === 'webgl' || type === 'experimental-webgl') return null;
        return original.apply(this, [type, ...args] as Parameters<typeof original>);
      });
    });
    submitLink();
    cy.get(scene).should('have.attr', 'data-scene-state', 'fallback');
    cy.get(`${scene} [role="status"]`).should('be.visible').and('contain', 'Scansione pagina web in corso');
    expectUnderHeader();
    cy.wait('@scanLink');
    cy.get(scene).should('not.exist');
  });

  it('responds to live reduced-motion changes without remounting the overlay', () => {
    let updateMotion: (reduced: boolean) => void;
    mockLink({ events: [] }, 200, 12000);
    visit(window => {
      const original = window.matchMedia.bind(window);
      const motion = original('(prefers-reduced-motion: reduce)');
      let reduced = true;
      Object.defineProperty(motion, 'matches', { get: () => reduced });
      updateMotion = value => {
        reduced = value;
        motion.dispatchEvent(new window.Event('change'));
      };
      cy.stub(window, 'matchMedia').callsFake((query: string) => query === '(prefers-reduced-motion: reduce)' ? motion : original(query));
    });
    submitLink();
    cy.get(scene).should('have.attr', 'data-scene-state', 'ready').and('have.attr', 'data-reduced-motion', 'true');
    cy.then(() => updateMotion(false));
    cy.get(scene).should('have.attr', 'data-reduced-motion', 'false');
    cy.then(() => updateMotion(true));
    cy.get(scene).should('have.attr', 'data-reduced-motion', 'true');
    cy.get(`${scene} [role="status"]`).should('be.visible');
  });

  for (const source of ['image', 'pdf', 'shared']) {
    it(`uses the same overlay for ${source} scanning with the real phase message`, () => {
      cy.intercept('POST', source === 'pdf' ? '/api/process-pdf' : '/api/process-image', {
        statusCode: 503, delay: 3000, body: { code: 'VISION_SERVICE_UNAVAILABLE', error: 'Scansione mock terminata' },
      }).as('scanFile');
      if (source === 'shared') {
        cy.intercept('GET', '/api/share-target?shareId=scan-3d', {
          statusCode: 200, fixture: 'event-poster.png,null', headers: { 'Content-Type': 'image/png' },
        });
        visit(undefined, '/crea?shared=true&shareId=scan-3d');
      } else {
        visit();
        cy.get('input[type="file"]').first().selectFile(source === 'pdf'
          ? { contents: Cypress.Buffer.from('%PDF-1.4\n%%EOF'), fileName: 'programma.pdf', mimeType: 'application/pdf' }
          : 'cypress/fixtures/event-poster.png', { force: true });
      }
      cy.get(scene).should('be.visible').and('have.attr', 'data-loading-phase', source === 'shared' ? 'shared-image' : 'scan-image');
      cy.get(`${scene} [role="status"]`).should('contain', source === 'pdf' ? 'Scansione PDF in corso' : source === 'shared' ? 'Scansione immagine condivisa in corso' : 'Scansione immagine in corso');
      cy.wait('@scanFile');
      cy.get(scene).should('not.exist');
      cy.get('body > main').should('not.have.attr', 'inert');
    });
  }

  for (const source of ['pdf', 'shared']) {
    for (const outcome of ['success', 'empty']) {
      it(`restores the page after ${source} scanning returns ${outcome}`, () => {
        cy.intercept('POST', source === 'pdf' ? '/api/process-pdf' : '/api/process-image', {
          statusCode: 200, delay: 3000, body: { events: outcome === 'success' ? [draft] : [] },
        }).as('scanFile');
        if (source === 'shared') {
          cy.intercept('GET', '/api/share-target?shareId=scan-3d', {
            statusCode: 200, fixture: 'event-poster.png,null', headers: { 'Content-Type': 'image/png' },
          });
          visit(undefined, '/crea?shared=true&shareId=scan-3d');
        } else {
          visit();
          cy.get('input[type="file"]').first().selectFile({
            contents: Cypress.Buffer.from('%PDF-1.4\n%%EOF'), fileName: 'programma.pdf', mimeType: 'application/pdf',
          }, { force: true });
        }
        cy.get(scene).should('be.visible');
        cy.get('body > main').should('have.attr', 'inert');
        cy.wait('@scanFile');
        cy.get(scene).should('not.exist');
        cy.get('body > main').should('not.have.attr', 'inert');
        if (outcome === 'success') cy.get('.event-display-container').should('be.visible').and('contain', draft.title);
        else {
          cy.get('.event-display-container').should('not.exist');
          cy.get('input[type="url"]').should('be.visible').and('be.enabled').focus();
          cy.focused().should('have.attr', 'type', 'url');
        }
      });
    }
  }
});
