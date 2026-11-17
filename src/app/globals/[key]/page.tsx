import { notFound } from "next/navigation";
import { Frame } from "@/components/frame";
import { GLOBALS, ICONS } from "@/lib/catalog";
import { descriptionIn, labelIn } from "@/lib/labels";
import { previewBase } from "@/lib/hosts";
import { fileViews, versionView } from "@/lib/present";
import { database, host, language, requireUser } from "@/lib/server";
import { getGlobal } from "@/lib/store";
import { files, versions } from "@/lib/workflow";
import { GlobalEditor } from "./editor";

/** A global (公司, 页头, 页脚, 作品, 网站的标题和描述): where the header's and the footer's Edit lead. */
export default async function GlobalPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ back?: string }>;
}) {
  const { key } = await params;
  const { back } = await searchParams;
  const def = GLOBALS[key];
  if (!def) notFound();
  const user = await requireUser();
  const lang = await language();
  const pg = await database();
  const [g, all, past, works] = await Promise.all([
    getGlobal(pg, key),
    files(pg),
    versions(pg, "global", key),
    getGlobal(pg, "works"),
  ]);
  const file = fileViews(all, lang)[`global:${key}`];
  if (!g || !file) notFound();
  // 预览: the page the preview's Edit came from, in its drafts; or the home page.
  const base = previewBase(await host());
  const from = back?.startsWith(base) ? new URL(back) : undefined;
  from?.searchParams.set("view", "draft");
  const items = ((works?.data as { items?: { slug: string }[] })?.items ?? []).map((w) => ({
    value: w.slug,
    label: w.slug,
  }));
  return (
    <Frame>
      <GlobalEditor
        key={`${g.updated_at}`}
        me={user.login}
        file={file}
        versions={past.map((v) => versionView(v, lang))}
        name={key}
        label={labelIn(def, lang)}
        description={descriptionIn(def, lang)}
        fields={def.fields}
        all={Object.entries(GLOBALS).map(([k, d]) => ({ key: k, label: labelIn(d, lang) }))}
        data={g.data}
        ctx={{ works: items, icons: ICONS }}
        back={back}
        preview={from?.href ?? `${base}/${lang === "en" ? "en" : "zh"}/?view=draft`}
      />
    </Frame>
  );
}
