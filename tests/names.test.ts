import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, expect, it } from "vitest";
import { freshDb } from "@/lib/db";
import { take } from "@/lib/files";
import { asFileName, isFileName, nameFiles } from "@/lib/names";
import { seedIfEmpty } from "@/lib/seed";
import {
  changes,
  createComponent,
  createLayout,
  createTemplate,
  getComponent,
  listComponents,
  listLayouts,
  listPages,
  listTemplates,
  saveComponent,
} from "@/lib/store";
import { exportDoc, importDoc } from "@/lib/transfer";
import { versions } from "@/lib/workflow";

let pg: PGlite;

beforeEach(async () => {
  pg = await freshDb();
  await seedIfEmpty(pg);
});

// The owner, 2026-11-16: 「所有的page name和file都不带中文，只有内容可以是中文」.
it("keeps a made name to English letters, digits and _", () => {
  expect(asFileName("禄命秘解 (Lu Ming Mi Jie)")).toBe("Lu_Ming_Mi_Jie");
  expect(asFileName("联系我们：联系方式")).toBe("");
  expect(asFileName("/works/lumingmijie/support/")).toBe("works_lumingmijie_support");
  expect(["hero_centered", "kim-style", "A1"].every(isFileName)).toBe(true);
  expect(["居中横幅", "two words", "_lead", ""].some(isFileName)).toBe(false);
});

it("names the first content's files in English, nothing changed against production", async () => {
  const names = [
    ...(await listPages(pg)).map((p) => p.name),
    ...(await listComponents(pg)).map((c) => c.name).filter(Boolean),
    ...(await listTemplates(pg)).map((t) => t.name),
    ...(await listLayouts(pg)).map((l) => l.name),
  ];
  expect(names.filter((n) => !isFileName(n))).toEqual([]);
  const contact = (await listPages(pg)).find((p) => p.path === "/contact/")!;
  expect((await getComponent(pg, contact.blocks[0]!.id))!.name).toBe("contact_page_title");
  expect(await changes(pg)).toEqual([]);
});

it("refuses a Chinese name for a block, a style or a layout", async () => {
  await expect(createComponent(pg, "freeform", "地图", "lee")).rejects.toThrow(/英文字母/);
  await expect(
    createTemplate(pg, "hero_banner", "居中横幅", "<Title>{title}</Title>", "lee"),
  ).rejects.toThrow(/英文字母/);
  await expect(createLayout(pg, "两栏", `<Zone name="main" />`, "lee")).rejects.toThrow(/英文字母/);
  const id = await createComponent(pg, "freeform", "map", "lee");
  await expect(saveComponent(pg, id, { name: "地图" }, "lee")).rejects.toThrow(/英文字母/);
});

it("renames a file of before, its versions with it, and reads as unchanged", async () => {
  const block = (await listPages(pg)).find((p) => p.path === "/contact/")!.blocks[1]!.id;
  await pg.query(`update components set name = '联系方式' where id = $1`, [block]);
  await pg.query(
    `update revisions set data = jsonb_set(data, '{name}', '"联系方式"') where kind = 'component' and entity_id = $1`,
    [block],
  );
  await nameFiles(pg);
  expect((await getComponent(pg, block))!.name).toBe("contact_contact_details");
  expect((await versions(pg, "component", block)).map((v) => (v.data as { name: string }).name)).toEqual([
    "contact_contact_details",
  ]);
  expect(await changes(pg)).toEqual([]);
});

it("keeps a file's own name when an upload of before brings a Chinese one", async () => {
  const block = (await listPages(pg)).find((p) => p.path === "/contact/")!.blocks[0]!.id;
  const doc = await exportDoc(pg, "component", block);
  const old = {
    ...doc,
    component: { ...(doc as { component: object }).component, name: "联系我们：页面标题" },
  };
  await take(pg, [{ kind: "component", id: block }], "lee");
  const plan = await importDoc(pg, old as never, "lee", true);
  expect(plan.items.find((i) => i.id === block)?.action).toBe("unchanged");
  expect((await getComponent(pg, block))!.name).toBe("contact_page_title");
});
