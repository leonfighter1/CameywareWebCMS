import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Frame } from "@/components/frame";
import { fieldsOf, ICONS, TYPES } from "@/lib/catalog";
import { descriptionIn, labelIn } from "@/lib/labels";
import { previewBase } from "@/lib/hosts";
import { fileViews, pageUses, versionView } from "@/lib/present";
import { database, host, language, requireUser } from "@/lib/server";
import { getComponent, getGlobal, getPage, listTemplates, usedOn } from "@/lib/store";
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
  const [pages, all, past, works, templates] = await Promise.all([
    usedOn(pg, id),
    files(pg),
    versions(pg, "component", id),
    getGlobal(pg, "works"),
    listTemplates(pg, c.type),
  ]);
  const file = fileViews(all, lang)[`component:${id}`];
  if (!file) notFound();
  const preview = previewBase(await host());
  const site = `${preview}/${lang === "en" ? "en" : "zh"}`;
  const shownOn = (fromPage && (await getPage(pg, fromPage))) || pages[0];
  const items = (
    (works?.data as { items?: { slug: string; name?: { zh?: string; en?: string } }[] })?.items ?? []
  ).map((w) => ({
    value: w.slug,
    label: `${(lang === "en" ? w.name?.en : w.name?.zh) ?? w.slug} (${w.slug})`,
  }));
  const def = TYPES[c.type];
  const builtin = (await getTranslations("component"))("builtin");
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
        uses={pageUses(pages, id, {
          lang,
          site,
          anchor: c.data.anchor,
          style: (s) => (s ? (templates.find((x) => x.id === s)?.name ?? s) : builtin),
        })}
        preview={shownOn ? `${site}${shownOn.path}?view=draft#${c.data.anchor ?? ""}` : undefined}
        back={back?.startsWith(preview) ? back : undefined}
      />
    </Frame>
  );
}
