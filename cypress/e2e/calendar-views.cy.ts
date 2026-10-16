/// <reference types="cypress" />

const events = Array.from({ length: 6 }, (_, index) => ({
  id: 9000 + index,
  title: `Evento calendario ${index + 1}`,
  date: index === 5 ? "16/10/2026" : "2026-10-16",
  time: `${String(9 + index).padStart(2, "0")}:00`,
  location: "Schio",
  imageUrl: "/icons/pwa-192.png",
}));

describe("Calendar views and day previews", () => {
  beforeEach(() => {
    cy.clock(Date.UTC(2026, 9, 16, 10), ["Date"]);
    cy.intercept("GET", "/api/events?*", { statusCode: 200, body: events }).as("calendarEvents");
    cy.visit("/tutti-gli-eventi");
    cy.wait("@calendarEvents");
    cy.get(".calendar-status[role='status']").should("not.exist");
  });

  it("switches between month, week, three days and day while preserving the date", () => {
    cy.get(".calendar-view-switch").contains("button", "Mese").should("have.attr", "aria-pressed", "true");
    cy.get(".calendar-day[data-date]").should("have.length", 21);
    cy.get("[data-date='2026-10-15']").should("have.class", "is-past").find(".calendar-day-number").should("be.disabled");
    cy.get("[data-date='2026-10-16']").should("have.class", "is-today");
    cy.get("[data-date='2026-11-01']").should("have.class", "is-outside-month");
    cy.get(".calendar-days").should(days => expect(getComputedStyle(days[0]).gridTemplateColumns.split(" ")).to.have.length(7));
    cy.get(".calendar-view-switch").contains("button", "Settimana").click();
    cy.get(".calendar-period-day").should("have.length", 7).first().should("have.attr", "data-date", "2026-10-12");
    cy.get(".calendar-view-switch").contains("button", "3 giorni").click();
    cy.get(".calendar-period-day").should("have.length", 3).last().should("have.attr", "data-date", "2026-10-18");
    cy.get(".calendar-view-switch").contains("button", "Giorno").click();
    cy.get(".calendar-period-day").should("have.length", 1).should("have.attr", "data-date", "2026-10-16");
    cy.get(".calendar-event-link").should("have.length", 6);
  });

  it("opens the daily view when a day is clicked and keeps event links separate", () => {
    cy.get("[data-date='2026-10-16'] .calendar-event-link").should("have.length", 3).first()
      .should("have.attr", "href").and("include", "9000");
    cy.get("[data-date='2026-10-16'] .calendar-day-number").click();
    cy.get(".calendar-period-title").should("be.focused");
    cy.get(".calendar-view-switch").contains("button", "Giorno").should("have.attr", "aria-pressed", "true");
    cy.get(".calendar-event-link").should("have.length", 6);
    cy.get(".calendar-thumbnail img").should("have.length", 6).first().should(image => {
      expect((image[0] as HTMLImageElement).naturalWidth).to.be.greaterThan(0);
    });
  });

  it("shows all hidden events in a modal and supports Escape and day drill-down", () => {
    cy.get("[data-date='2026-10-16']").contains("button", "+3 eventi").click();
    cy.get("dialog[open]").should("be.visible").within(() => {
      cy.get(".calendar-event-link").should("have.length", 6);
      cy.contains("Evento calendario 6").should("be.visible");
      cy.get("button[aria-label='Chiudi anteprima']").focus().type("{esc}");
    });
    cy.get("dialog[open]").should("not.exist");
    cy.get("[data-date='2026-10-16']").contains("button", "+3 eventi").should("be.focused").click();
    cy.get("dialog[open]").contains("button", "Apri giorno").click();
    cy.get("dialog[open]").should("not.exist");
    cy.get(".calendar-period-title").should("be.focused");
    cy.get(".calendar-period-day").should("have.attr", "data-date", "2026-10-16");
    cy.get(".calendar-event-link").should("have.length", 6);
  });

  it("navigates with the selected period and returns to today", () => {
    cy.get(".calendar-view-switch").contains("button", "3 giorni").click();
    cy.get("button[aria-label='Periodo successivo']").click();
    cy.get(".calendar-period-day").first().should("have.attr", "data-date", "2026-10-19");
    cy.get("button[aria-label='Periodo precedente']").click();
    cy.get(".calendar-period-day").first().should("have.attr", "data-date", "2026-10-16");
    cy.get("button[aria-label='Periodo precedente']").click();
    cy.contains("button", "Oggi").click();
    cy.get(".calendar-period-day").first().should("have.attr", "data-date", "2026-10-16");
  });

  it("keeps mobile controls visible and events readable without page overflow", () => {
    cy.viewport(390, 844);
    cy.get(".calendar-view-switch button").should("have.length", 4).each(button => cy.wrap(button).should("be.visible"));
    cy.get("[data-date='2026-10-16']").contains("button", "+3 eventi").click();
    cy.get("dialog[open]").should("be.visible").find(".calendar-event-link").should("have.length", 6);
    cy.screenshot("calendar-mobile-preview", { capture: "viewport" });
    cy.get("button[aria-label='Chiudi anteprima']").click();
    cy.get(".calendar-view-switch").contains("button", "Giorno").click();
    cy.get(".calendar-event-title").first().should("be.visible");
    cy.document().then(document => expect(document.documentElement.scrollWidth).to.be.at.most(390));
  });

  for (const width of [320, 375, 430]) {
    it(`fits every calendar view at ${width}px without horizontal scrolling`, () => {
      cy.viewport(width, 844);
      for (const label of ["Mese", "Settimana", "3 giorni", "Giorno"]) {
        cy.get(".calendar-view-switch").contains("button", label).click();
        cy.get(".calendar-scroll").should(scroll => {
          expect(scroll[0].scrollWidth, `${label} content width`).to.be.at.most(scroll[0].clientWidth + 1);
        });
        cy.document().then(document => expect(document.documentElement.scrollWidth).to.be.at.most(width));
        cy.get(".calendar-thumbnail img").first().should("be.visible");
        cy.get(".calendar-event-title").first().should("be.visible");
        if (label === "Mese") {
          cy.get(".calendar-days").should(days => expect(getComputedStyle(days[0]).gridTemplateColumns.split(" ")).to.have.length(1));
          cy.get(".calendar-day[data-date]").should("have.length", 21);
          cy.get(".calendar-day-mobile-date").first().should("be.visible").and("contain", "12 ott");
          cy.get(".calendar-weekdays").should("not.be.visible");
          cy.get("[data-date='2026-10-15'] .calendar-day-number").should("be.disabled");
          cy.get("[data-date='2026-11-01'] .calendar-day-mobile-date").should("be.visible").and("contain", "1 nov");
        }
      }
    });
  }
});