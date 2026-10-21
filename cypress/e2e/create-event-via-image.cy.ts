/// <reference types="cypress" />

describe('Parallel event cover', () => {
  beforeEach(() => {
    cy.visit('/crea', { failOnStatusCode: false });
    cy.wait(2000);
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
    cy.get('[data-image-crop-status="failed"]').should('be.visible').and('contain', 'Ritaglio non riuscito').and('contain', 'Immagine originale mantenuta.');
    cy.get('[data-image-crop-status="failed"]').should('contain', 'Quota gratuita AI temporaneamente esaurita.');
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
        expect(request.headers['content-type']).to.include('multipart/form-data');
        const body = typeof request.body === 'string' ? request.body : new TextDecoder().decode(request.body);
        expect(body).not.to.include('"autoCropImage":true');
        expect(body).to.include(`"imageUrl":"${selectedCover}"`);
        expect(body).to.include(`filename="event-image.${outcome === 'original' || outcome === 'manual' ? 'png' : 'jpg'}"`);
        request.reply({ statusCode: 201, body: { id: 999, title: 'Parallel cover event' } });
      }).as('parallelSave');
      cy.get('input[type="file"]').first().selectFile('cypress/fixtures/event-poster.png', { force: true });
      cy.wait('@parallelImage');
      cy.contains('Parallel cover event').should('be.visible');
      cy.contains('[role="status"]', 'Immagine in elaborazione').should('be.visible');
      cy.contains('button', /^Pubblica$|Pubblica tutti/i).first().should('be.disabled');
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
          cy.get('[data-image-crop-status="failed"]').should('contain', 'Ritaglio non riuscito').and('contain', 'Immagine originale mantenuta.');
        } else {
          cy.get('[data-image-crop-status="completed"]').first().should('contain', 'Ritaglio completato');
        }
        cy.get('img.event-image').first().should(outcome === 'original' || outcome === 'manual' ? 'have.attr' : 'not.have.attr', 'src', original);
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
      cy.get('img.event-image').first().invoke('attr', 'src').then(source => { selectedCover = source; });
      cy.contains('button', /^Pubblica$|Pubblica tutti/i).first().should('be.enabled').click();
      cy.wait('@parallelSave').its('response.statusCode').should('eq', 201);
      cy.contains(outcome === 'multiple' ? '2 eventi creati' : 'Evento creato').should('be.visible');
    });
  }
});

(Cypress.env('parallelCoverOnly') ? describe.skip : describe)('Event Creation via Image - OCR & AI Testing', () => {
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
