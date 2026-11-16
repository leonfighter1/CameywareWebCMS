import { notFound } from "next/navigation";
import { Frame } from "@/components/frame";
import { TYPES } from "@/lib/catalog";
import { previewBase } from "@/lib/hosts";
import { descriptionIn, labelIn } from "@/lib/labels";
import { database, host, language, requireUser } from "@/lib/server";
import { listComponents, listPages } from "@/lib/store";
import { Builtin } from "./builtin";

/**
 * A type's built-in template: its view in the website's code (src/cms/views.tsx), which the CMS can't change. It draws
 * every block of the type that names no template; a new template starts from the type's fields.
 */
export default async function BuiltinPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  await requireUser();
  const def = TYPES[type];
  if (!def) notFound();
  const lang = await language();
  const pg = await database();
  const [comps, pages] = await Promise.all([listComponents(pg, type), listPages(pg)]);
  const live = pages.filter((p) => !p.deleted);
  return (
    <Frame>
      <Builtin
        type={type}
        typeLabel={labelIn(def, lang)}
        typeHelp={descriptionIn(def, lang)}
        blocks={comps
          .filter((c) => !c.deleted)
          .map((c) => ({
            id: c.id,
            name: c.name || c.id,
            drawn: live.some((p) => p.blocks.some((b) => b.id === c.id && !b.style)),
            onPage: live.some((p) => p.blocks.some((b) => b.id === c.id)),
          }))}
        preview={previewBase(await host())}
      />
    </Frame>
  );
}
