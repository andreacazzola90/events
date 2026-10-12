import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { getCropOutputSize, MAX_EVENT_ATTACHMENTS, MAX_EVENT_MEDIA_BYTES, MAX_EVENT_MEDIA_REQUEST_BYTES, validateEventMediaFile } from "./event-media.ts";

const signatures = {
  jpeg: Uint8Array.from([0xff, 0xd8, 0xff, 0x00]),
  png: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  webp: Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]),
  pdf: new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n"),
};

test("accepts supported media when extension, MIME, and file signature match", () => {
  assert.deepEqual(validateEventMediaFile("cover.jpg", "image/jpeg", signatures.jpeg), { ok: true, kind: "image" });
  assert.deepEqual(validateEventMediaFile("flyer.png", "image/png", signatures.png), { ok: true, kind: "image" });
  assert.deepEqual(validateEventMediaFile("gallery.webp", "image/webp", signatures.webp), { ok: true, kind: "image" });
  assert.deepEqual(validateEventMediaFile("program.pdf", "application/pdf", signatures.pdf), { ok: true, kind: "pdf" });
});

test("rejects unsupported, mismatched, or spoofed files", () => {
  assert.equal(validateEventMediaFile("archive.zip", "application/zip", signatures.pdf).ok, false);
  assert.equal(validateEventMediaFile("fake.jpg", "image/jpeg", signatures.pdf).ok, false);
  assert.equal(validateEventMediaFile("truncated.pdf", "application/pdf", new TextEncoder().encode("%PDF-1.7\n")).ok, false);
  assert.equal(validateEventMediaFile("fake.pdf", "application/pdf", signatures.png).ok, false);
  assert.equal(validateEventMediaFile("image.jpg", "image/png", signatures.jpeg).ok, false);
});

test("enforces per-file upload size and attachment count limits", () => {
  assert.equal(MAX_EVENT_MEDIA_BYTES, 4 * 1024 * 1024);
  assert.equal(MAX_EVENT_ATTACHMENTS, 10);
  assert.equal(validateEventMediaFile("large.pdf", "application/pdf", signatures.pdf, MAX_EVENT_MEDIA_BYTES + 1).ok, false);
});

test("crop export dimensions stay within a safe 16:9 canvas size", () => {
  const output = getCropOutputSize(6000, 3375);
  assert.ok(output.width <= 1920);
  assert.ok(output.height <= 1080);
  assert.equal(output.width / output.height, 16 / 9);
});

const require = createRequire(import.meta.url);

