/**
 * A catalog entry's words in the CMS's language: its Chinese, or its English (label_en, description_en, hint_en) where
 * it has one. Apart from catalog.ts so the browser's parts take these without the catalog's sanitiser.
 */
type Lang = "zh" | "en";

export const labelIn = (d: { label: string; label_en?: string }, lang: Lang) =>
  lang === "en" ? (d.label_en ?? d.label) : d.label;

export const descriptionIn = (d: { description: string; description_en?: string }, lang: Lang) =>
  lang === "en" ? (d.description_en ?? d.description) : d.description;

export const hintIn = (f: { hint?: string; hint_en?: string }, lang: Lang) =>
  lang === "en" ? (f.hint_en ?? f.hint) : f.hint;
