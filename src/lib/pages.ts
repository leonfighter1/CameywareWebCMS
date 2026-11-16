/**
 * A page as Bell's WebPage has it (the owner, 2026-11-16: 「page里的内容是由不同的component组成的 … 尽量参考这样的xml去搭建内容」;
 * S4, L1–L2): a layout (layouts.ts, the website's: a built-in one's name or a CMS layout's id), and its components as
 * placements, each in a zone of the layout with the style it is drawn in there (a CMS template's id; none: its type's own
 * view). A page saved before S4 listed its blocks' ids and had a width and a spacing; `upgradePage` makes one of it.
 */
import type { Transaction } from "@electric-sql/pglite";
import { TYPES } from "./catalog";
import { DEFAULT_LAYOUT, defaultZone, isBuiltinLayout, LAYOUTS, layoutOf } from "@/generated/layouts";

/** A component on a page: which (its id), where (a zone of the page's layout), drawn how (a template's id, or none). */
export type Placement = { id: string; zone: string; style?: string };

/** A placement as stored: its style only when it has one (so two placements alike compare alike). */
export const placement = (p: { id: string; zone: string; style?: string | null }): Placement => ({
  id: p.id,
  zone: p.zone,
  ...(p.style ? { style: p.style } : {}),
});

/** The zones of a built-in layout, its full ones apart; a CMS layout's (from its markup) when given. */
export function zonesOf(layout: string, markupZones?: string[]) {
  if (isBuiltinLayout(layout)) {
    const zones = LAYOUTS[layout]!.zones;
    return { names: zones.map((z) => z.name), full: zones.filter((z) => z.full).map((z) => z.name) };
  }
  return { names: markupZones?.length ? markupZones : ["main"], full: [] as string[] };
}

/** Each built-in layout as markup (layouts.ts draws it in code): where a new layout written in the CMS starts from. */
const STARTERS: Record<string, string> = {
  standard: `<Container py="xl">\n  <Zone name="main" />\n</Container>`,
  home: `<Zone name="hero" />\n<Container py="40 sm:64">\n  <Zone name="main" />\n</Container>`,
  landing: `<Zone name="hero" />\n<Container py="40 sm:64">\n  <Zone name="main" />\n</Container>\n<Box py="40 sm:64">\n  <Container>\n    <Zone name="action" />\n  </Container>\n</Box>`,
  article: `<Container pt="xl">\n  <Zone name="header" />\n</Container>\n<Container py="xl">\n  <Grid gap="xl">\n    <Col span="12 md:8"><Zone name="main" /></Col>\n    <Col span="12 md:4"><Zone name="aside" /></Col>\n  </Grid>\n</Container>`,
};

export const starterLayout = (builtin: string) => STARTERS[builtin] ?? STARTERS.standard!;

type Raw = Record<string, unknown> & { blocks?: unknown[]; layout?: string; spacing?: string };

/**
 * A page state saved before S4, as one now: its layout from its spacing (roomy: 首页), its width gone (every page is as
 * wide), each block id a placement in the zone a block of its type takes ([typeOf]) with the style [styleOf] gives it.
 * A state already upgraded comes back as it is.
 */
export function upgradePage(
  raw: Raw,
  typeOf: (id: string) => string | undefined,
  styleOf: (id: string) => string | undefined = () => undefined,
) {
  const layout = layoutOf(raw) || DEFAULT_LAYOUT;
  const { names, full } = zonesOf(layout);
  const blocks = (raw.blocks ?? []).map((b) =>
    typeof b === "string"
      ? placement({
          id: b,
          zone: defaultZone(names, !!TYPES[typeOf(b) ?? ""]?.full, full),
          style: styleOf(b),
        })
      : placement(b as Placement),
  );
  const { width: _w, spacing: _s, ...rest } = raw;
  void _w;
  void _s;
  return { ...rest, layout, blocks };
}

/**
 * Migration 4: every page (its working copy and each of its versions) as a page of layouts and placements; each block's
 * template of S3 its style where it stands; the components without a template of their own.
 */
export async function pagesToLayouts(tx: Transaction) {
  const comps = (
    await tx.query<{ id: string; type: string; template: string | null }>(
      `select id, type, template from components`,
    )
  ).rows;
  const typeOf = (id: string) => comps.find((c) => c.id === id)?.type;
  const styleOf = (id: string) => comps.find((c) => c.id === id)?.template ?? undefined;
  const pages = (
    await tx.query<{ id: string; blocks: string[]; spacing: string }>(`select id, blocks, spacing from pages`)
  ).rows;
  for (const p of pages) {
    const up = upgradePage({ blocks: p.blocks, spacing: p.spacing }, typeOf, styleOf);
    await tx.query(`update pages set layout = $2, blocks = $3 where id = $1`, [
      p.id,
      up.layout,
      JSON.stringify(up.blocks),
    ]);
  }
  const revs = (
    await tx.query<{ id: number; data: Raw | null }>(`select id, data from revisions where kind = 'page'`)
  ).rows;
  for (const r of revs) {
    if (!r.data) continue;
    await tx.query(`update revisions set data = $2 where id = $1`, [
      r.id,
      JSON.stringify(upgradePage(r.data, typeOf)),
    ]);
  }
  await tx.query(
    `update revisions set data = data - 'template' where kind = 'component' and data ? 'template'`,
  );
}
