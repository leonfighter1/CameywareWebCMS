import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createTranslator } from "next-intl";
import { expect, it } from "vitest";
import en from "../messages/en.json";
import zh from "../messages/zh.json";

/** Every key of a message file ("files.change.new"). */
function keys(o: object, at = ""): string[] {
  return Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object" ? keys(v as object, `${at}${k}.`) : [`${at}${k}`],
  );
}

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(path) ? [path] : [];
  });
}

it("the CMS's English has every word its Chinese has, and no other", () => {
  expect(keys(en).sort()).toEqual(keys(zh).sort());
});

// The server's own words are keys in data (msg, CmsError, logLine): the typecheck doesn't see them, this does.
it("every message the server says is in both languages", () => {
  const known = new Set(keys(zh));
  const used = new Set<string>();
  for (const file of sources("src")) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/(?:msg|CmsError|logLine)\(\s*"([a-z]+\.[\w.]+)"/g)) used.add(m[1]!);
    for (const m of text.matchAll(/key: "([a-z]+\.[\w.]+)"/g)) used.add(m[1]!);
  }
  expect(used.size).toBeGreaterThan(60);
  expect([...used].filter((k) => !known.has(k))).toEqual([]);
});

it("every message reads in both languages (its placeholders and plurals well formed)", () => {
  for (const [locale, messages] of [
    ["zh", zh],
    ["en", en],
  ] as const) {
    const errors: string[] = [];
    const t = createTranslator({ locale, messages, onError: (e) => errors.push(e.message) }) as unknown as (
      key: string,
      values: object,
    ) => string;
    for (const k of keys(messages)) {
      const text = k
        .split(".")
        .reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], messages) as string;
      // Every placeholder a number: it reads as text, and a plural picks its form.
      const values = Object.fromEntries([...text.matchAll(/\{(\w+)/g)].map((m) => [m[1], 1]));
      t(k, values);
    }
    expect(errors, locale).toEqual([]);
  }
  const t = createTranslator({ locale: "en", messages: en }) as unknown as (k: string, v: object) => string;
  expect([t("files.checkInTitle", { n: 1 }), t("files.checkInTitle", { n: 3 })]).toEqual([
    "Check in 1 file",
    "Check in 3 files",
  ]);
});

it("no message has a tag the plain translator would trip on", () => {
  // next-intl reads <x> in a message as rich text: a plain t() of it fails.
  const tagged = keys(zh).flatMap((k) => {
    const value = k.split(".").reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], zh) as string;
    const value2 = k.split(".").reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], en) as string;
    return /<\w/.test(value) || /<\w/.test(value2) ? [k] : [];
  });
  expect(tagged).toEqual([]);
});
