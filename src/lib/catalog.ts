/**
 * The website's catalog of block types and globals (its cms/types.json, through npm run sync): what each editor shows,
 * and the one check every save and every upload goes through (`check`): known fields only, each value of its kind, the
 * html fields sanitised with the catalog's allowlist (the website sanitises again when it builds), the required ones
 * filled in. Every name has its English beside it (label_en, description_en, hint_en) for the CMS in English.
 */
import sanitize from "sanitize-html";
import { labelIn } from "./labels";
import { type Both, type Lang, type Msg, msg } from "./words";
import { isL10n, type L10n, LOCALES } from "@/generated/model";
import catalog from "@/generated/types.json";

export type Option = { value: string; label: string; label_en?: string };
export type Field = {
  name: string;
  label: string;
  label_en?: string;
  kind: string;
  localized?: boolean;
  required?: boolean;
  default?: unknown;
  hint?: string;
  hint_en?: string;
  max?: number;
  options?: Option[];
  fields?: Field[];
};
export type TypeDef = {
  label: string;
  label_en?: string;
  description: string;
  description_en?: string;
  full?: boolean;
  space?: string;
  fields: Field[];
};
export type GlobalDef = {
  label: string;
  label_en?: string;
  description: string;
  description_en?: string;
  fields: Field[];
};

export const TYPES = catalog.types as unknown as Record<string, TypeDef>;
export const GLOBALS = catalog.globals as unknown as Record<string, GlobalDef>;
export const COMMON = catalog.common as unknown as Field[];
export const ICONS = catalog.icons as string[];
const ALLOW = catalog.rich_text_allow as unknown as sanitize.IOptions;

/** A catalog entry's name in both languages (its English, or its Chinese where it has none). */
export const both = (d: { label: string; label_en?: string } | undefined, fallback = ""): Both => ({
  zh: d?.label ?? fallback,
  en: d?.label_en ?? d?.label ?? fallback,
});

export { descriptionIn, hintIn, labelIn } from "./labels";

/** A block type's name in [lang] (its key where the catalog lacks it). */
export const typeName = (type: string, lang: Lang) => (TYPES[type] ? labelIn(TYPES[type], lang) : type);

/** A block type's fields, the common ones (anchor, room above) after its own. */
export const fieldsOf = (type: string): Field[] => [...(TYPES[type]?.fields ?? []), ...COMMON];

export const cleanHtml = (html: string) => sanitize(html, ALLOW);

/** What a new block of these fields starts with: each select's and switch's default, empty lists. */
export function defaults(fields: Field[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.default !== undefined) out[f.name] = f.default;
    else if (f.kind === "list") out[f.name] = [];
    else if (f.kind === "boolean") out[f.name] = false;
  }
  return out;
}

const LINK = /^(\/|https?:\/\/|mailto:|tel:|#)/;

/** One value by its field: [errors] gets what is wrong with it, by the field's path. */
function one(f: Field, v: unknown, at: string, errors: Msg[]): unknown {
  const path = at ? `${at}.${f.name}` : f.name;
  const empty = v === undefined || v === null || v === "";
  if (f.kind === "list") {
    if (empty) return [];
    if (!Array.isArray(v)) {
      errors.push(msg("check.notList", { path }));
      return [];
    }
    if (f.max && v.length > f.max) errors.push(msg("check.tooMany", { path, max: f.max }));
    return v.map((item, i) => checkFields(item, f.fields ?? [], `${path}[${i + 1}]`, errors));
  }
  if (f.kind === "boolean") {
    if (empty) return f.default ?? false;
    if (typeof v === "boolean") return v;
    if (v === "true" || v === "false") return v === "true";
    errors.push(msg("check.notBoolean", { path }));
    return f.default ?? false;
  }
  const text = (s: unknown): string | undefined => {
    if (s === undefined || s === null) return undefined;
    if (typeof s === "number") return String(s);
    if (typeof s !== "string") {
      errors.push(msg("check.notText", { path }));
      return undefined;
    }
    if (f.kind === "html") return cleanHtml(s);
    if ((f.kind === "link" || f.kind === "image") && s && !LINK.test(s))
      errors.push(msg("check.notLink", { path, value: s }));
    if (f.kind === "select" && s && !f.options?.some((o) => o.value === s))
      errors.push(
        msg("check.notOption", { path, value: s, options: f.options?.map((o) => o.value).join(", ") ?? "" }),
      );
    if (f.kind === "icon" && s && !ICONS.includes(s)) errors.push(msg("check.noIcon", { path, value: s }));
    return s;
  };
  if (f.localized) {
    // One string is the 简体; a text in languages keeps its languages.
    const l10n: L10n = {};
    if (typeof v === "string") {
      l10n.zh = text(v);
    } else if (isL10n(v)) {
      for (const l of LOCALES) if (v[l] !== undefined) l10n[l] = text(v[l]) ?? "";
    } else if (!empty && !(v && typeof v === "object" && Object.keys(v).length === 0)) {
      errors.push(msg("check.notL10n", { path }));
    }
    if (f.required && !l10n.zh) errors.push(msg("check.zhRequired", { path }));
    return l10n;
  }
  if (isL10n(v)) {
    errors.push(msg("check.notLocalized", { path }));
    return v.zh ?? "";
  }
  const s = text(v) ?? (f.kind === "select" ? (f.default as string | undefined) : undefined) ?? "";
  if (f.required && !s) errors.push(msg("check.required", { path }));
  return s;
}

function checkFields(value: unknown, fields: Field[], at: string, errors: Msg[]): Record<string, unknown> {
  const v =
    value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  if (value !== undefined && (typeof value !== "object" || Array.isArray(value)))
    errors.push(msg("check.notFields", { path: at || "data" }));
  const out: Record<string, unknown> = {};
  for (const f of fields) out[f.name] = one(f, v[f.name], at, errors);
  for (const k of Object.keys(v))
    if (!fields.some((f) => f.name === k))
      errors.push(msg("check.noField", { path: `${at ? at + "." : ""}${k}` }));
  return out;
}

/** [value] checked against [fields]: the cleaned value, and every problem (said in the editor's language). */
export function check(value: unknown, fields: Field[]): { value: Record<string, unknown>; errors: Msg[] } {
  const errors: Msg[] = [];
  return { value: checkFields(value, fields, "", errors), errors };
}

/** A block's data checked by its type. */
export function checkBlock(type: string, data: unknown) {
  if (!TYPES[type]) return { value: {}, errors: [msg("errors.noType", { type })] };
  return check(data, fieldsOf(type));
}
