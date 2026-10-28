import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as calendarView from "./calendar-view.ts";
import * as calendarIcs from "./calendar-ics.ts";

const require = createRequire(import.meta.url);
const React = require("react");
const jsxRuntime = require("react/jsx-runtime");
const { renderToStaticMarkup } = require("react-dom/server");

function loadModule(path, imports, globals = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require(name) {
      assert.ok(name in imports, `Unexpected dependency: ${name}`);
      return imports[name];
    },
    ...globals,
  });
  return exports;
}

function publicQuery({ fail = false, events = [] } = {}) {
  const queries = [];
  const caches = [];
  const warnings = [];
  const helpers = loadModule("./public-event-list.ts", {
    "server-only": {},
    "next/cache": { unstable_cache: (callback, key, options) => {
      caches.push({ key, options });
      return callback;
    } },
    "../app/lib/prisma": { prisma: { event: { findMany: async query => {
      queries.push(query);
      if (fail) throw new Error("DATABASE_URL=private-secret");
      return events;
    } } } },
    "./calendar-view": { calendarToday: () => "2026-10-28" },
    "./calendar-ics": calendarIcs,
    luxon: require("luxon"),
  }, { console: { warn: (...args) => warnings.push(args) } });
  return { ...helpers, queries, caches, warnings };
}

test("public queries cap and chronologically order upcoming events with explicit safe fields", async () => {
  const helper = publicQuery();
  await helper.getPublicEventList();
  await helper.getPublicEventList("today");
  await helper.getPublicCalendarEvents();
  for (const [index, query] of helper.queries.entries()) {
    assert.equal(query.take, 2000);
    assert.equal(JSON.stringify(query.orderBy), JSON.stringify([{ date: "asc" }, { time: "asc" }, { id: "asc" }]));
    assert.equal(JSON.stringify(query.where), JSON.stringify({ OR: [{ date: { gte: "2026-10-28" } }, { date: { contains: "/" } }] }));
    assert.deepEqual(Object.keys(query.select).sort(), (index === 2
      ? ["id", "title", "date", "time", "location", "imageUrl"]
      : ["id", "title", "date", "time", "location", "imageUrl", "description", "organizer", "category", "price"]).sort());
    assert.ok(Object.values(query.select).every(value => value === true));
  }
  for (const cache of helper.caches) {
    assert.equal(cache.options.revalidate, 60);
    assert.deepEqual([...cache.options.tags], ["events-list"]);
  }
});

test("database failures remain distinct from successful empty seeds without logging raw errors", async () => {
  const helper = publicQuery({ fail: true });
  assert.equal(await helper.getPublicEventList(), undefined);
  assert.equal(await helper.getPublicCalendarEvents(), undefined);
  assert.equal((await publicQuery().getPublicEventList()).length, 0);
  assert.equal(helper.warnings.length, 2);
  assert.ok(helper.warnings.every(args => args.length === 1));
  assert.doesNotMatch(JSON.stringify(helper.warnings), /private-secret|DATABASE_URL/);
});

test("public seeds normalize supported stored dates before range filtering and omit malformed timestamps", async () => {
  const rows = [
    fixture(1, "2026-10-28T00:00:00.000Z"), fixture(2, "12/11/2026"), fixture(3, "27/10/2026"),
    fixture(4, "2026-10-28T99:99:99Z"), fixture(5, "2026-10-28"),
  ];
  const helper = publicQuery({ events: rows });
  const upcoming = await helper.getPublicEventList();
  assert.deepEqual(Array.from(upcoming, event => event.id), [1, 5, 2]);
  assert.deepEqual(Array.from(upcoming, event => event.date), ["2026-10-28", "2026-10-28", "2026-11-12"]);
  assert.deepEqual(Array.from(await helper.getPublicEventList("today"), event => event.id), [1, 5]);
  assert.equal(rows[0].date, "2026-10-28T00:00:00.000Z");
  assert.equal((await publicQuery({ events: Array.from({ length: 250 }, (_, index) => fixture(index + 1, "2026-10-28")) }).getPublicEventList()).length, 200);
});

function eventListComponent(today) {
  return loadModule("../app/components/EventList.tsx", {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "next/image": { default: "img" },
    gsap: { gsap: {} },
    "../../lib/slug-utils": { generateUniqueSlug: (_, id) => `evento-${id}` },
    "../../lib/event-display": { getEventStartTime: value => value },
    "./TransitionLink": { TransitionLink: "a" },
    "../lib/gtm": {},
    "../lib/analytics": {},
    "../../lib/constants": { STANDARD_CATEGORIES: ["musica"] },
    "../../lib/calendar-view": today ? { ...calendarView, calendarToday: () => today } : calendarView,
    "./FavoriteButton": { default: () => null },
    "./EventIcons": { AppIcon: () => null, CalendarIcon: () => null, MapPinIcon: () => null },
    "./EventCategoryIcon": { default: () => null },
  }).default;
}

