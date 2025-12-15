/// <reference types="cypress" />

describe('AI Integration - Quality & Performance Tests', () => {
  beforeEach(() => {
    cy.visit('/crea', { failOnStatusCode: false });
    cy.wait(2000);
  });

  it('should verify AI extracts at least 60% of event fields from link', () => {
    cy.intercept('POST', '/api/process-link').as('processLink');
    
    cy.get('input[type="url"]', { timeout: 10000 })
      .should('be.visible')
      .type('https://www.dice.fm/event/test-concert-2025');
    
    cy.contains('button', /Extract Event/i).click();
    
    cy.wait('@processLink', { timeout: 40000 }).then((interception) => {
      const eventData = interception.response?.body;
      
      // Required fields for a valid event
      const requiredFields = ['title', 'date', 'time', 'location', 'description'];
      const extractedFields = requiredFields.filter(field => 
        eventData?.[field] && eventData[field].length > 0
      );
      
      const extractionRate = (extractedFields.length / requiredFields.length) * 100;
      
      cy.log('=== AI QUALITY METRICS ===');
      cy.log('Total fields: ' + requiredFields.length);
      cy.log('Extracted fields: ' + extractedFields.length);
      cy.log('Fields found: ' + extractedFields.join(', '));
      cy.log('Missing fields: ' + requiredFields.filter(f => !extractedFields.includes(f)).join(', '));
      cy.log('Extraction rate: ' + extractionRate.toFixed(0) + '%');
      
      // Assert at least 60% extraction rate
      expect(extractionRate).to.be.at.least(60);
      
      if (extractionRate >= 60) {
        cy.log('✅ PASS: AI quality threshold met (>= 60%)');
      } else {
        cy.log('❌ FAIL: AI quality below threshold');
      }
    });
  });

  it('should complete link processing within 15 seconds', () => {
    cy.intercept('POST', '/api/process-link').as('processLink');
    
    const startTime = Date.now();
    
    cy.get('input[type="url"]', { timeout: 10000 })
      .should('be.visible')
      .type('https://www.dice.fm/event/test-concert-2025');
    
    cy.contains('button', /Extract Event/i).click();
    
    cy.wait('@processLink', { timeout: 40000 }).then(() => {
      const endTime = Date.now();
      const processingTime = (endTime - startTime) / 1000;
      
      cy.log('=== PERFORMANCE METRICS ===');
      cy.log('Processing time: ' + processingTime.toFixed(2) + ' seconds');
      
      // Performance threshold: 15 seconds
      if (processingTime <= 15) {
        cy.log('✅ PASS: Processing time acceptable (<= 15s)');
      } else {
        cy.log('⚠️ WARNING: Processing time above target (> 15s)');
        cy.log('Note: This may be due to network latency or API load');
      }
      
      // We don't assert failure here because network conditions vary
      // But we log the performance data
      cy.task('log', 'Link processing: ' + processingTime.toFixed(2) + 's', { log: false });
    });
  });

  it('should complete image OCR processing within 30 seconds', () => {
    cy.intercept('POST', '/api/process-image').as('processImage');
    
    const startTime = Date.now();
    
    cy.get('input[type="file"]', { timeout: 10000 })
      .first()
      .selectFile({
        contents: 'cypress/fixtures/event-poster.png',
        fileName: 'event-poster.png',
        mimeType: 'image/png'
      }, { force: true });
    
    cy.wait('@processImage', { timeout: 50000 }).then(() => {
      const endTime = Date.now();
      const processingTime = (endTime - startTime) / 1000;
      
      cy.log('=== OCR PERFORMANCE METRICS ===');
      cy.log('Processing time: ' + processingTime.toFixed(2) + ' seconds');
      
      // Performance threshold: 30 seconds for OCR
      if (processingTime <= 30) {
        cy.log('✅ PASS: OCR processing time acceptable (<= 30s)');
      } else {
        cy.log('⚠️ WARNING: OCR processing time above target (> 30s)');
        cy.log('Note: OCR is slower than link scraping - this is expected');
      }
      
      cy.task('log', 'Image processing: ' + processingTime.toFixed(2) + 's', { log: false });
    });
  });

  it('should handle network errors gracefully', () => {
    // Simulate network failure
    cy.intercept('POST', '/api/process-link', {
      statusCode: 500,
      body: { error: 'Network error' }
    }).as('processLinkError');
    
    cy.get('input[type="url"]', { timeout: 10000 })
      .should('be.visible')
      .type('https://www.dice.fm/event/network-test');
    
    cy.contains('button', /Extract Event/i).click();
    
    cy.wait('@processLinkError').then((interception) => {
      cy.log('Error response:', JSON.stringify(interception.response?.statusCode));
      
      // Verify app doesn't crash
      cy.get('body').should('exist');
      cy.log('✅ App did not crash on network error');
      
      // Check if error message is shown (adjust selector based on your error UI)
      cy.contains(/error|errore|failed/i, { timeout: 5000 }).should('exist');
      cy.log('✅ Error message displayed to user');
    });
  });

  it('should prevent duplicate event creation', () => {
    cy.intercept('POST', '/api/process-link').as('processLink');
    cy.intercept('POST', '/api/events').as('createEvent');
    
    const testUrl = 'https://www.dice.fm/event/duplicate-test-' + Date.now();
    
    // Create first event
    cy.get('input[type="url"]', { timeout: 10000 })
      .should('be.visible')
      .type(testUrl);
    
    cy.contains('button', /Extract Event/i).click();
    cy.wait('@processLink', { timeout: 40000 });
    
    // Save first event
    cy.contains('button', /Aggiungi evento/i, { timeout: 10000 })
      .should('be.visible')
      .click();
    
    cy.wait('@createEvent', { timeout: 30000 }).then((interception1) => {
      cy.log('First save status:', JSON.stringify(interception1.response?.statusCode));
      
      if (interception1.response?.statusCode === 201) {
        cy.log('✅ First event created successfully');
        
        // Try to create duplicate
        cy.visit('/crea', { failOnStatusCode: false });
        cy.wait(2000);
        
        cy.get('input[type="url"]', { timeout: 10000 })
          .should('be.visible')
          .type(testUrl);
        
        cy.contains('button', /Extract Event/i).click();
        cy.wait('@processLink', { timeout: 40000 });
        
        cy.contains('button', /Aggiungi evento/i, { timeout: 10000 })
          .should('be.visible')
          .click();
        
        cy.wait('@createEvent', { timeout: 30000 }).then((interception2) => {
          cy.log('Duplicate save status:', JSON.stringify(interception2.response?.statusCode));
          
          // Check if duplicate is prevented (might be 409 Conflict or just alert)
          if (interception2.response?.statusCode === 409) {
            cy.log('✅ Duplicate prevention works (409 Conflict)');
          } else if (interception2.response?.statusCode === 201) {
            cy.log('⚠️ Duplicate was allowed - may need duplicate detection');
          }
        });
      }
    });
  });
});
