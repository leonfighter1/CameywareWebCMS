/**
 * The CMS's two languages (the owner, 2026-11-15: 「给CMS网站同时添加一个英文语言」): Chinese and English, each in
 * messages/<lang>.json, chosen per browser (the cms_lang cookie). The pages read them through next-intl; what the server
 * says in its own words (a refusal, a check's problem, a deployment's log) is a key with values here (`Msg`), said in
 * the reader's language when it reaches them (`say`).
 */
import { createTranslator } from "next-intl";
import en from "../../messages/en.json";
import zh from "../../messages/zh.json";

export const LANGS = ["zh", "en"] as const;
export type Lang = (typeof LANGS)[number];
export const LANG_COOKIE = "cms_lang";
export const MESSAGES = { zh, en };

/** The language a cookie's value names: Chinese unless it says English. */
export const langOf = (value: string | undefined): Lang => (value === "en" ? "en" : "zh");

/** A name in both languages: a catalog's label and its label_en. */
export type Both = { zh: string; en: string };
/** Something to be said: a message's key ("errors.locked") and its values, which may be names in both languages. */
export type Msg = { key: string; values?: Values };
export type Values = Record<string, string | number | Both | Msg>;
/** A detail of a refusal: a message, or a plain fact (a path, an id) the same in both languages. */
export type Detail = Msg | string;

export const msg = (key: string, values?: Values): Msg => ({ key, values });

const isMsg = (v: unknown): v is Msg => !!v && typeof v === "object" && "key" in v;

/** A translator by any key: the server's messages are keys in data, not in code the typecheck sees. */
type Say = (key: string, values: Record<string, string | number>) => string;
const translators = new Map<Lang, Say>();

/** [m] in [lang]: its values said in it too. */
export function say(m: Detail, lang: Lang): string {
  if (typeof m === "string") return m;
  let t = translators.get(lang);
  if (!t) {
    t = createTranslator({ locale: lang, messages: MESSAGES[lang] }) as unknown as Say;
    translators.set(lang, t);
  }
  const values: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(m.values ?? {}))
    values[k] = typeof v === "object" ? (isMsg(v) ? say(v, lang) : v[lang]) : v;
  return t(m.key, values);
}

/** [details] in [lang]. */
export const sayAll = (details: Detail[], lang: Lang) => details.map((d) => say(d, lang));

/** A refusal an editor reads (an action answers it in their language, with its details). */
export class CmsError extends Error {
  readonly msg: Msg;
  constructor(
    key: string,
    values?: Values,
    readonly details: Detail[] = [],
  ) {
    const m = msg(key, values);
    super(say(m, "zh"));
    this.msg = m;
  }
}
