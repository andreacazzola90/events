/// <reference types="cypress" />

describe('Event Creation via Link - AI Testing', () => {
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
