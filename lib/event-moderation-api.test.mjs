import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const routeSource = readFileSync(new URL("../app/api/events/[id]/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(routeSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function createRoute(options = {}) {
  const calls = { favoritesDeleted: [], eventsDeleted: [], storageDeleted: [], invalidated: [] };
  const event = {
    id: 42,
    title: "Evento moderato",
    createdById: 2,
    isPublished: false,
    imageUrl: "https://storage.test/cover",
    originalImageUrl: "https://storage.test/original",
    media: [{ storagePath: "42/gallery.png", url: "https://storage.test/gallery" }],
  };
  const transaction = {
    $queryRaw: async () => [{ id: event.id }],
    favorite: { deleteMany: async query => calls.favoritesDeleted.push(query) },
    event: {
      findUnique: async () => options.missingEvent ? null : event,
      delete: async query => {
        calls.eventsDeleted.push(query);
        if (options.databaseError) throw new Error("database failure");
      },
      findFirst: async query => {
        const references = query.where.OR.flatMap(reference => Object.values(reference));
        return options.sharedUrls?.some(url => references.includes(url)) ? { id: 99 } : null;
      },
    },
  };
  const imports = {
    "next/server": { NextResponse: { json: (body, settings = {}) => ({ body, status: settings.status ?? 200, headers: settings.headers }) } },
    "next/cache": {
      revalidatePath: (...args) => {
        if (options.cacheError) throw new Error("cache failure");
        calls.invalidated.push(args);
      },
      revalidateTag: (...args) => {
        if (options.cacheError) throw new Error("cache failure");
        calls.invalidated.push(args);
      },
    },
    "next-auth/next": { getServerSession: async () => options.session ?? null },
    "@/lib/prisma": { prisma: {
      event: {
        update: async query => {
          if (options.updateError) throw options.updateError;
          return { id: query.where.id, title: event.title, isPublished: query.data.isPublished };
        },
        findUnique: async () => options.missingEvent ? null : event,
      },
      favorite: { deleteMany: async () => {} },
      $transaction: async callback => callback(transaction),
    } },
    "../../../../lib/slug-utils": { generateUniqueSlug: () => "evento-42" },
    "../../../../lib/event-utils": { toIsoDate: value => value },
    "../../../lib/supabase": {
      deleteEventMediaFromSupabase: async path => {
        calls.storageDeleted.push(path);
        if (options.storageError === path) throw new Error("storage failure");
      },
      getEventStoragePathFromPublicUrl: value => value === event.imageUrl ? "42/cover.jpg"
        : value === event.originalImageUrl ? "originals/123e4567-e89b-42d3-a456-426614174000-source.png" : null,
      uploadEventMediaToSupabase: async () => ({}),
      uploadOriginalEventImageToSupabase: async () => ({}),
    },
    "../../../../lib/event-media": { validateEventMediaFile: () => ({ ok: true }), validateOriginalEventImageFile: () => ({ ok: true }) },
    "../../../../lib/cover-image-crop": { isCoverImageCrop: () => true },
    "../../../../pages/api/auth/[...nextauth]": { authOptions: {} },
    "../../../../lib/scan-learning-store": { recordSavedEventCorrections: async () => {} },
  };
  const context = {
    exports: {},
    AbortSignal,
    console: { error() {}, warn() {} },
    require(name) {
      assert.ok(name in imports, `Unexpected dependency: ${name}`);
      return imports[name];
    },
  };
  vm.runInNewContext(compiled, context);
  return { route: context.exports, calls };
}

const adminSession = { user: { id: "1", role: "admin" } };
const adminParams = { params: Promise.resolve({ id: "42" }) };

test("moderation actions reject anonymous and non-admin sessions before mutation", async () => {
  const anonymous = createRoute();
  assert.equal((await anonymous.route.PATCH({ json: async () => ({ isPublished: false }) }, adminParams)).status, 401);
  assert.equal((await anonymous.route.DELETE({}, adminParams)).status, 401);
  assert.equal(anonymous.calls.eventsDeleted.length, 0);

  const user = createRoute({ session: { user: { id: "2", role: "user" } } });
  assert.equal((await user.route.PATCH({ json: async () => ({ isPublished: false }) }, adminParams)).status, 403);
  assert.equal((await user.route.DELETE({}, adminParams)).status, 403);
  assert.equal(user.calls.eventsDeleted.length, 0);
});

test("event owners can fetch their drafts but unrelated users cannot", async () => {
  const owner = createRoute({ session: { user: { id: "2", role: "user" } } });
  assert.equal((await owner.route.GET({}, adminParams)).status, 200);

  const unrelatedUser = createRoute({ session: { user: { id: "3", role: "user" } } });
  assert.equal((await unrelatedUser.route.GET({}, adminParams)).status, 404);
});

test("admin publication changes validate input and invalidate public caches", async () => {
  const { route, calls } = createRoute({ session: adminSession });
  const invalidId = await route.PATCH({ json: async () => ({ isPublished: false }) }, {
    params: Promise.resolve({ id: "42x" }),
  });
  assert.equal(invalidId.status, 400);

  const invalidBody = await route.PATCH({ json: async () => ({ isPublished: "false" }) }, adminParams);
  assert.equal(invalidBody.status, 400);

  const response = await route.PATCH({ json: async () => ({ isPublished: false }) }, adminParams);
  assert.equal(response.status, 200);
  assert.equal(JSON.stringify(response.body), JSON.stringify({ id: 42, title: "Evento moderato", isPublished: false, cacheInvalidated: true }));
  assert.ok(calls.invalidated.some(([path]) => path === "/"));
  assert.ok(calls.invalidated.some(([tag]) => tag === "events-list"));
});

test("committed publication updates report failed cache invalidation without a false failure", async () => {
  const { route } = createRoute({ session: adminSession, cacheError: true });
  const response = await route.PATCH({ json: async () => ({ isPublished: true }) }, adminParams);
  assert.equal(response.status, 200);
  assert.equal(response.body.isPublished, true);
  assert.equal(response.body.cacheInvalidated, false);
});

test("event deletion atomically removes favorites and reports database and storage failures", async () => {
  const databaseFailure = createRoute({ session: adminSession, databaseError: true });
  const failedDelete = await databaseFailure.route.DELETE({}, adminParams);
  assert.equal(failedDelete.status, 500);
  assert.equal(failedDelete.body.deleted, undefined);
  assert.equal(JSON.stringify(databaseFailure.calls.favoritesDeleted), JSON.stringify([{ where: { eventId: 42 } }]));
  assert.deepEqual(databaseFailure.calls.storageDeleted, []);

  const storageFailure = createRoute({ session: adminSession, storageError: "42/cover.jpg" });
  const partial = await storageFailure.route.DELETE({}, adminParams);
  assert.equal(partial.status, 500);
  assert.equal(partial.body.deleted, true);
  assert.equal(JSON.stringify(partial.body.cleanupFailures), JSON.stringify(["42/cover.jpg"]));
  assert.equal(JSON.stringify(storageFailure.calls.favoritesDeleted), JSON.stringify([{ where: { eventId: 42 } }]));
  assert.equal(JSON.stringify(storageFailure.calls.eventsDeleted), JSON.stringify([{ where: { id: 42 } }]));
  assert.equal(JSON.stringify(storageFailure.calls.storageDeleted.sort()), JSON.stringify([
    "42/cover.jpg",
    "42/gallery.png",
    "originals/123e4567-e89b-42d3-a456-426614174000-source.png",
  ]));

  const success = createRoute({ session: adminSession });
  const deleted = await success.route.DELETE({}, adminParams);
  assert.equal(deleted.status, 200);
  assert.equal(JSON.stringify(deleted.body), JSON.stringify({ ok: true, deleted: true, cacheInvalidated: true }));
  assert.equal(success.calls.eventsDeleted.length, 1);
});

test("event deletion does not remove a managed image referenced by another event", async () => {
  const { route, calls } = createRoute({ session: adminSession, sharedUrls: ["https://storage.test/cover", "https://storage.test/original"] });
  const response = await route.DELETE({}, adminParams);
  assert.equal(response.status, 200);
  assert.deepEqual(calls.storageDeleted, ["42/gallery.png"]);
});
