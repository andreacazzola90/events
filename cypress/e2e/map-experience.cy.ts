/// <reference types="cypress" />

const mapEvents = [
  {
    id: 98001,
    title: "Concerto in piazza",
    description: "Musica dal vivo nel centro storico",
    date: "2026-10-17",
    time: "20:30",
    location: "Piazza Rossi, Schio",
    organizer: "Comune di Schio",
    category: "musica",
    price: "Gratuito",
    latitude: 45.7175,
    longitude: 11.3593,
  },
  {
    id: 98002,
    title: "Mostra fotografica",
    description: "Esposizione di fotografia contemporanea",
    date: "2026-10-24",
    time: "18:00",
    location: "Villa Fabris, Thiene",
    organizer: "Associazione Cultura",
    category: "cultura",
    price: "5€",
    latitude: 45.7081,
    longitude: 11.4782,
  },
];

describe("Map event browsing", () => {
  beforeEach(() => {
    cy.clock(Date.UTC(2026, 9, 16, 10), ["Date"]);
    cy.intercept("GET", "/api/events", { statusCode: 200, body: mapEvents }).as("mapEvents");
    cy.visit("/mappa");
    cy.wait("@mapEvents");
    cy.get(".map-event-card").should("have.length", 2);
  });

  it("keeps the mobile map visible while the event list is collapsed", () => {
    cy.viewport(390, 844);
    cy.get("#map-event-list").should("not.be.visible");
    cy.get(".event-map-legend").should((panel) => {
      expect(panel[0].getBoundingClientRect().height).to.be.lessThan(150);
    });
    cy.get(".leaflet-container").should("be.visible");

    cy.get("button[aria-label='Apri lista eventi']").click();
    cy.get(".event-map-legend.is-open").should((panel) => {
      expect(panel[0].getBoundingClientRect().height).to.be.lessThan(844 * 0.8);
      expect(panel[0].getBoundingClientRect().height).to.be.greaterThan(200);
    });
    cy.get("#map-event-list .map-event-card").should("have.length", 2);
    cy.get("input[aria-label='Cerca eventi per titolo, descrizione o luogo']").type("Thiene");
    cy.get("#map-event-list .map-event-card").should("have.length", 1).and("contain", "Mostra fotografica");
  });

  it("combines category and date filters and keeps a separate map-center and detail action", () => {
    cy.contains("button", "Weekend").click();
    cy.get(".map-event-card").should("have.length", 1).and("contain", "Concerto in piazza");
    cy.get("select[aria-label='Filtra per categoria']").select("musica");
    cy.get(".map-event-card").should("have.length", 1).and("contain", "Concerto in piazza");
    cy.get(".map-event-card button[aria-label^='Centra sulla mappa']")
      .click()
      .should("have.attr", "aria-pressed", "true");
    cy.get(".map-event-card a[aria-label='Apri dettagli: Concerto in piazza']")
      .should("have.attr", "href")
      .and("include", "/events/");
    cy.get(".map-event-card a[aria-label='Apri dettagli: Concerto in piazza']")
      .should("not.have.attr", "aria-pressed");
  });
});

describe("Events page unified search", () => {
  beforeEach(() => {
    cy.clock(Date.UTC(2026, 9, 16, 10), ["Date"]);
    cy.intercept("GET", "/api/events?*", { statusCode: 200, body: mapEvents }).as("events");
    cy.visit("/eventi");
    cy.wait("@events");
    cy.get(".event-card").should("have.length", 2);
  });

  it("searches place in the main field and shows the category icon", () => {
    cy.get("input[aria-label='Cerca eventi']").type("Thiene");
    cy.get(".event-card").should("have.length", 1).and("contain", "Mostra fotografica");
    cy.get("#event-location-filter").should("not.exist");
    cy.contains(".event-card-media span", "cultura").find("svg").should("be.visible");
  });
});
