import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import sharp from "sharp";
import { cropPosterPreview, parsePosterBounds } from "./poster-crop.ts";
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

test("crop export preserves square, portrait and custom proportions", () => {
  for (const [width, height] of [[3000, 3000], [2400, 3000], [2700, 4800], [2100, 4900], [500, 200]]) {
    const output = getCropOutputSize(width, height);
    assert.ok(output.width <= 1920);
    assert.ok(output.height <= 1080);
    assert.ok(output.width <= width && output.height <= height);
    assert.ok(Math.abs(output.width - output.height * width / height) <= 1);
  }
});

const require = createRequire(import.meta.url);

test("automatic poster crop accepts only confident bounds inside the original image", () => {
  const bounds = { x: 0.1, y: 0.2, width: 0.8, height: 0.6, confidence: 0.95 };
  assert.deepEqual(parsePosterBounds(`Analisi\nPOSTER_BOUNDS: ${JSON.stringify(bounds)}`), bounds);
  for (const value of [null, {}, { ...bounds, confidence: 0.5 }, { ...bounds, x: -0.1 },
    { ...bounds, width: 1 }, { ...bounds, height: 0 }, { ...bounds, width: 0.01 },
    { ...bounds, x: 0, y: 0, width: 1, height: 1 }]) {
    assert.equal(parsePosterBounds(`POSTER_BOUNDS: ${JSON.stringify(value)}`), null);
  }
  assert.equal(parsePosterBounds("Vision non disponibile"), null);
  assert.equal(parsePosterBounds("POSTER_BOUNDS: non valido"), null);
});

test("automatic poster crop excludes screenshot surroundings and leaves original unchanged", async () => {
  const screenshot = await sharp({ create: { width: 200, height: 300, channels: 3, background: "white" } })
    .composite([{ input: await sharp({ create: { width: 160, height: 180, channels: 3, background: "red" } }).png().toBuffer(), left: 20, top: 60 }])
    .png().toBuffer();
  const file = new File([screenshot], "screenshot.png", { type: "image/png" });
  const preview = await cropPosterPreview(file, 'POSTER_BOUNDS: {"x":0.1,"y":0.2,"width":0.8,"height":0.6,"confidence":0.99}');
  assert.ok(preview?.startsWith("data:image/jpeg;base64,"));
  const cropped = sharp(Buffer.from(preview.split(",")[1], "base64"));
  const metadata = await cropped.metadata();
  assert.equal(metadata.width, 160);
  assert.equal(metadata.height, 180);
  const { channels } = await cropped.stats();
  assert.ok(channels[0].mean > 240 && channels[1].mean < 15 && channels[2].mean < 15);
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), screenshot);
  assert.equal(await cropPosterPreview(file, ""), undefined);
});