function mediaRouteFixture({ authenticated = true, userId = 7, eventOwner = 7, email = "user@example.com", currentCount = 0, countAfterPrecheck, deleteStorageFails = false } = {}) {
  const { NextRequest, NextResponse } = require("next/server");
  const writes = [];
  let countCalls = 0;
  const event = { id: 11, createdById: eventOwner, imageUrl: null };
  const mediaRecords = [];
  const prisma = {
    event: {
      findUnique: async () => event,
      update: async ({ data }) => { Object.assign(event, data); writes.push({ event: data }); return event; },
    },
    eventMedia: {
      count: async () => countCalls++ === 0 ? currentCount : countAfterPrecheck ?? currentCount + mediaRecords.length,
      aggregate: async () => ({ _max: { position: mediaRecords.length ? mediaRecords.length - 1 : null } }),
      create: async ({ data }) => { const row = { id: mediaRecords.length + 1, ...data }; mediaRecords.push(row); writes.push({ media: data }); return row; },
      findFirst: async ({ where }) => mediaRecords.find(item => item.id === where.id && item.eventId === where.eventId) || null,
      delete: async ({ where }) => { const index = mediaRecords.findIndex(item => item.id === where.id); if (index >= 0) mediaRecords.splice(index, 1); },
    },
  };
  prisma.$transaction = async callback => callback({
    $queryRaw: async () => [],
    eventMedia: prisma.eventMedia,
  });
  const code = ts.transpileModule(readFileSync(new URL("../app/api/events/[id]/media/route.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = {
    exports: {}, File, Request, Buffer, Date, URL, console,
    require: name => {
      if (name === "next/server") return { NextRequest, NextResponse };
      if (name === "next-auth/next") return { getServerSession: async () => authenticated ? { user: { id: String(userId), email } } : null };
      if (name.endsWith("/[...nextauth]")) return { authOptions: {} };
      if (name.endsWith("/prisma")) return { prisma };
      if (name.endsWith("/supabase")) return {
        uploadEventMediaToSupabase: async file => ({ storagePath: `11/${file.name}`, url: `https://storage.example/11/${file.name}` }),
        deleteEventMediaFromSupabase: async path => { if (deleteStorageFails) throw new Error("storage unavailable"); writes.push({ deletedStoragePath: path }); },
      };
      if (name.endsWith("/event-media")) return { MAX_EVENT_ATTACHMENTS, MAX_EVENT_MEDIA_REQUEST_BYTES, validateEventMediaFile };
      throw new Error(`Unexpected import ${name}`);
    },
  };
  vm.runInNewContext(code, context);
  const request = (path, formData, method = "POST") => new NextRequest(`https://events.example${path}`, { method, ...(formData ? { body: formData } : {}) });
  const params = Promise.resolve({ id: "11" });
  return { handlers: context.exports, request, params, writes, event, mediaRecords };
}

test("media API requires owner authorization and rejects spoofed/oversized files", async () => {
  const unauthorized = mediaRouteFixture({ authenticated: false });
  const denied = await unauthorized.handlers.POST(unauthorized.request("/api/events/11/media", new FormData()), { params: unauthorized.params });
  assert.equal(denied.status, 401);

  const state = mediaRouteFixture();
  const spoofedForm = new FormData();
  spoofedForm.append("kind", "image");
  spoofedForm.append("file", new File([signatures.pdf], "fake.jpg", { type: "image/jpeg" }));
  const spoofed = await state.handlers.POST(state.request("/api/events/11/media", spoofedForm), { params: state.params });
  assert.equal(spoofed.status, 400);
  assert.equal(state.mediaRecords.length, 0);

  const oversizedForm = new FormData();
  oversizedForm.append("kind", "pdf");
  oversizedForm.append("file", new File([new Uint8Array(MAX_EVENT_MEDIA_BYTES + 1)], "large.pdf", { type: "application/pdf" }));
  const oversized = await state.handlers.POST(state.request("/api/events/11/media", oversizedForm), { params: state.params });
  assert.equal(oversized.status, 400);
  assert.equal(state.mediaRecords.length, 0);

  const oversizedRequestForm = new FormData();
  oversizedRequestForm.append("kind", "pdf");
  oversizedRequestForm.append("file", new File([new Uint8Array(MAX_EVENT_MEDIA_REQUEST_BYTES)], "large.pdf", { type: "application/pdf" }));
  const oversizedRequest = await state.handlers.POST(state.request("/api/events/11/media", oversizedRequestForm), { params: state.params });
  assert.equal(oversizedRequest.status, 413);
  assert.equal(state.mediaRecords.length, 0);
});

test("media API persists a valid PDF record after upload", async () => {
  const state = mediaRouteFixture();
  const formData = new FormData();
  formData.append("kind", "pdf");
  formData.append("file", new File([signatures.pdf], "programma.pdf", { type: "application/pdf" }));
  const response = await state.handlers.POST(state.request("/api/events/11/media", formData), { params: state.params });
  assert.equal(response.status, 201);
  assert.equal(state.mediaRecords[0].kind, "pdf");
  assert.equal(state.mediaRecords[0].fileName, "programma.pdf");
});

test("media API never allows a different event owner to upload", async () => {
  const state = mediaRouteFixture({ userId: 8, eventOwner: 7 });
  const formData = new FormData();
  formData.append("kind", "pdf");
  formData.append("file", new File([signatures.pdf], "programma.pdf", { type: "application/pdf" }));
  const response = await state.handlers.POST(state.request("/api/events/11/media", formData), { params: state.params });
  assert.equal(response.status, 403);
  assert.equal(state.mediaRecords.length, 0);
});

test("cover edit API does not grant admin by matching only an email prefix", async () => {
  const { NextRequest, NextResponse } = require("next/server");
  const writes = [];
  const prisma = {
    event: {
      findUnique: async () => ({ id: 11, createdById: 7 }),
      update: async ({ data }) => { writes.push(data); return { id: 11, ...data }; },
    },
  };
  const code = ts.transpileModule(readFileSync(new URL("../app/api/events/[id]/route.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = {
    exports: {}, console,
    require: name => {
      if (name === "next/server") return { NextRequest, NextResponse };
      if (name === "next-auth/next") return { getServerSession: async () => ({ user: { id: "8", email: "andreacazzola90@attacker.test" } }) };
      if (name.endsWith("/[...nextauth]")) return { authOptions: {} };
      if (name.endsWith("/prisma")) return { prisma };
      if (name.endsWith("/slug-utils")) return { generateUniqueSlug: () => "event-11" };
      if (name.endsWith("/event-utils")) return { toIsoDate: value => value };
      if (name === "next/cache") return { revalidatePath() {}, revalidateTag() {} };
      if (name.endsWith("/supabase")) return { uploadEventMediaToSupabase: async () => ({}) };
      if (name.endsWith("/event-media")) return { validateEventMediaFile };
      throw new Error(`Unexpected import ${name}`);
    },
  };
  vm.runInNewContext(code, context);
  const request = new NextRequest("https://events.example/api/events/11", {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Tentativo" }),
  });
  const response = await context.exports.PUT(request, { params: Promise.resolve({ id: "11" }) });
  assert.equal(response.status, 403);
  assert.equal(writes.length, 0);
});

test("media API does not grant admin by matching only an email prefix", async () => {
  const state = mediaRouteFixture({ userId: 8, eventOwner: 7, email: "andreacazzola90@attacker.test" });
  const formData = new FormData();
  formData.append("kind", "pdf");
  formData.append("file", new File([signatures.pdf], "programma.pdf", { type: "application/pdf" }));
  const response = await state.handlers.POST(state.request("/api/events/11/media", formData), { params: state.params });
  assert.equal(response.status, 403);
  assert.equal(state.mediaRecords.length, 0);
});

test("media API enforces attachment count after upload and cleans the object", async () => {
  const state = mediaRouteFixture({ currentCount: MAX_EVENT_ATTACHMENTS - 1, countAfterPrecheck: MAX_EVENT_ATTACHMENTS });
  const formData = new FormData();
  formData.append("kind", "pdf");
  formData.append("file", new File([signatures.pdf], "programma.pdf", { type: "application/pdf" }));
  const response = await state.handlers.POST(state.request("/api/events/11/media", formData), { params: state.params });
  assert.equal(response.status, 400);
  assert.equal(state.mediaRecords.length, 0);
  assert.ok(state.writes.some(write => write.deletedStoragePath));
});

test("media delete keeps its row when storage cleanup fails so users can retry", async () => {
  const state = mediaRouteFixture({ deleteStorageFails: true });
  state.mediaRecords.push({ id: 3, eventId: 11, storagePath: "11/program.pdf", kind: "pdf" });
  const response = await state.handlers.DELETE(state.request("/api/events/11/media?mediaId=3", null, "DELETE"), { params: state.params });
  assert.equal(response.status, 500);
  assert.equal(state.mediaRecords.length, 1);
});
