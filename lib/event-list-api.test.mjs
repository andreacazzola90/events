import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const routeSource = readFileSync(new URL("../app/api/events/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(routeSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function createRoute(session = null, events = [{ id: 8, title: "Evento", isPublished: true }]) {
  const queries = [];
  const imports = {
    "next/server": {
      after() {},
      NextResponse: { json: (body, settings = {}) => ({ body, status: settings.status ?? 200, headers: settings.headers }) },
    },
    "@/lib/prisma": { prisma: { event: { findMany: async query => { queries.push(query); return events; } } } },
    "../../lib/google-calendar": { scheduleCalendarDeliveries() {} },
    "../../lib/supabase": {
      deleteEventMediaFromSupabase: async () => {},
      uploadEventMediaToSupabase: async () => ({}),
      uploadImageToSupabase: async () => "",
      uploadOriginalEventImageToSupabase: async () => ({}),
    },
    "@/lib/geocoding": { geocodeLocation: async () => ({}) },
    "next/cache": {
      revalidatePath() {},
      revalidateTag() {},
      unstable_cache: callback => callback,
    },
    "next-auth/next": { getServerSession: async () => session },
    "../../../pages/api/auth/[...nextauth]": { authOptions: {} },
    "../../../lib/slug-utils": { generateUniqueSlug: () => "evento-8" },
    "../../../lib/event-duplicates": { findDuplicateEvent: async () => null },
    "../../../lib/event-utils": { toIsoDate: value => value },
    "../../../lib/extension-auth": { authenticateExtensionRequest: async () => null },
    "../../../lib/extension-cors": {
      extensionCorsPreflight: () => ({}),
      withExtensionCors: response => response,
    },
    "../../../lib/scan-learning-store": { recordScanCorrections: async () => {} },
    "../../../lib/event-series-create": { createEventWithSeries: async () => ({}) },
    "../../../lib/event-media": {
      redactOriginalEventImageMetadata: eventValue => eventValue,
      validateEventMediaFile: () => ({ ok: true }),
      validateOriginalEventImageFile: () => ({ ok: true }),
    },
    "../../../lib/cover-image-crop": { isCoverImageCrop: () => true },
  };
  const context = {
    exports: {},
    URL,
    console: { log() {}, warn() {}, error() {} },
    require(name) {
      assert.ok(name in imports, `Unexpected dependency: ${name}`);
      return imports[name];
    },
  };
  vm.runInNewContext(compiled, context);
  return { GET: context.exports.GET, queries };
}

function request(query) {
  return { url: `https://example.test/api/events?${query}` };
}

test("event list excludes drafts by default and only an authenticated admin can include them", async () => {
  const publicRoute = createRoute();
  const publicResponse = await publicRoute.GET(request("limit=5&includePast=true"));
  assert.equal(publicResponse.status, 200);
  assert.equal(publicRoute.queries[0].where.isPublished, true);
  assert.equal(publicResponse.headers["Cache-Control"], "public, s-maxage=60, stale-while-revalidate=300");

  const anonymousRoute = createRoute();
  assert.equal((await anonymousRoute.GET(request("includeDrafts=true"))).status, 401);
  const userRoute = createRoute({ user: { role: "user" } });
  assert.equal((await userRoute.GET(request("includeDrafts=true"))).status, 403);
  assert.equal(userRoute.queries.length, 0);

  const adminRoute = createRoute({ user: { role: "admin" } }, [
    { id: 8, title: "Evento", date: "2026-12-01", location: "Schio", isPublished: true },
    { id: 9, title: "Evento", date: "2026-12-01", location: "Schio", isPublished: false },
  ]);
  const adminResponse = await adminRoute.GET(request("includeDrafts=true&includePast=true"));
  assert.equal(adminResponse.status, 200);
  assert.equal(adminResponse.body.length, 2);
  assert.equal(adminRoute.queries.length, 1);
  assert.equal("isPublished" in adminRoute.queries[0].where, false);
  assert.equal(adminResponse.headers["Cache-Control"], "private, no-store");
});
