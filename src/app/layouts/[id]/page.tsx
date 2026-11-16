import { notFound } from "next/navigation";
import { Frame } from "@/components/frame";
import { previewBase } from "@/lib/hosts";
import { fileViews, versionView } from "@/lib/present";
import { database, host, language, requireUser } from "@/lib/server";
import { getLayout, listPages } from "@/lib/store";
import { files, versions } from "@/lib/workflow";
import { LayoutEditor } from "./editor";

/**
 * A page layout written in the CMS (S4, L1: 「landing page layout， 还有homepagelayout 以及article」): its markup with every
 * problem said, the zones it has, the pages in it, and a live preview of a page drawn in it (the saved draft).
 */
export default async function LayoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const lang = await language();
  const pg = await database();
  const layout = await getLayout(pg, id);
  if (!layout) notFound();
  const [all, past, pages] = await Promise.all([files(pg), versions(pg, "layout", id), listPages(pg)]);
  const file = fileViews(all, lang)[`layout:${id}`];
  if (!file) notFound();
  const live = pages.filter((p) => !p.deleted);
  return (
    <Frame>
      <LayoutEditor
        key={layout.updated_at}
        me={user.login}
        file={file}
        versions={past.map((v) => versionView(v, lang))}
        layout={{ id: layout.id, name: layout.name, markup: layout.markup, deleted: layout.deleted }}
        pages={live.map((p) => ({ id: p.id, path: p.path, inIt: p.layout === id }))}
        preview={previewBase(await host())}
      />
    </Frame>
  );
}