function localDate(offset = 0) {
  const date = new Date(`${calendarView.calendarToday()}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function fixture(id = 7, date = localDate()) {
  return { id, title: "Concerto pubblico", date, description: "Musica dal vivo", time: "20:30", location: "Schio", organizer: "Teatro", category: "musica", price: "gratis", imageUrl: null };
}

test("existing cards render title, date, place and canonical links in SSR before effects", () => {
  const EventList = eventListComponent();
  for (const mode of ["quick", "full"]) {
    const html = renderToStaticMarkup(React.createElement(EventList, {
      mode, initialEvents: [fixture(), fixture(8, localDate(1)), fixture(9, localDate(-1))],
    }));
    assert.match(html, /href="\/events\/evento-7"/);
    assert.match(html, /Concerto pubblico/);
    assert.match(html, /Schio/);
    assert.match(html, /20:30/);
    assert.match(html, new RegExp(new Date(`${localDate()}T12:00:00`).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" })));
    assert.doesNotMatch(html, /Caricamento eventi/);
    assert.doesNotMatch(html, /href="\/events\/evento-9"/);
    assert.equal(html.includes('href="/events/evento-8"'), mode === "full");
    if (mode === "full") assert.match(html, /Cerca eventi/);
  }
});

test("optional seed preserves loading, empty results and quick pagination", () => {
  const EventList = eventListComponent();
  assert.match(renderToStaticMarkup(React.createElement(EventList)), /Caricamento eventi/);
  assert.match(renderToStaticMarkup(React.createElement(EventList, { initialEvents: [] })), /Nessun evento trovato/);
  const html = renderToStaticMarkup(React.createElement(EventList, {
    mode: "quick", initialEvents: Array.from({ length: 13 }, (_, index) => fixture(index + 1)),
  }));
  assert.equal((html.match(/class="event-card group/g) || []).length, 12);
  assert.match(html, /Mostra altri/);
});

test("seeded first render stays identical across Rome midnight until effects run", () => {
  const initialToday = "2026-10-28";
  const props = { mode: "quick", initialToday, initialEvents: [fixture(1, initialToday), fixture(2, "2026-10-29")] };
  const server = renderToStaticMarkup(React.createElement(eventListComponent(initialToday), props));
  const client = renderToStaticMarkup(React.createElement(eventListComponent("2026-10-29"), props));
  assert.equal(server, client);
  assert.match(client, /href="\/events\/evento-1"/);
  assert.doesNotMatch(client, /href="\/events\/evento-2"/);
});

test("home owns its metadata and both server pages pass their public seeds to existing cards", async () => {
  const EventList = eventListComponent();
  for (const path of ["../app/page.tsx", "../app/eventi/page.tsx"]) {
    const ranges = [];
    const helper = { getPublicEventList: async range => { ranges.push(range); return [fixture()]; } };
    const route = loadModule(path, {
      "react/jsx-runtime": jsxRuntime,
      "./components/EventList": { default: EventList },
      "../components/EventList": { default: EventList },
      "next/link": { default: "a" },
      "./components/HomeMotion": { default: ({ children }) => children },
      "../lib/public-event-list": helper,
      "../../lib/public-event-list": helper,
      "../lib/seo-metadata": { publicPageMetadata: value => value },
      "../lib/calendar-view": calendarView,
      "../../lib/calendar-view": calendarView,
    });
    const html = renderToStaticMarkup(await route.default());
    assert.match(html, /href="\/events\/evento-7"/);
    assert.equal(route.revalidate, 60);
    assert.equal(ranges[0], path === "../app/page.tsx" ? "today" : undefined);
    if (path === "../app/page.tsx") assert.equal(route.metadata.path, "/");
  }
});

const provider = loadModule("../app/components/PublicEventsProvider.tsx", {
  react: React, "react/jsx-runtime": jsxRuntime,
});

async function seededLayout(path, children, events = [fixture()]) {
  const layout = loadModule(path, {
    "react/jsx-runtime": jsxRuntime,
    "../../lib/seo-metadata": { publicPageMetadata: value => value },
    "../../lib/public-event-list": { getPublicCalendarEvents: async () => events },
    "../components/PublicEventsProvider": provider,
    "../../lib/calendar-view": calendarView,
  });
  assert.equal(layout.revalidate, 60);
  return layout.default({ children });
}

test("calendar server layout seeds the actual grid with accessible links without running effects", async () => {
  const page = loadModule("../app/tutti-gli-eventi/page.tsx", {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "next/image": { default: "img" },
    "lucide-react": require("lucide-react"),
    "../components/TransitionLink": { TransitionLink: "a" },
    "../../lib/slug-utils": { generateUniqueSlug: (_, id) => `evento-${id}` },
    "../../lib/calendar-ics": calendarIcs,
    "../../lib/calendar-view": calendarView,
    "../components/PublicEventsProvider": provider,
  });
  const html = renderToStaticMarkup(await seededLayout("../app/tutti-gli-eventi/layout.tsx", React.createElement(page.default)));
  assert.match(html, /href="\/events\/evento-7"/);
  assert.match(html, /Concerto pubblico/);
  assert.match(html, /20:30/);
  assert.match(html, new RegExp(`data-date="${calendarView.calendarToday()}"`));
  assert.match(html, /Visualizzazione calendario/);
  assert.doesNotMatch(html, /Caricamento eventi/);
});

test("map server layout renders real links, dates and locations through the browser-only map fallback", async () => {
  const page = loadModule("../app/mappa/page.tsx", {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "next/link": { default: "a" },
    "next/dynamic": { default: require("next/dynamic") },
    "../components/PublicEventsProvider": provider,
    "../../lib/slug-utils": { generateUniqueSlug: (_, id) => `evento-${id}` },
    "../../lib/calendar-view": calendarView,
  });
  const html = renderToStaticMarkup(await seededLayout("../app/mappa/layout.tsx", React.createElement(page.default)));
  assert.match(html, /href="\/events\/evento-7"/);
  assert.match(html, /Concerto pubblico/);
  assert.match(html, /Schio/);
  assert.match(html, new RegExp(`dateTime="${calendarView.calendarToday()}"`));
  assert.match(html, /href="\/eventi"/);
  const empty = renderToStaticMarkup(await seededLayout("../app/mappa/layout.tsx", React.createElement(page.default), []));
  assert.match(empty, /Nessun evento disponibile/);
  assert.match(empty, /href="\/eventi"/);
});