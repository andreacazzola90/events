import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as dates from "./calendar-ics.ts";
import * as categories from "./constants.ts";

const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(readFileSync(new URL("../app/lib/google-calendar.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture({ response = 200, errorReason, disconnected = false, configured = true, claimed = true, category = "music", eventType = "default", calendarId = "primary", calendarEmail = "a@example.com", calendarListPages = [{ items: [{ id: "primary", summary: "Principale", backgroundColor: "#5484ed", primary: true, accessRole: "owner" }, { id: "events", summary: "Eventi", backgroundColor: "#fbd75b", accessRole: "owner" }, { id: "read-only", summary: "Privato", accessRole: "reader" }], nextPageToken: "next" }, { items: [{ id: "routines", summary: "Routines", backgroundColor: "#7ae7bf", accessRole: "owner" }] }], jobCount = 1, stolenLease = false, reconnectDuringFailure = false } = {}) {
  const requests = [];
  const updates = [];
  const queued = [];
  const callbacks = [];
  const clientOptions = [];
  let calendarListPage = 0;
  const event = { id: 42, title: "Concerto", date: "2099-10-25", time: "21:00", category };
  const env = {
    NEXTAUTH_SECRET_KEY: "test-secret", NEXTAUTH_URL: "https://events.example",
    ...(configured ? { GOOGLE_CALENDAR_CLIENT_ID: "client", GOOGLE_CALENDAR_CLIENT_SECRET_KEY: "secret" } : {}),
  };
  const connection = { email: "a@example.com", refreshToken: "", calendarId };
  const user = { id: 7, calendarEmail, calendarEventType: eventType, googleCalendar: disconnected ? null : connection };
  const jobs = Array.from({ length: jobCount }, (_, index) => ({
    id: `job-${index}`, userId: 7, eventId: 42 + index, status: "pending", attempts: 0,
    nextAttemptAt: new Date(), leasedUntil: null, event: { ...event, id: 42 + index }, user,
  }));
  const tx = {
    event: { create: async () => event },
    user: { findMany: async () => user.googleCalendar ? [{ id: 7 }] : [] },
    googleCalendarDelivery: { createMany: async ({ data }) => queued.push(...data) },
  };
  const prisma = {
    $transaction: async callback => callback(tx),
    googleCalendarDelivery: {
      findMany: async ({ take }) => jobs.filter(job =>
        (job.status === "pending" && job.nextAttemptAt <= new Date()) ||
        (job.status === "processing" && job.leasedUntil <= new Date())).slice(0, take),
      findUnique: async ({ where }) => jobs.find(job => job.id === where.id),
      updateMany: async ({ where, data }) => {
        updates.push(data);
        const job = jobs.find(job => job.id === where.id);
        if (!job || (data.status === "processing" && !claimed)) return { count: 0 };
        if (where.status && job.status !== where.status) return { count: 0 };
        if (where.leasedUntil && job.leasedUntil?.getTime() !== where.leasedUntil.getTime()) return { count: 0 };
        Object.assign(job, { ...data, attempts: data.attempts ? job.attempts + 1 : job.attempts });
        if (stolenLease && data.status === "processing") job.leasedUntil = new Date(data.leasedUntil.getTime() + 1);
        return { count: 1 };
      },
    },
    googleCalendarConnection: {
      findUnique: async () => user.googleCalendar,
      deleteMany: async () => {
        if (reconnectDuringFailure) {
          user.googleCalendar = { ...connection, refreshToken: context.exports.encryptCalendarToken("refresh-secret", 7) };
          return { count: 0 };
        }
        updates.push({ disconnected: true });
        user.googleCalendar = null;
        return { count: 1 };
      },
    },
  };
  class Client {
    constructor(options) { clientOptions.push(options); }
    setCredentials(credentials) { assert.equal(credentials.refresh_token, "refresh-secret"); }
    async request(options) {
      requests.push(options);
      if (options.url.includes("/users/me/calendarList")) {
        return { data: calendarListPages[calendarListPage++] || { items: [] } };
      }
      if (options.method === "POST" && response !== 200 && !(reconnectDuringFailure && requests.length > 1)) {
        throw { response: { status: response, data: { error: { errors: [{ reason: errorReason }] } } } };
      }
      return { data: { id: requests.find(request => request.method === "POST")?.data.id } };
    }
  }
  const context = {
    exports: {}, Buffer, Date, URL, console, process: { env },
    require: name => {
      if (name === "server-only") return {};
      if (name === "node:crypto") return require(name);
      if (name === "google-auth-library") return { OAuth2Client: Client };
      if (name === "next/server") return { after: callback => callbacks.push(callback) };
      if (name === "./prisma") return { prisma };
      if (name.endsWith("/constants")) return categories;
      if (name.endsWith("/calendar-ics")) return dates;
      if (name.endsWith("/slug-utils")) return { generateUniqueSlug: () => "concerto-42" };
      throw new Error(`Unexpected import ${name}`);
    },
  };
  vm.runInNewContext(compiled, context);
  connection.refreshToken = context.exports.encryptCalendarToken("refresh-secret", 7);
  return { service: context.exports, requests, updates, queued, callbacks, jobs, clientOptions };
}

test("client OAuth usa l'origine richiesta invece del dominio configurato", () => {
  const state = fixture();
  for (const origin of ["http://localhost:3000", "https://schiodejaneiro.vercel.app", "https://events-preview.vercel.app"]) {
    state.service.getGoogleCalendarClient(origin);
    assert.equal(state.clientOptions.at(-1).redirectUri, `${origin}/api/account/google-calendar/callback`);
  }
  state.service.getGoogleCalendarClient();
  assert.equal(state.clientOptions.at(-1).redirectUri, "https://events.example/api/account/google-calendar/callback");
});

test("refresh token cifrati, autenticati e vincolati all'utente", () => {
  const { service } = fixture();
  const encrypted = service.encryptCalendarToken("private-token", 7);
  assert.ok(!encrypted.includes("private-token"));
  assert.equal(service.decryptCalendarToken(encrypted, 7), "private-token");
  assert.throws(() => service.decryptCalendarToken(encrypted, 8));
  assert.throws(() => service.decryptCalendarToken(`${encrypted.slice(0, -3)}abc`, 7));
  assert.notEqual(encrypted, service.encryptCalendarToken("private-token", 7));
});

test("creazione evento accoda indipendentemente dalla categoria EventScanner", async () => {
  const state = fixture();
  await state.service.createEventWithCalendar({ data: {} });
  assert.equal(state.queued.length, 1);
  assert.equal(state.queued[0].eventId, 42);
  assert.equal(state.callbacks.length, 0);
  const other = fixture({ category: "sport" });
  await other.service.createEventWithCalendar({ data: {} });
  assert.equal(other.queued.length, 1);
});

test("connessione Google accoda eventi senza email calendario separata", async () => {
  const state = fixture({ calendarEmail: null });
  await state.service.createEventWithCalendar({ data: {} });
  assert.equal(state.queued.length, 1);
  assert.equal(state.queued[0].eventId, 42);
});

test("connessione Google consegna eventi senza email calendario separata", async () => {
  const state = fixture({ calendarEmail: null });
  await state.service.processCalendarDeliveries();
  assert.equal(state.requests.length, 1);
  assert.equal(state.updates.at(-1).status, "delivered");
});

test("consegna usa il calendario Google selezionato anche nel controllo duplicati", async () => {
  const state = fixture({ response: 409, calendarId: "events" });
  await state.service.processCalendarDeliveries();
  assert.equal(state.requests[0].url, "https://www.googleapis.com/calendar/v3/calendars/events/events");
  assert.equal(state.requests[1].url, `${state.requests[0].url}/${state.requests[0].data.id}`);
  assert.equal(state.updates.at(-1).status, "delivered");
});

test("calendario selezionato eliminato non ripiega su primary", async () => {
  const state = fixture({ response: 404, calendarId: "events" });
  await state.service.processCalendarDeliveries();
  assert.equal(state.requests[0].url, "https://www.googleapis.com/calendar/v3/calendars/events/events");
  assert.equal(state.jobs[0].status, "failed");
  assert.equal(state.updates.at(-1).lastError, "google_calendar_not_found");
});

test("lista Google restituisce calendari scrivibili con nome e colore su tutte le pagine", async () => {
  const state = fixture();
  const calendars = await state.service.listWritableGoogleCalendars(7);
  assert.deepEqual(JSON.parse(JSON.stringify(calendars)), [
    { id: "primary", summary: "Principale", backgroundColor: "#5484ed", primary: true },
    { id: "events", summary: "Eventi", backgroundColor: "#fbd75b", primary: false },
    { id: "routines", summary: "Routines", backgroundColor: "#7ae7bf", primary: false },
  ]);
  const listRequests = state.requests.filter(request => request.url.includes("/users/me/calendarList"));
  assert.equal(listRequests.length, 2);
  assert.ok(listRequests.every(request => request.url.includes("minAccessRole=owner")));
});

test("invio Google usa ID stabile e conferma consegna", async () => {
  const state = fixture();
  await state.service.processCalendarDeliveries();
  assert.equal(state.requests.length, 1);
  assert.equal(state.requests[0].url, "https://www.googleapis.com/calendar/v3/calendars/primary/events");
  assert.match(state.requests[0].data.id, /^[0-9a-v]{64}$/);
  assert.equal(state.requests[0].data.id, state.service.googleCalendarEventId(7, 42));
  assert.notEqual(state.service.googleCalendarEventId(8, 42), state.requests[0].data.id);
  assert.equal(state.updates.at(-1).status, "delivered");
});

test("retry dopo timeout non duplica evento: conflitto 409 verificato come consegnato", async () => {
  const state = fixture({ response: 409 });
  await state.service.processCalendarDeliveries();
  assert.equal(state.requests.length, 2);
  assert.equal(state.updates.at(-1).status, "delivered");
});

test("quota o errore temporaneo mantiene evento in coda senza esporre token", async () => {
  const state = fixture({ response: 429 });
  await state.service.processCalendarDeliveries();
  assert.equal(state.updates.at(-1).status, "pending");
  assert.equal(state.updates.at(-1).lastError, "google_http_429");
  assert.ok(state.updates.at(-1).nextAttemptAt > new Date());
});

test("quota Google HTTP 403 resta ritentabile, tipo non supportato resta segnalato", async () => {
  const quota = fixture({ response: 403, errorReason: "userRateLimitExceeded" });
  await quota.service.processCalendarDeliveries();
  assert.equal(quota.jobs[0].status, "pending");
  const unsupported = fixture({ response: 403, errorReason: "forbidden" });
  await unsupported.service.processCalendarDeliveries();
  assert.equal(unsupported.jobs[0].status, "failed");
});

test("revoca Google conserva tutte le consegne in attesa di ricollegamento", async () => {
  const state = fixture({ response: 401, jobCount: 3 });
  await state.service.processCalendarDeliveries();
  assert.ok(state.updates.some(update => update.disconnected));
  assert.ok(state.jobs.every(job => job.status === "pending" && job.lastError === "google_reconnect_required"));
});

test("credenziali mancanti, worker concorrente e Google non configurato non inviano", async () => {
  for (const options of [{ disconnected: true }, { configured: false }, { claimed: false }, { stolenLease: true }]) {
    const state = fixture(options);
    await state.service.processCalendarDeliveries();
    assert.equal(state.requests.length, 0);
  }
});

test("worker drena piu batch senza lasciare indietro gli invii oltre il decimo", async () => {
  const state = fixture({ jobCount: 20, eventType: "outOfOffice" });
  const result = await state.service.processCalendarDeliveries();
  assert.equal(result.delivered, 20);
  assert.ok(state.requests.every(request => request.data.eventType === "outOfOffice"));
});

test("ricollegamento durante errore del vecchio token riprende la consegna", async () => {
  const state = fixture({ response: 401, reconnectDuringFailure: true });
  await state.service.processCalendarDeliveries();
  assert.equal(state.jobs[0].status, "delivered");
  assert.equal(state.requests.length, 2);
});

function routeFixture({ authenticated = true, admin = true, secret, configured = true, email = "a@example.com", scope, refreshToken = "new-refresh", verified = true, connected = false, missingCalendarColumn = false, origin = "https://events.example", authUrl = "https://events.example" } = {}) {
  const { NextRequest, NextResponse } = require("next/server");
  const state = fixture({ configured });
  const writes = [];
  const tokenExchanges = [];
  const clientOrigins = [];
  const connection = { email, refreshToken: "encrypted-refresh", calendarId: "primary" };
  const writableCalendars = [
    { id: "primary", summary: "Principale", backgroundColor: "#5484ed", primary: true },
    { id: "events", summary: "Eventi", backgroundColor: "#fbd75b", primary: false },
  ];
  const user = { calendarEventType: "default", googleCalendar: null };
  const service = {
    ...state.service,
    listWritableGoogleCalendars: async () => writableCalendars,
    disconnectGoogleCalendar: async userId => writes.push({ disconnected: userId }),
    getGoogleCalendarClient: origin => { clientOrigins.push(origin); return {
      generateCodeVerifierAsync: async () => ({ codeVerifier: "verifier", codeChallenge: "challenge" }),
      generateAuthUrl: options => { writes.push({ authorization: options }); return "https://accounts.google.com/o/oauth2/v2/auth"; },
      getToken: async options => {
        tokenExchanges.push(options);
        return { tokens: { scope: scope ?? ["openid", "email", service.GOOGLE_CALENDAR_SCOPE, service.GOOGLE_CALENDAR_LIST_SCOPE].join(" "), id_token: "id-token", refresh_token: refreshToken } };
      },
      verifyIdToken: async () => ({ getPayload: () => ({ email, email_verified: verified }) }),
    }; },
  };
  const prisma = {
    user: {
      findUnique: async () => user,
      update: async ({ data }) => { writes.push(data); return { ...user, ...data }; },
    },
    googleCalendarConnection: {
      findUnique: async () => {
        if (missingCalendarColumn) throw { code: "P2022", message: "calendarId does not exist" };
        return connected ? connection : null;
      },
      update: async ({ data }) => { Object.assign(connection, data); writes.push(data); return connection; },
      upsert: async options => writes.push(options),
    },
    googleCalendarDelivery: { updateMany: async () => ({ count: 0 }) },
  };
  function load(path) {
    const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const context = {
      exports: {}, Date, URL, Buffer, console, process: { env: { NEXTAUTH_URL: authUrl, GOOGLE_CALENDAR_CLIENT_ID: "client", CRON_SECRET_KEY: secret } },
      require: name => {
        if (name === "node:crypto" || name === "google-auth-library") return require(name);
        if (name === "next/server") return { NextResponse };
        if (name.endsWith("/auth-helpers")) return {
          withAuth: callback => authenticated ? callback(7) : NextResponse.json({ error: "Non autorizzato" }, { status: 401 }),
          withAdminAuth: callback => authenticated && admin ? callback() : NextResponse.json({ error: "Non autorizzato" }, { status: 403 }),
        };
        if (name.endsWith("/prisma")) return { prisma };
        if (name.endsWith("/google-calendar")) return service;
        if (name.endsWith("/constants")) return categories;
        if (name.endsWith("/calendar-ics")) return dates;
        throw new Error(`Unexpected import ${name}`);
      },
    };
    vm.runInNewContext(code, context);
    return context.exports;
  }
  const request = (path, options = {}) => new NextRequest(`${origin}${path}`, options);
  const cookie = (options = {}) => `${service.GOOGLE_CALENDAR_COOKIE}=${service.encryptCalendarToken(JSON.stringify({
    state: "state-123", codeVerifier: "verifier", expiresAt: Date.now() + 60_000, ...options,
  }), 7)}`;
  return { load, request, cookie, writes, tokenExchanges, user, service, connection, writableCalendars, clientOrigins };
}

test("OAuth e ritorno account restano sull'origine iniziale anche con NEXTAUTH_URL localhost", async () => {
  for (const origin of ["http://localhost:3000", "https://schiodejaneiro.vercel.app", "https://events-preview.vercel.app"]) {
    const state = routeFixture({ origin, authUrl: "http://localhost:3000" });
    const start = await state.load("../app/api/account/google-calendar/route.ts").POST(state.request(
      "/api/account/google-calendar", { method: "POST", headers: { origin } },
    ));
    assert.equal(start.status, 200);
    assert.equal(state.clientOrigins[0], origin);
    const callback = state.load("../app/api/account/google-calendar/callback/route.ts");
    const response = await callback.GET(state.request(
      "/api/account/google-calendar/callback?state=state-123&code=code", { headers: { cookie: state.cookie() } },
    ));
    assert.equal(state.clientOrigins[1], origin);
    assert.equal(response.headers.get("location"), `${origin}/account?googleCalendar=connected`);
    const invalid = await callback.GET(state.request("/api/account/google-calendar/callback?state=wrong"));
    assert.equal(invalid.headers.get("location"), `${origin}/account?googleCalendar=invalid_state`);
  }
});

test("preferenze API richiedono login e validano il tipo Google senza email", async () => {
  const path = "../app/api/account/calendar-email/route.ts";
  const anonymous = routeFixture({ authenticated: false });
  assert.equal((await anonymous.load(path).GET()).status, 401);
  const state = routeFixture();
  const invalid = await state.load(path).PUT(state.request("/api/account/calendar-email", {
    method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({ calendarEventType: "musica" }),
  }));
  assert.equal(invalid.status, 400);
  assert.equal(state.writes.length, 0);
  const valid = await state.load(path).PUT(state.request("/api/account/calendar-email", {
    method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({ calendarEventType: "focusTime" }),
  }));
  assert.equal(valid.status, 200);
  assert.equal((await valid.json()).calendarEventType, "focusTime");
});

test("avvio OAuth non richiede email calendario separata", async () => {
  const path = "../app/api/account/google-calendar/route.ts";
  const state = routeFixture();
  assert.equal((await state.load(path).POST(state.request("/api/account/google-calendar", { method: "POST" }))).status, 403);
  const disabled = routeFixture({ configured: false });
  assert.equal((await disabled.load(path).POST(disabled.request("/api/account/google-calendar", {
    method: "POST", headers: { origin: "https://events.example" },
  }))).status, 503);
  const response = await state.load(path).POST(state.request("/api/account/google-calendar", {
    method: "POST", headers: { origin: "https://events.example" },
  }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /HttpOnly/);
  assert.match(response.headers.get("set-cookie"), /SameSite=lax/);
  assert.equal(state.writes[0].authorization.code_challenge_method, "S256");
  assert.ok(state.writes[0].authorization.scope.includes(state.service.GOOGLE_CALENDAR_LIST_SCOPE));
});

test("API calendari restituisce colori e salva solo un ID scrivibile", async () => {
  const path = "../app/api/account/google-calendar/calendars/route.ts";
  const anonymous = routeFixture({ authenticated: false, connected: true });
  assert.equal((await anonymous.load(path).GET()).status, 401);
  const state = routeFixture({ connected: true });
  const listed = await state.load(path).GET();
  assert.equal(listed.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify((await listed.json()).calendars)), state.writableCalendars);
  const invalid = await state.load(path).PUT(state.request("/api/account/google-calendar/calendars", {
    method: "PUT", headers: { origin: "https://events.example", "content-type": "application/json" },
    body: JSON.stringify({ calendarId: "unknown" }),
  }));
  assert.equal(invalid.status, 400);
  assert.equal(state.connection.calendarId, "primary");
  const selected = await state.load(path).PUT(state.request("/api/account/google-calendar/calendars", {
    method: "PUT", headers: { origin: "https://events.example", "content-type": "application/json" },
    body: JSON.stringify({ calendarId: "events" }),
  }));
  assert.equal(selected.status, 200);
  assert.equal((await selected.json()).selectedCalendarId, "events");
  assert.equal(state.connection.calendarId, "events");
});

test("API calendari segnala quando manca la migration calendarId", async () => {
  const state = routeFixture({ connected: true, missingCalendarColumn: true });
  const response = await state.load("../app/api/account/google-calendar/calendars/route.ts").GET();
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "google_calendar_schema_update_required");
});

test("callback rifiuta state errato o scaduto prima dello scambio token", async () => {
  const path = "../app/api/account/google-calendar/callback/route.ts";
  for (const options of [{ state: "wrong" }, { expiresAt: Date.now() - 1000 }]) {
    const state = routeFixture();
    const response = await state.load(path).GET(state.request("/api/account/google-calendar/callback?state=state-123&code=code", {
      headers: { cookie: state.cookie(options) },
    }));
    assert.match(response.headers.get("location"), /invalid_state$/);
    assert.equal(state.tokenExchanges.length, 0);
    assert.equal(state.writes.length, 0);
  }
});

test("callback richiede email Google verificata, refresh token e scope calendario", async () => {
  const path = "../app/api/account/google-calendar/callback/route.ts";
  for (const [options, expected] of [
    [{ verified: false }, "invalid_email"],
    [{ scope: "openid email" }, "missing_scope"],
    [{ scope: `openid email ${routeFixture().service.GOOGLE_CALENDAR_SCOPE}` }, "missing_scope"],
    [{ refreshToken: null }, "missing_token"],
  ]) {
    const state = routeFixture(options);
    const response = await state.load(path).GET(state.request("/api/account/google-calendar/callback?state=state-123&code=code", {
      headers: { cookie: state.cookie() },
    }));
    assert.ok(response.headers.get("location").endsWith(expected));
    assert.equal(state.writes.length, 0);
  }
});

test("callback valido conserva solo refresh token cifrato e cancella cookie OAuth", async () => {
  const state = routeFixture();
  const response = await state.load("../app/api/account/google-calendar/callback/route.ts").GET(state.request(
    "/api/account/google-calendar/callback?state=state-123&code=code", { headers: { cookie: state.cookie() } },
  ));
  assert.match(response.headers.get("location"), /connected$/);
  assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal(state.tokenExchanges[0].codeVerifier, "verifier");
  assert.equal(state.service.decryptCalendarToken(state.writes[0].create.refreshToken, 7), "new-refresh");
  assert.ok(!JSON.stringify(state.writes).includes("new-refresh"));
});

test("cron calendario nega accesso senza secret o con bearer errato", async () => {
  const path = "../app/api/cron/sync-google-calendar/route.ts";
  const missing = routeFixture();
  assert.equal((await missing.load(path).GET(missing.request("/api/cron/sync-google-calendar"))).status, 503);
  const state = routeFixture({ secret: "cron-secret" });
  assert.equal((await state.load(path).GET(state.request("/api/cron/sync-google-calendar", {
    headers: { authorization: "Bearer wrong-secret" },
  }))).status, 401);
  assert.equal((await state.load(path).GET(state.request("/api/cron/sync-google-calendar", {
    headers: { authorization: "Bearer cron-secret" },
  }))).status, 200);
});

test("retry manuale calendario richiede admin e origine same-site", async () => {
  const path = "../app/api/cron/sync-google-calendar/route.ts";
  const state = routeFixture({ admin: false });
  assert.equal((await state.load(path).POST(state.request("/api/cron/sync-google-calendar", {
    method: "POST", headers: { origin: "https://events.example" },
  }))).status, 403);
  const admin = routeFixture();
  assert.equal((await admin.load(path).POST(admin.request("/api/cron/sync-google-calendar", { method: "POST" }))).status, 403);
});