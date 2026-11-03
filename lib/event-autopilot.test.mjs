import assert from "node:assert/strict";
import { test } from "node:test";
import { getAutopilotDecision } from "./event-autopilot.ts";

const ready = {
  events: [{ title: "Concerto", date: "01/12/2026" }],
  duplicates: [null],
  duplicatesChecked: true,
  cropStatus: "completed",
  sectionsPending: false,
};

test("pubblica quando dati, copertina e controllo duplicati sono pronti", () => {
  assert.deepEqual(getAutopilotDecision(ready), { action: "publish" });
  assert.deepEqual(getAutopilotDecision({ ...ready, cropStatus: "idle" }), { action: "publish" });
});

test("attende ritaglio, sezioni locandina e controllo duplicati", () => {
  assert.deepEqual(getAutopilotDecision({ ...ready, cropStatus: "processing" }), { action: "wait" });
  assert.deepEqual(getAutopilotDecision({ ...ready, sectionsPending: true }), { action: "wait" });
  assert.deepEqual(getAutopilotDecision({ ...ready, duplicatesChecked: false, duplicates: [] }), { action: "wait" });
});

test("si ferma sui duplicati solo dopo il controllo", () => {
  assert.deepEqual(getAutopilotDecision({ ...ready, duplicates: [null, { id: 1 }], events: [...ready.events, { title: "B", date: "02/12/2026" }] }), { action: "stop", reason: "duplicate" });
});

test("si ferma subito se mancano titolo o data", () => {
  for (const event of [{ title: "", date: "01/12/2026" }, { title: "Concerto", date: "non trovato" }, { title: "  ", date: null }]) {
    assert.deepEqual(getAutopilotDecision({ ...ready, cropStatus: "processing", events: [event] }), { action: "stop", reason: "missing-data" });
  }
  assert.deepEqual(getAutopilotDecision({ ...ready, events: [{ title: "Il tesoro non trovato", date: "01/12/2026" }] }), { action: "publish" });
});

test("si ferma con copertina fallita o assente e con revisione richiesta", () => {
  assert.deepEqual(getAutopilotDecision({ ...ready, cropStatus: "failed" }), { action: "stop", reason: "cover-failed" });
  assert.deepEqual(getAutopilotDecision({ ...ready, cropStatus: "idle", coverMissing: true }), { action: "stop", reason: "cover-failed" });
  assert.deepEqual(getAutopilotDecision({ ...ready, needsReview: true }), { action: "stop", reason: "review-requested" });
});

test("nessun evento non viene pubblicato", () => {
  assert.deepEqual(getAutopilotDecision({ ...ready, events: [], duplicates: [] }), { action: "stop", reason: "no-events" });
});
