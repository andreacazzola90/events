import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import sharp from "sharp";
import { normalizeEventTitle } from "./event-title.ts";
import { cropPosterPreview, isPosterPrivacySafe, parsePosterBounds } from "./poster-crop.ts";
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

function visionFixture(env, respond, clock = Date) {
  const calls = [];
  const clients = [];
  class Client {
    constructor(config) { this.config = config; clients.push(config); }
    chat = { completions: { create: async options => {
      calls.push({ ...options, baseURL: this.config.baseURL });
      return respond(options, this.config, calls.length);
    } } };
  }
  const code = ts.transpileModule(readFileSync(new URL('./vision-ai.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = {
    exports: {}, Date: clock, process: { env }, console: { warn() {} },
    require: name => {
      if (name === 'openai') return { default: Client, __esModule: true };
      throw new Error(`Unexpected import ${name}`);
    },
  };
  vm.runInNewContext(code, context);
  return { ...context.exports, calls, clients };
}

test('NVIDIA is the default vision provider and never overrides completed privacy verdicts', async () => {
  const env = {
    NVIDIA_API_SECRET_KEY: 'test-nvidia', GEMINI_API_SECRET_KEY: 'test-gemini',
    OPENROUTER_API_SECRET_KEY: 'test-openrouter', GROQ_API_SECRET_KEY: 'test-groq',
    OPENROUTER_VISION_MODEL: 'vendor/vision:free',
  };
  const approval = 'POSTER_PRIVACY: {"safe":true,"confidence":0.99}';
  const state = visionFixture(env, () => ({ choices: [{ finish_reason: 'stop', message: { content: approval } }] }));
  assert.equal(await state.analyzeEventImage('data:image/png;base64,test', 'Check flyer'), approval);
  assert.deepEqual(state.calls.map(call => call.model), ['nvidia/nemotron-3.5-super-vl-120b-a12b']);
  assert.equal(state.clients[0].baseURL, 'https://integrate.api.nvidia.com/v1');
  assert.equal(state.clients[0].timeout, 60000);
  assert.ok(state.clients.every(client => client.timeout <= 60000 && client.maxRetries === 0));

  for (const result of [
    { finish_reason: 'stop', message: { content: 'POSTER_PRIVACY: {"safe":false,"confidence":1}' } },
    { finish_reason: 'stop', message: { content: approval, refusal: 'blocked' } },
    { finish_reason: 'stop', message: { content: 'Malformed verdict' } },
  ]) {
    const rejected = visionFixture(env, () => ({ choices: [result] }));
    const content = await rejected.analyzeEventImage('data:image/png;base64,test', 'Check flyer');
    assert.equal(content, result.finish_reason === 'stop' && !result.message.refusal ? result.message.content : '');
    assert.equal(rejected.calls.length, 1, 'Do not call another provider after a completed response');
  }

  const truncated = visionFixture(env, (_, config) => config.baseURL.includes('nvidia.com')
    ? { choices: [{ finish_reason: 'length', message: { content: 'Partial analysis' } }] }
    : { choices: [{ finish_reason: 'stop', message: { content: approval } }] });
  assert.equal(await truncated.analyzeEventImage('data:image/png;base64,test', 'Check flyer'), approval);
  assert.deepEqual(truncated.calls.map(call => call.model), [
    'nvidia/nemotron-3.5-super-vl-120b-a12b',
    'qwen/qwen3.8-27b',
  ], 'Use the complete Groq response after NVIDIA truncates');
});

test('vision providers follow configured order and skip missing or paid OpenRouter models', async () => {
  const completed = () => ({ choices: [{ finish_reason: 'stop', message: { content: 'checked' } }] });
  const state = visionFixture({ AI_VISION_PROVIDERS: 'nvidia,groq', NVIDIA_API_SECRET_KEY: 'nvidia', GROQ_API_SECRET_KEY: 'groq' }, completed);
  assert.equal(await state.analyzeEventImage('image', 'prompt'), 'checked');
  assert.deepEqual(state.calls.map(call => call.model), ['nvidia/nemotron-3.5-super-vl-120b-a12b']);

  for (const env of [
    { AI_VISION_PROVIDERS: 'nvidia' },
    { AI_VISION_PROVIDERS: 'gemini', NVIDIA_API_SECRET_KEY: 'nvidia' },
    { AI_VISION_PROVIDERS: 'openrouter', OPENROUTER_API_SECRET_KEY: 'router', OPENROUTER_VISION_MODEL: 'vendor/paid' },
  ]) {
    const state = visionFixture(env, completed);
    await assert.rejects(state.analyzeEventImage('image', 'prompt'), error => error.name === 'VisionServiceUnavailableError');
    assert.equal(state.calls.length, 0);
  }
});

test('vision branches can choose independent provider orders', async () => {
  const state = visionFixture({ NVIDIA_API_SECRET_KEY: 'nvidia', GROQ_API_SECRET_KEY: 'groq' }, () => ({
    choices: [{ finish_reason: 'stop', message: { content: 'checked' } }],
  }));
  await state.createEventImageAnalyzer('groq')('image', 'extract');
  await state.createEventImageAnalyzer('nvidia')('image', 'crop');
  assert.deepEqual(state.calls.map(call => call.model), ['qwen/qwen3.8-27b', 'nvidia/nemotron-3.5-super-vl-120b-a12b']);
});

test('default vision fallback uses only NVIDIA and Groq', async () => {
  const env = {
    NVIDIA_API_SECRET_KEY: 'nvidia', GEMINI_API_SECRET_KEY: 'gemini',
    OPENROUTER_API_SECRET_KEY: 'openrouter', OPENROUTER_VISION_MODEL: 'vendor/vision:free',
    GROQ_API_SECRET_KEY: 'groq',
  };
  const fallback = visionFixture(env, (_, config) => {
    if (config.baseURL.includes('nvidia.com')) throw Object.assign(new Error('rate limited'), { status: 429 });
    return { choices: [{ finish_reason: 'stop', message: { content: 'checked' } }] };
  });
  assert.equal(await fallback.analyzeEventImage('image', 'prompt'), 'checked');
  assert.deepEqual(fallback.calls.map(call => call.model), [
    'nvidia/nemotron-3.5-super-vl-120b-a12b',
    'qwen/qwen3.8-27b',
  ]);
});

test('vision falls back in configured order after provider errors', async () => {
  const env = {
    AI_VISION_PROVIDERS: 'nvidia,gemini,openrouter,groq',
    NVIDIA_API_SECRET_KEY: 'nvidia', GEMINI_API_SECRET_KEY: 'gemini',
    OPENROUTER_API_SECRET_KEY: 'openrouter', OPENROUTER_VISION_MODEL: 'vendor/vision:free',
    GROQ_API_SECRET_KEY: 'groq', GEMINI_VISION_MODEL: 'gemini-test',
  };
  const fallback = visionFixture(env, (_, config) => {
    if (config.baseURL.includes('nvidia.com')) throw Object.assign(new Error('rate limited'), { status: 429 });
    return { choices: [{ finish_reason: 'stop', message: { content: 'checked' } }] };
  });
  assert.equal(await fallback.analyzeEventImage('image', 'prompt'), 'checked');
  assert.deepEqual(fallback.calls.map(call => call.model), ['nvidia/nemotron-3.5-super-vl-120b-a12b', 'gemini-test']);
  assert.deepEqual(fallback.calls.map(call => call.baseURL), [
    'https://integrate.api.nvidia.com/v1',
    'https://generativelanguage.googleapis.com/v1beta/openai/',
  ]);
  assert.equal(fallback.calls[1].reasoning_effort, 'low');

  const unavailable = visionFixture({
    AI_VISION_PROVIDERS: 'nvidia,gemini,openrouter,groq',
    NVIDIA_API_SECRET_KEY: 'nvidia', GEMINI_API_SECRET_KEY: 'gemini',
    OPENROUTER_API_SECRET_KEY: 'openrouter', OPENROUTER_VISION_MODEL: 'vendor/vision:free', GROQ_API_SECRET_KEY: 'groq',
  }, () => { throw Object.assign(new Error('service failure'), { status: 503 }); });
  await assert.rejects(unavailable.analyzeEventImage('image', 'prompt'), error => error.name === 'VisionServiceUnavailableError');
  assert.equal(unavailable.calls.length, 4, 'Each configured provider is attempted once');
});

test('vision skips a failed provider across privacy stages', async () => {
  let elapsed = 0;
  const env = { AI_VISION_PROVIDERS: 'nvidia,gemini', NVIDIA_API_SECRET_KEY: 'nvidia' };
  const state = visionFixture(env, (_, config) => {
    elapsed += config.timeout;
    throw new Error('timeout');
  }, { now: () => elapsed });
  const analyze = state.createEventImageAnalyzer();
  await assert.rejects(analyze('original', 'bounds'), error => error.name === 'VisionServiceUnavailableError');
  await assert.rejects(analyze('crop', 'verify'), error => error.name === 'VisionServiceUnavailableError');
  assert.equal(elapsed, 60000);
  assert.equal(state.calls.length, 1, 'Do not retry a failed provider during crop verification');
  const late = visionFixture({ GROQ_API_SECRET_KEY: 'groq' }, () => {
    elapsed += 180001;
    return { choices: [{ finish_reason: 'stop', message: { content: 'late' } }] };
  }, { now: () => elapsed });
  await assert.rejects(late.analyzeEventImage('image', 'prompt'), error => error.name === 'VisionServiceUnavailableError');
});

test('vision allows slow responses across stages and caps fallback by the shared deadline', async () => {
  let elapsed = 0;
  const state = visionFixture({ NVIDIA_API_SECRET_KEY: 'nvidia', GROQ_API_SECRET_KEY: 'groq' }, (_, config) => {
    elapsed += 45000;
    if (config.baseURL.includes('nvidia.com') && elapsed > 90000) throw new Error('timeout');
    return { choices: [{ finish_reason: 'stop', message: { content: 'checked' } }] };
  }, { now: () => elapsed });
  const analyze = state.createEventImageAnalyzer();
  assert.equal(await analyze('original', 'bounds'), 'checked');
  assert.equal(await analyze('crop', 'verify'), 'checked');
  await assert.rejects(analyze('crop', 'final'), error => error.name === 'VisionServiceUnavailableError');
  assert.deepEqual(state.clients.map(client => client.timeout), [60000, 60000, 60000, 45000]);
});

test('vision errors can fall back but safety refusals are final', async () => {
  const env = { AI_VISION_PROVIDERS: 'nvidia,groq', NVIDIA_API_SECRET_KEY: 'nvidia', GROQ_API_SECRET_KEY: 'groq' };
  for (const response of [
    { error: { code: 503, message: 'upstream unavailable' } },
    { choices: [{ error: { code: 429 }, finish_reason: 'error' }] },
  ]) {
    const state = visionFixture(env, (_, config) => config.baseURL.includes('nvidia.com') ? response : { choices: [{ finish_reason: 'stop', message: { content: 'fallback' } }] });
    assert.equal(await state.analyzeEventImage('image', 'prompt'), 'fallback');
    assert.equal(state.calls.length, 2);
  }
  for (const response of [{ error: { code: 503, message: 'upstream unavailable' } }, { choices: [{ error: { code: 429 }, finish_reason: 'error' }] }]) {
    const state = visionFixture({ ...env, AI_VISION_PROVIDERS: 'nvidia' }, () => response);
    await assert.rejects(state.analyzeEventImage('image', 'prompt'), error => error.name === 'VisionServiceUnavailableError');
    assert.equal(state.calls.length, 1);
  }
  for (const response of [{ code: 'content_policy_violation' }, { error: { type: 'SAFETY' } }]) {
    for (const thrown of [false, true]) {
      const state = visionFixture(env, () => {
        if (thrown) throw response;
        return { error: response };
      });
      assert.equal(await state.analyzeEventImage('image', 'prompt'), '');
      assert.equal(state.calls.length, 1, 'Do not override a structured safety refusal');
    }
  }
});

test("automatic poster crop accepts only confident bounds inside the original image", () => {
  const bounds = { x: 0.1, y: 0.2, width: 0.8, height: 0.6, confidence: 0.95 };
  assert.deepEqual(parsePosterBounds(`Analisi\nPOSTER_BOUNDS: ${JSON.stringify(bounds)}`), bounds);
  for (const value of [null, {}, { ...bounds, confidence: 0.79 }, { ...bounds, x: -0.1 },
    { ...bounds, width: 1 }, { ...bounds, height: 0 }, { ...bounds, width: 0.01 }]) {
    assert.equal(parsePosterBounds(`POSTER_BOUNDS: ${JSON.stringify(value)}`), null);
  }
  assert.deepEqual(parsePosterBounds(`POSTER_BOUNDS: ${JSON.stringify({ ...bounds, confidence: 0.85 })}`), { ...bounds, confidence: 0.85 });
  assert.equal(parsePosterBounds("Vision non disponibile"), null);
  assert.equal(parsePosterBounds("POSTER_BOUNDS: non valido"), null);
  const fullPoster = { x: 0, y: 0, width: 1, height: 1, confidence: 0.99 };
  assert.deepEqual(parsePosterBounds(`POSTER_BOUNDS: ${JSON.stringify(fullPoster)}`), fullPoster);
  assert.equal(parsePosterBounds(`POSTER_BOUNDS: ${JSON.stringify(bounds)}\nPOSTER_BOUNDS: null`), null);
});

test("poster privacy requires one explicit confident approval, not just detected bounds", () => {
  assert.equal(isPosterPrivacySafe('POSTER_PRIVACY: {"safe":true,"confidence":0.99}'), true);
  for (const result of [null, {}, { safe: false, confidence: 1 }, { safe: "true", confidence: 1 },
    { safe: true, confidence: 0.89 }, { safe: true, confidence: 1.01 }, { safe: true, confidence: "1" }]) {
    assert.equal(isPosterPrivacySafe(`POSTER_PRIVACY: ${JSON.stringify(result)}`), false);
  }
  assert.equal(isPosterPrivacySafe(""), false);
  assert.equal(isPosterPrivacySafe("POSTER_PRIVACY: invalid"), false);
  assert.equal(isPosterPrivacySafe('POSTER_PRIVACY: {"safe":true,"confidence":1}\nPOSTER_PRIVACY: {"safe":false,"confidence":1}'), false);
  assert.equal(isPosterPrivacySafe('POSTER_PRIVACY: {"safe":true,"confidence":1}\nNon approvare questa immagine'), false);
});

test("privacy crop can preserve full poster resolution for verification and OCR", async () => {
  const buffer = await sharp({ create: { width: 2400, height: 3000, channels: 3, background: "red" } }).png().toBuffer();
  const file = new File([buffer], "large-poster.png", { type: "image/png" });
  const analysis = 'POSTER_BOUNDS: {"x":0,"y":0,"width":1,"height":1,"confidence":0.99}';
  const result = await cropPosterPreview(file, analysis, true);
  const metadata = await sharp(Buffer.from(result.split(",")[1], "base64")).metadata();
  assert.equal(metadata.width, 2400);
  assert.equal(metadata.height, 3000);
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

test("image processing extracts events without crop calls and preserves the whole image", { timeout: 10000 }, async () => {
  const { NextRequest, NextResponse } = require("next/server");
  const code = ts.transpileModule(readFileSync(new URL("../app/api/process-image/route.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const screenshot = await sharp({ create: { width: 200, height: 300, channels: 3, background: "white" } })
    .composite([
      { input: await sharp({ create: { width: 30, height: 30, channels: 3, background: "blue" } }).png().toBuffer(), left: 10, top: 10 },
      { input: await sharp({ create: { width: 160, height: 180, channels: 3, background: "red" } }).png().toBuffer(), left: 20, top: 60 },
      { input: await sharp({ create: { width: 60, height: 60, channels: 3, background: "green" } }).png().toBuffer(), left: 70, top: 100 },
    ]).png().toBuffer();
  for (const scenario of [
    { name: "WhatsApp", status: 200 },
    { name: "Instagram", status: 200 },
    { name: "desktop", status: 200 },
    { name: "whole poster", status: 200, full: true },
    { name: "image below provider minimum", status: 400, tiny: true },
    { name: "Gemini key configured but Groq remains the only vision provider", status: 200 },
    { name: "extraction unavailable uses OCR independently", status: 200, extractionUnavailable: true },
    { name: "truncated extraction uses OCR", status: 200, truncated: true },
  ]) {
    const calls = [];
    const ocrFiles = [];
    let visionCalls = 0;
    class Client {
      chat = { completions: { create: async options => {
        calls.push(options);
        if (Array.isArray(options.messages[0].content)) {
          visionCalls++;
          const prompt = options.messages[0].content[1].text;
          assert.ok(!/POSTER_BOUNDS:|POSTER_PRIVACY:/.test(prompt), 'Never request crop bounds or crop verification');
          if (scenario.extractionUnavailable) throw new Error('Extraction unavailable');
          return { choices: [{ finish_reason: scenario.truncated ? 'length' : 'stop', message: { content: 'Concerto a Schio il 01/12/2026 ore 20:00' } }] };
        }
        return { choices: [{ message: { content: JSON.stringify({ title: "Concerto", date: "01/12/2026", time: "20:00", location: "Schio", description: "Concerto a Schio", organizer: "Organizzatore", category: "music", price: "Gratis" }) } }] };
      } } };
    }
    const env = { GROQ_API_SECRET_KEY: "test-groq", GEMINI_API_SECRET_KEY: "test-gemini", AI_VISION_PROVIDERS: "groq" };
    const vision = visionFixture(env, options => new Client().chat.completions.create(options));
    const context = {
      exports: {}, File, Buffer, Date, URL,
      console: { log() {}, warn() {}, error() {} },
      process: { env },
      require: name => {
        if (name === "next/server") return { NextResponse };
        if (name === "sharp") return { default: sharp, __esModule: true };
        if (name === "groq-sdk" || name === "openai") return { default: Client, __esModule: true };
        if (name.endsWith("/ocr-simple")) return { extractTextFromImageSimple: async file => {
          ocrFiles.push(Buffer.from(await file.arrayBuffer()));
          return "Concerto a Schio il 01/12/2026 ore 20:00";
        } };
        if (name.endsWith("/ocr")) return { extractTextFromImage: async () => "" };
        if (name.endsWith("/image-utils")) return { compressImage: async file => file };
        if (name.endsWith("/event-title")) return { normalizeEventTitle };
        if (name.endsWith("/vision-ai")) return vision;
        if (name.endsWith("/event-utils")) return { groupEventsByDate: events => events };
        if (name.endsWith("/event-hints")) return { buildEventExtractionHints: () => "" };
        if (name.endsWith("/extension-cors")) return { withExtensionCors: response => response, extensionCorsPreflight() {} };
        if (name.endsWith("/google-search")) return { isWebSearchConfigured: () => false };
        throw new Error(`Unexpected import ${name}`);
      },
    };
    vm.runInNewContext(code, context);
    const form = new FormData();
    const input = scenario.tiny
      ? await sharp(screenshot).resize(1, 1).png().toBuffer()
      : scenario.full
      ? await sharp(screenshot).extract({ left: 20, top: 60, width: 160, height: 180 }).png().toBuffer()
      : screenshot;
    form.append("image", new File([input], "screenshot.png", { type: "image/png" }));
    const response = await context.exports.POST(new NextRequest("https://events.example/api/process-image", { method: "POST", body: form }));
    assert.equal(response.status, scenario.status, scenario.name);
    const result = await response.json();
    if (scenario.tiny) {
      assert.equal(result.code, "IMAGE_TOO_SMALL", scenario.name);
      assert.equal(calls.length, 0, "Reject undersized images before provider calls");
      assert.equal(ocrFiles.length, 0, "Do not run OCR on undersized images");
      continue;
    }
    assert.equal(result.events[0].title, "Concerto", scenario.name);
    assert.equal(result.imageWarning, undefined);
    assert.equal(visionCalls, 1, 'Only event-data vision is called');
    assert.equal(calls[0].messages[0].content[0].image_url.url, result.previewImageDataUrl);
    const metadata = await sharp(Buffer.from(result.previewImageDataUrl.split(',')[1], 'base64')).metadata();
    const original = await sharp(input).metadata();
    assert.equal(metadata.width, original.width, 'Preserve original width without cropping or padding');
    assert.equal(metadata.height, original.height, 'Preserve original height without cropping or padding');
    assert.equal(ocrFiles.length, scenario.extractionUnavailable || scenario.truncated ? 1 : 0);
  }
});

test("upload and share clients never restore unverified screenshots and keep PDF support", async () => {
  for (const component of ["ImageUploader", "SharedImageHandler"]) {
    for (const scenario of ["verified", "missing preview", "crop warning", "privacy rejected", "vision unavailable", ...(component === "ImageUploader" ? ["pdf"] : [])]) {
      const processed = [];
      const errors = [];
      const objectUrls = [];
      const effects = [];
      const consoleErrors = [];
      const warnings = [];
      let drop;
      const preview = "data:image/jpeg;base64,cG9zdGVy";
      const input = new File(["original screenshot"], scenario === "pdf" ? "program.pdf" : "screenshot.png", {
        type: scenario === "pdf" ? "application/pdf" : "image/png",
      });
      const code = ts.transpileModule(readFileSync(new URL(`../app/components/${component}.tsx`, import.meta.url), "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
      }).outputText;
      const context = {
        exports: {}, File, FormData,
        console: { log() {}, warn() {}, error: (...args) => consoleErrors.push(args) },
        setTimeout: () => 0,
        URL: { createObjectURL: blob => { objectUrls.push(blob); return `blob:checked-${objectUrls.length}`; } },
        fetch: async url => {
          if (url.startsWith("/api/share-target")) return { ok: true, blob: async () => input };
          if (url === preview) return { blob: async () => new Blob(["checked poster"], { type: "image/jpeg" }) };
          if (scenario === "privacy rejected") return { ok: false, status: 422, json: async () => ({ error: "Ritaglia manualmente solo la locandina", code: "POSTER_PRIVACY_REVIEW_REQUIRED" }) };
          if (scenario === "vision unavailable") return { ok: false, status: 503, json: async () => ({ error: "Servizio immagini temporaneamente non disponibile", code: "VISION_SERVICE_UNAVAILABLE" }) };
          return { ok: true, json: async () => ({
            events: [{ title: "Concerto", originalImageUrl: "blob:unsafe-original", imageUrl: 'blob:unsafe-cover' }],
            ...(scenario === "verified" && { previewImageDataUrl: preview }),
            ...(scenario === "crop warning" && { imageWarning: { code: 'POSTER_PRIVACY_REVIEW_REQUIRED', message: 'Evento generato senza copertina' } }),
          }) };
        },
        require: name => {
          if (name === "react") return {
            useCallback: callback => callback,
            useEffect: effect => { effects.push(effect); },
            useRef: initial => ({ current: initial }),
            useState: initial => [initial, () => {}],
          };
          if (name === "react/jsx-runtime") return require(name);
          if (name === "react-dropzone") return { useDropzone: options => {
            drop = options.onDrop;
            return { getRootProps: () => ({}), getInputProps: () => ({}), isDragActive: false };
          } };
          if (name === "next/navigation") return { useSearchParams: () => new URLSearchParams("shared=true&shareId=privacy-test") };
          if (name === "react-toastify") return { toast: { error() {}, warn: (...args) => warnings.push(args) } };
          if (name.endsWith("/error-tool")) return { logClientError() {} };
          if (name.endsWith("/LoadingAnimation")) return { default: () => null, __esModule: true };
          throw new Error(`Unexpected import ${name}`);
        },
      };
      vm.runInNewContext(code, context);
      let finish;
      const completed = new Promise(resolve => { finish = resolve; });
      context.exports.default({
        onProcessed: (...args) => { processed.push(args); finish(); },
        onError: error => { errors.push(error); finish(); },
      });
      if (component === "ImageUploader") await drop([input]);
      else { effects[0](); await completed; }
      const label = `${component}: ${scenario}`;
      if (["verified", "pdf", "missing preview", "crop warning"].includes(scenario)) {
        assert.equal(processed.length, 1, label);
        assert.equal(errors.length, 0, label);
        assert.equal(processed[0][0][0].originalImageUrl, undefined, label);
        assert.equal(processed[0][0][0].imageUrl, undefined, label);
        if (scenario === "missing preview" || scenario === "crop warning") {
          assert.equal(objectUrls.length, 0, 'Never restore original screenshots as a fallback');
          assert.equal(processed[0][1], '', label);
          assert.equal(warnings.length, 1, label);
          assert.equal(warnings[0][1].autoClose, false, label);
          if (scenario === "crop warning") assert.equal(warnings[0][0], 'Evento generato senza copertina');
        } else {
          assert.equal(objectUrls.length, 1, label);
          assert.equal(await objectUrls[0].text(), scenario === "pdf" ? "original screenshot" : "checked poster", label);
        }
      } else {
        assert.equal(processed.length, 0, label);
        assert.equal(errors.length, 1, label);
        assert.equal(objectUrls.length, 0, label);
        if (scenario === "privacy rejected" || scenario === "vision unavailable") assert.equal(consoleErrors.length, 0, `${label}: expected review must not trigger Next.js error overlay`);
      }
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
