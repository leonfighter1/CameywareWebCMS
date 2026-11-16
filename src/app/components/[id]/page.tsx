import { notFound } from "next/navigation";
import { Frame } from "@/components/frame";
import { fieldsOf, ICONS, TYPES } from "@/lib/catalog";
import { descriptionIn, labelIn } from "@/lib/labels";
import { previewBase } from "@/lib/hosts";
import { fileViews, versionView } from "@/lib/present";
import { database, host, language, requireUser } from "@/lib/server";
import { getComponent, getGlobal, getPage, usedOn } from "@/lib/store";
import { files, versions } from "@/lib/workflow";
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
  const user = await requireUser();
  const lang = await language();
  const pg = await database();
  const c = await getComponent(pg, id);
  if (!c) notFound();
  const [pages, all, past, works] = await Promise.all([
    usedOn(pg, id),
    files(pg),
    versions(pg, "component", id),
    getGlobal(pg, "works"),
  ]);
  const file = fileViews(all, lang)[`component:${id}`];
  if (!file) notFound();
  const preview = previewBase(await host());
  const shownOn = (fromPage && (await getPage(pg, fromPage))) || pages[0];
  const items = (
    (works?.data as { items?: { slug: string; name?: { zh?: string; en?: string } }[] })?.items ?? []
  ).map((w) => ({
    value: w.slug,
    label: `${(lang === "en" ? w.name?.en : w.name?.zh) ?? w.slug} (${w.slug})`,
  }));
  const def = TYPES[c.type];
  return (
    <Frame>
      <ComponentEditor
        key={`${c.updated_at}`}
        me={user.login}
        file={file}
        versions={past.map((v) => versionView(v, lang))}
        component={{ id: c.id, type: c.type, name: c.name, data: c.data, deleted: c.deleted }}
        typeLabel={def ? labelIn(def, lang) : c.type}
        typeHelp={def ? descriptionIn(def, lang) : ""}
        fields={fieldsOf(c.type)}
        ctx={{ works: items, icons: ICONS }}
        pages={pages.map((p) => ({ id: p.id, path: p.path }))}
        preview={
          shownOn
            ? `${preview}/${lang === "en" ? "en" : "zh"}${shownOn.path}?view=draft#${c.data.anchor ?? ""}`
            : undefined
        }
        back={back?.startsWith(preview) ? back : undefined}
      />
    </Frame>
  );
}
