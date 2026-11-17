import { expect, it } from "vitest";
import { pageUses } from "@/lib/present";
import type { PageRow } from "@/lib/store";

const page = (id: string, path: string, blocks: PageRow["blocks"], more: Partial<PageRow> = {}): PageRow => ({
  id,
  name: id,
  path,
  status: "active",
  title: { zh: `${id} 标题`, en: `${id} title` },
  description: {},
  layout: "standard",
  breadcrumb: null,
  sitemap: true,
  blocks,
  deleted: false,
  updated_at: "",
  updated_by: "",
  ...more,
});

const pages = [
  page("a", "/a/", [
    { id: "b1", zone: "main" },
    { id: "b2", zone: "main", style: "tpl-1" },
    { id: "b1", zone: "side", style: "tpl-1" },
  ]),
  page("b", "/b/", [{ id: "b1", zone: "main" }], { status: "inactive" }),
  page("c", "/c/", [{ id: "b1", zone: "main" }], { deleted: true }),
];
const style = (t: string | undefined) => (t ? `样式 ${t}` : "内置");

// The owner, 2026-11-16: a link that opens the list of every page that holds the content file.
it("lists the pages a block stands on, each place on it, never a deleted page", () => {
  expect(pageUses(pages, "b1", { lang: "zh", site: "http://p/zh", anchor: "contact", style })).toEqual([
    {
      id: "a",
      path: "/a/",
      title: "a 标题",
      active: true,
      draft: "http://p/zh/a/?view=draft#contact",
      places: [
        { zone: "main", style: "内置" },
        { zone: "side", style: "样式 tpl-1" },
      ],
    },
    {
      id: "b",
      path: "/b/",
      title: "b 标题",
      active: false,
      draft: "http://p/zh/b/?view=draft#contact",
      places: [{ zone: "main", style: "内置" }],
    },
  ]);
});

it("takes the title in the reader's language, and no anchor when the block has none", () => {
  const [use] = pageUses(pages, "b2", { lang: "en", site: "http://p/en", anchor: "", style });
  expect(use).toMatchObject({ title: "a title", draft: "http://p/en/a/?view=draft" });
  expect(pageUses(pages, "nowhere", { lang: "zh", site: "", style })).toEqual([]);
});