test("image processing returns automatic cover and still extracts events when vision fails", async () => {
  const { NextRequest, NextResponse } = require("next/server");
  const code = ts.transpileModule(readFileSync(new URL("../app/api/process-image/route.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const screenshot = await sharp({ create: { width: 200, height: 300, channels: 3, background: "white" } }).png().toBuffer();
  for (const visionFails of [false, true]) {
    const calls = [];
    class Client {
      chat = { completions: { create: async options => {
        calls.push(options);
        if (options.model === "gpt-4o-mini") {
          if (visionFails) throw new Error("Vision unavailable");
          return { choices: [{ message: { content: 'Concerto a Schio il 01/12/2026 ore 20:00\nPOSTER_BOUNDS: {"x":0.1,"y":0.2,"width":0.8,"height":0.6,"confidence":0.99}' } }] };
        }
        return { choices: [{ message: { content: JSON.stringify({ title: "Concerto", date: "01/12/2026", time: "20:00", location: "Schio", description: "Concerto a Schio", organizer: "Organizzatore", category: "music", price: "Gratis" }) } }] };
      } } };
    }
    const context = {
      exports: {}, File, Buffer, Date, URL,
      console: { log() {}, warn() {}, error() {} },
      process: { env: { GROQ_API_SECRET_KEY: "test-groq", OPENAI_API_SECRET_KEY: "test-openai" } },
      require: name => {
        if (name === "next/server") return { NextResponse };
        if (name === "groq-sdk" || name === "openai") return { default: Client, __esModule: true };
        if (name.endsWith("/ocr-simple")) return { extractTextFromImageSimple: async () => "Concerto a Schio il 01/12/2026 ore 20:00" };
        if (name.endsWith("/ocr")) return { extractTextFromImage: async () => "" };
        if (name.endsWith("/image-utils")) return { compressImage: async file => file };
        if (name.endsWith("/poster-crop")) return { cropPosterPreview };
        if (name.endsWith("/event-utils")) return { groupEventsByDate: events => events };
        if (name.endsWith("/event-hints")) return { buildEventExtractionHints: () => "" };
        if (name.endsWith("/extension-cors")) return { withExtensionCors: response => response, extensionCorsPreflight() {} };
        if (name.endsWith("/google-search")) return { isWebSearchConfigured: () => false };
        throw new Error(`Unexpected import ${name}`);
      },
    };
    vm.runInNewContext(code, context);
    const form = new FormData();
    form.append("image", new File([screenshot], "screenshot.png", { type: "image/png" }));
    const response = await context.exports.POST(new NextRequest("https://events.example/api/process-image", { method: "POST", body: form }));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.events[0].title, "Concerto");
    assert.ok(calls[0].messages[0].content[1].text.includes("POSTER_BOUNDS:"));
    if (visionFails) assert.equal(result.previewImageDataUrl, undefined);
    else {
      const metadata = await sharp(Buffer.from(result.previewImageDataUrl.split(",")[1], "base64")).metadata();
      assert.equal(metadata.width, 160);
      assert.equal(metadata.height, 180);
    }
  }
});

test("free crop has no aspect constraint and exports selection in original image pixels", () => {
  const values = [];
  let hookIndex = 0;
  const completed = [];
  const imageRef = { current: { naturalWidth: 2400, naturalHeight: 3000 } };
  const code = ts.transpileModule(readFileSync(new URL("../app/components/EventImageCropper.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const context = {
    exports: {},
    require: name => {
      if (name === "react") return { useRef: () => imageRef, useState: initial => {
        const index = hookIndex++;
        if (values[index] === undefined) values[index] = initial;
        return [values[index], value => { values[index] = value; }];
      } };
      if (name === "react/jsx-runtime") return require(name);
      if (name === "react-image-crop") return { default: "cropper", __esModule: true };
      if (name.endsWith(".css")) return {};
      throw new Error(`Unexpected import ${name}`);
    },
  };
  vm.runInNewContext(code, context);
  const render = () => {
    hookIndex = 0;
    const nodes = [];
    const visit = element => {
      if (!element || typeof element !== "object") return;
      if (Array.isArray(element)) return element.forEach(visit);
      nodes.push(element);
      visit(element.props?.children);
    };
    visit(context.exports.default({ image: "/poster.jpg", onCropComplete: (_, pixels) => completed.push(pixels) }));
    return nodes;
  };
  render().find(element => element.type === "img").props.onLoad();
  assert.deepEqual(JSON.parse(JSON.stringify(completed[0])), { x: 240, y: 300, width: 1920, height: 2400 });
  for (const selection of [
    { unit: "%", x: 10, y: 20, width: 30, height: 70 },
    { unit: "%", x: 0, y: 0, width: 100, height: 20 },
  ]) {
    const cropper = render().find(element => element.type === "cropper");
    assert.equal(cropper.props.aspect, undefined);
    cropper.props.onChange({}, selection);
    cropper.props.onComplete({}, selection);
    assert.equal(render().find(element => element.type === "cropper").props.crop, selection);
    assert.equal(completed.at(-1).width, 2400 * selection.width / 100);
    assert.equal(completed.at(-1).height, 3000 * selection.height / 100);
    assert.equal(completed.at(-1).x, 2400 * selection.x / 100);
    assert.equal(completed.at(-1).y, 3000 * selection.y / 100);
  }
  assert.equal(render().filter(element => element.type === "select").length, 0);
});

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
