/// <reference types="cypress" />

import { DEFAULT_SITE_PRESENTATION } from "../../lib/site-presentation";

describe("Site presentation settings", () => {
  it("applies an admin-configured category color to public event cards", () => {
    const categories = DEFAULT_SITE_PRESENTATION.categories.map(category =>
      category.id === "cultura" ? { ...category, color: "#123456" } : category,
    );
    cy.intercept("GET", "/api/site-settings", {
      statusCode: 200,
      body: { categories, quotes: [] },
    });
    cy.visit("/eventi");
    cy.get('[data-category="cultura"]').first().should($badge => {
      expect($badge.is(":visible")).to.equal(true);
      const card = $badge[0].closest<HTMLElement>(".event-card");
      expect(card).to.exist;
      expect(card?.style.borderInlineStart).to.contain("rgb(18, 52, 86)");
      expect(card && getComputedStyle(card).borderInlineStartWidth).to.equal("4px");
      });
  });

  it("shows an enabled admin-configured quote in the global footer", () => {
    const quote = { id: "test-quote", text: "Una frase per verificare il footer.", author: "Autrice di prova", enabled: true };
    cy.intercept("GET", "/api/site-settings", {
      statusCode: 200,
      body: { ...DEFAULT_SITE_PRESENTATION, quotes: [quote] },
    });
    cy.visit("/crea");
    cy.contains("blockquote", quote.text, { timeout: 10000 }).scrollIntoView().should("be.visible");
    cy.contains("figcaption", quote.author).should("be.visible");
  });
});