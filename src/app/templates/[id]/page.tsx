import { notFound } from "next/navigation";
import { Frame } from "@/components/frame";
import { fieldsOf, TYPES } from "@/lib/catalog";
import { previewBase } from "@/lib/hosts";
import { labelIn } from "@/lib/labels";
import { fieldRefs, fileViews, versionView } from "@/lib/present";
import { database, host, language, requireUser } from "@/lib/server";
import { getTemplate, listComponents, listPages } from "@/lib/store";
import { files, versions } from "@/lib/workflow";
import { TemplateEditor } from "./editor";

/**
 * A template's editor (组件样式; the owner, 2026-11-16: 「all templates related to this content, can express the
 * content」): its markup with every problem said, the elements and the type's fields to write it with, the blocks it
 * draws, and a live preview of one block of the type drawn by it (the saved draft).
 */
export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const lang = await language();
  const pg = await database();
  const tpl = await getTemplate(pg, id);
  if (!tpl) notFound();
  const [all, past, comps, pages] = await Promise.all([
    files(pg),
    versions(pg, "template", id),
    listComponents(pg, tpl.type),
    listPages(pg),
  ]);
  const file = fileViews(all, lang)[`template:${id}`];
  if (!file) notFound();
  const live = pages.filter((p) => !p.deleted);
  const def = TYPES[tpl.type];
  return (
    <Frame>
      <TemplateEditor
        key={tpl.updated_at}
        me={user.login}
        file={file}
        versions={past.map((v) => versionView(v, lang))}
        template={{ id: tpl.id, type: tpl.type, name: tpl.name, markup: tpl.markup, deleted: tpl.deleted }}
        typeLabel={def ? labelIn(def, lang) : tpl.type}
        fields={fieldRefs(fieldsOf(tpl.type), lang)}
        blocks={comps
          .filter((c) => !c.deleted)
          .map((c) => ({
            id: c.id,
            name: c.name || c.id,
            drawn: live.some((p) => p.blocks.some((b) => b.id === c.id && b.style === id)),
            onPage: live.some((p) => p.blocks.some((b) => b.id === c.id)),
          }))}
        preview={previewBase(await host())}
      />
    </Frame>
  );
}
