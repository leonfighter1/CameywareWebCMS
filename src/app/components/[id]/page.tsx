import { notFound } from "next/navigation";
import { Frame } from "@/components/frame";
import { fieldsOf, ICONS, TYPES } from "@/lib/catalog";
import { previewBase } from "@/lib/hosts";
import { database, host } from "@/lib/server";
import { changes, getComponent, getGlobal, getPage, usedOn } from "@/lib/store";
import { history } from "@/lib/workflow";
import { ComponentEditor } from "./editor";

/** A block's editor: where each Edit on the CMS's preview leads (the owner: 「通过这个edit link 会跳转到相应的UI」). */
export default async function ComponentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ back?: string; page?: string }>;
}) {
  const { id } = await params;
  const { back, page: fromPage } = await searchParams;
  const pg = await database();
  const c = await getComponent(pg, id);
  if (!c) notFound();
  const [pages, pending, past, works] = await Promise.all([
    usedOn(pg, id),
    changes(pg),
    history(pg, "component", id),
    getGlobal(pg, "works"),
  ]);
  const preview = previewBase(await host());
  const shownOn = (fromPage && (await getPage(pg, fromPage))) || pages[0];
  const items = ((works?.data as { items?: { slug: string; name?: { zh?: string } }[] })?.items ?? []).map(
    (w) => ({
      value: w.slug,
      label: `${w.name?.zh ?? w.slug}（${w.slug}）`,
    }),
  );
  return (
    <Frame>
      <ComponentEditor
        component={{ id: c.id, type: c.type, name: c.name, data: c.data, deleted: c.deleted }}
        typeLabel={TYPES[c.type]?.label ?? c.type}
        typeHelp={TYPES[c.type]?.description ?? ""}
        fields={fieldsOf(c.type)}
        ctx={{ works: items, icons: ICONS }}
        changed={pending.some((x) => x.kind === "component" && x.id === id)}
        pages={pages.map((p) => ({ id: p.id, path: p.path }))}
        preview={shownOn ? `${preview}/zh${shownOn.path}?view=draft#${c.data.anchor ?? ""}` : undefined}
        back={back?.startsWith(preview) ? back : undefined}
        history={past.map((h) => ({
          id: h.id,
          at: new Date(h.created_at).toLocaleString("zh-CN"),
          by: h.author,
          message: h.message,
        }))}
      />
    </Frame>
  );
}
