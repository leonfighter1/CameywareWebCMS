import { notFound } from "next/navigation";
import { Frame } from "@/components/frame";
import { TYPES } from "@/lib/catalog";
import { previewBase } from "@/lib/hosts";
import { database, host } from "@/lib/server";
import { changes, getPage, listComponents } from "@/lib/store";
import { history } from "@/lib/workflow";
import { PageEditor } from "./editor";

export default async function PageEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pg = await database();
  const page = await getPage(pg, id);
  if (!page) notFound();
  const [comps, pending, past] = await Promise.all([
    listComponents(pg),
    changes(pg),
    history(pg, "page", id),
  ]);
  const state = Object.fromEntries(pending.map((c) => [`${c.kind}:${c.id}`, c.change]));
  const byId = new Map(comps.map((c) => [c.id, c]));
  return (
    <Frame>
      <PageEditor
        page={{
          id: page.id,
          path: page.path,
          status: page.status,
          width: page.width,
          spacing: page.spacing,
          title: page.title,
          description: page.description,
          deleted: page.deleted,
        }}
        change={state[`page:${id}`]}
        blocks={page.blocks.map((b) => {
          const c = byId.get(b);
          return {
            id: b,
            type: c?.type ?? "?",
            label: TYPES[c?.type ?? ""]?.label ?? c?.type ?? "（找不到）",
            name: c?.name ?? "",
            change: state[`component:${b}`],
          };
        })}
        existing={comps
          .filter((c) => !c.deleted && !page.blocks.includes(c.id))
          .map((c) => ({ value: c.id, label: `${TYPES[c.type]?.label ?? c.type} · ${c.name || c.id}` }))}
        types={Object.entries(TYPES).map(([value, t]) => ({ value, label: `${t.label}（${value}）` }))}
        preview={`${previewBase(await host())}/zh${page.path}?view=draft`}
        history={past.map((h) => ({
          id: h.id,
          at: new Date(h.created_at).toLocaleString("zh-CN"),
          by: h.author,
          message: h.message,
          deleted: h.deleted,
        }))}
      />
    </Frame>
  );
}
