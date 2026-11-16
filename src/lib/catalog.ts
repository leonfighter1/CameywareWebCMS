/**
 * The website's catalog of block types and globals (its cms/types.json, through npm run sync): what each editor shows,
 * and the one check every save and every upload goes through (`check`): known fields only, each value of its kind, the
 * html fields sanitised with the catalog's allowlist (the website sanitises again when it builds), the required ones
 * filled in.
 */
import sanitize from "sanitize-html";
import { isL10n, type L10n, LOCALES } from "@/generated/model";
import catalog from "@/generated/types.json";

export type Field = {
  name: string;
  label: string;
  kind: string;
  localized?: boolean;
  required?: boolean;
  default?: unknown;
  hint?: string;
  max?: number;
  options?: { value: string; label: string }[];
  fields?: Field[];
};
export type TypeDef = { label: string; description: string; full?: boolean; space?: string; fields: Field[] };
export type GlobalDef = { label: string; description: string; fields: Field[] };

export const TYPES = catalog.types as unknown as Record<string, TypeDef>;
export const GLOBALS = catalog.globals as unknown as Record<string, GlobalDef>;
export const COMMON = catalog.common as unknown as Field[];
export const ICONS = catalog.icons as string[];
const ALLOW = catalog.rich_text_allow as unknown as sanitize.IOptions;

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
function one(f: Field, v: unknown, at: string, errors: string[]): unknown {
  const path = at ? `${at}.${f.name}` : f.name;
  const empty = v === undefined || v === null || v === "";
  if (f.kind === "list") {
    if (empty) return [];
    if (!Array.isArray(v)) {
      errors.push(`${path}：应该是一组（列表）`);
      return [];
    }
    if (f.max && v.length > f.max) errors.push(`${path}：最多 ${f.max} 项`);
    return v.map((item, i) => checkFields(item, f.fields ?? [], `${path}[${i + 1}]`, errors));
  }
  if (f.kind === "boolean") {
    if (empty) return f.default ?? false;
    if (typeof v === "boolean") return v;
    if (v === "true" || v === "false") return v === "true";
    errors.push(`${path}：应该是 true 或 false`);
    return f.default ?? false;
  }
  const text = (s: unknown): string | undefined => {
    if (s === undefined || s === null) return undefined;
    if (typeof s === "number") return String(s);
    if (typeof s !== "string") {
      errors.push(`${path}：应该是文字`);
      return undefined;
    }
    if (f.kind === "html") return cleanHtml(s);
    if ((f.kind === "link" || f.kind === "image") && s && !LINK.test(s))
      errors.push(`${path}：「${s}」不是网址（以 / 或 https:// 开头）`);
    if (f.kind === "select" && s && !f.options?.some((o) => o.value === s))
      errors.push(`${path}：「${s}」不在可选的值里（${f.options?.map((o) => o.value).join("、")}）`);
    if (f.kind === "icon" && s && !ICONS.includes(s)) errors.push(`${path}：没有「${s}」这个图标`);
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
      errors.push(`${path}：应该是各种语言的文字`);
    }
    if (f.required && !l10n.zh) errors.push(`${path}：简体必须填写`);
    return l10n;
  }
  if (isL10n(v)) {
    errors.push(`${path}：不分语言，只要一段文字`);
    return v.zh ?? "";
  }
  const s = text(v) ?? (f.kind === "select" ? (f.default as string | undefined) : undefined) ?? "";
  if (f.required && !s) errors.push(`${path}：必须填写`);
  return s;
}

function checkFields(value: unknown, fields: Field[], at: string, errors: string[]): Record<string, unknown> {
  const v =
    value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  if (value !== undefined && (typeof value !== "object" || Array.isArray(value)))
    errors.push(`${at || "内容"}：应该是一组字段`);
  const out: Record<string, unknown> = {};
  for (const f of fields) out[f.name] = one(f, v[f.name], at, errors);
  for (const k of Object.keys(v))
    if (!fields.some((f) => f.name === k)) errors.push(`${at ? at + "." : ""}${k}：没有这个字段`);
  return out;
}

/** [value] checked against [fields]: the cleaned value, and every problem in words an editor reads. */
export function check(value: unknown, fields: Field[]): { value: Record<string, unknown>; errors: string[] } {
  const errors: string[] = [];
  return { value: checkFields(value, fields, "", errors), errors };
}

/** A block's data checked by its type. */
export function checkBlock(type: string, data: unknown) {
  if (!TYPES[type]) return { value: {}, errors: [`没有「${type}」这种区块类型`] };
  return check(data, fieldsOf(type));
}
