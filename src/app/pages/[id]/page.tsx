import { notFound } from "next/navigation";
import { Frame } from "@/components/frame";
import { TYPES } from "@/lib/catalog";
import { labelIn } from "@/lib/labels";
import { previewBase } from "@/lib/hosts";
import { fileViews, versionView } from "@/lib/present";
import { database, host, language, requireUser } from "@/lib/server";
import { getPage, listComponents } from "@/lib/store";
import { files, versions } from "@/lib/workflow";
import { PageEditor } from "./editor";

export default async function PageEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const lang = await language();
  const pg = await database();
  const page = await getPage(pg, id);
  if (!page) notFound();
  const [comps, all, past] = await Promise.all([listComponents(pg), files(pg), versions(pg, "page", id)]);
  const views = fileViews(all, lang);
  const byId = new Map(comps.map((c) => [c.id, c]));
  const typeName = (type: string) => (TYPES[type] ? labelIn(TYPES[type], lang) : type);
  const file = views[`page:${id}`];
  if (!file) notFound();
  return (
    <Frame>
      <PageEditor
        // Drawn again when the page changed under it (a discard, a version restored): its fields start from it.
        key={`${page.updated_at}`}
        me={user.login}
        file={file}
        versions={past.map((v) => versionView(v, lang))}
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
        blocks={page.blocks.map((b) => {
          const c = byId.get(b);
          return {
            id: b,
            type: c?.type ?? "?",
            label: c ? typeName(c.type) : "?",
            name: c?.name ?? "",
            missing: !c || c.deleted,
            file: views[`component:${b}`],
          };
        })}
        existing={comps
          .filter((c) => !c.deleted && !page.blocks.includes(c.id))
          .map((c) => ({ value: c.id, label: `${typeName(c.type)} · ${c.name || c.id}` }))}
        types={Object.entries(TYPES).map(([value, d]) => ({
          value,
          label: `${labelIn(d, lang)} (${value})`,
        }))}
        preview={`${previewBase(await host())}/${lang === "en" ? "en" : "zh"}${page.path}?view=draft`}
      />
    </Frame>
  );
}
