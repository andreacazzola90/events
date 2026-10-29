import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const code = ts.transpileModule(readFileSync(new URL("./site-presentation.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

const context = {
  exports: {},
  require: name => {
    assert.equal(name, "./constants");
    return {
      STANDARD_CATEGORIES: ["musica", "nightlife", "cultura", "cibo", "sport", "famiglia", "teatro", "festa", "passeggiata", "altro"],
      CATEGORY_MAPPING: { music: "musica", culture: "cultura", food: "cibo", family: "famiglia", theater: "teatro", party: "festa", walk: "passeggiata", other: "altro" },
    };
  },
};
vm.runInNewContext(code, context);

const { DEFAULT_SITE_PRESENTATION, getCategoryPresentation, normalizeSitePresentation, parseSitePresentationPayload } = context.exports;

test("normalizes partial persisted presentation settings to safe category defaults", () => {
  const config = normalizeSitePresentation([
    { id: "musica", color: "#123456", icon: "Music2" },
    { id: "cibo", color: "url(https://attacker.example)", icon: "Script" },
  ], [
    { id: "valid-quote", text: "Una frase utile", author: "Autore", enabled: true },
    { id: "bad-quote", text: "", author: "Autore", enabled: true },
  ]);

  assert.equal(config.categories.length, DEFAULT_SITE_PRESENTATION.categories.length);
  assert.equal(config.categories.find(item => item.id === "musica").color, "#123456");
  assert.equal(config.categories.find(item => item.id === "cibo").color, DEFAULT_SITE_PRESENTATION.categories.find(item => item.id === "cibo").color);
  assert.equal(config.categories.find(item => item.id === "cibo").icon, "UtensilsCrossed");
  assert.deepEqual(JSON.parse(JSON.stringify(config.quotes)), [
    { id: "valid-quote", text: "Una frase utile", author: "Autore", enabled: true },
  ]);
});

test("maps category aliases to the configured presentation", () => {
  const presentation = getCategoryPresentation("music", DEFAULT_SITE_PRESENTATION.categories);
  assert.equal(presentation.id, "musica");
  assert.equal(presentation.icon, "Music2");
});

test("accepts complete settings and rejects unknown categories, icons, colors and duplicate quotes", () => {
  const payload = JSON.parse(JSON.stringify({
    ...DEFAULT_SITE_PRESENTATION,
    quotes: [{ id: "q-1", text: "Una frase", author: "Autore", enabled: true }],
  }));
  assert.ok(parseSitePresentationPayload(payload));

  for (const invalid of [
    { ...payload, categories: payload.categories.slice(1) },
    { ...payload, categories: payload.categories.map((item, index) => index ? item : { ...item, icon: "ArbitraryComponent" }) },
    { ...payload, categories: payload.categories.map((item, index) => index ? item : { ...item, color: "red; background:url(javascript:alert(1))" }) },
    { ...payload, quotes: [payload.quotes[0], payload.quotes[0]] },
    { ...payload, quotes: [{ ...payload.quotes[0], text: "" }] },
  ]) assert.equal(parseSitePresentationPayload(invalid), null);
});