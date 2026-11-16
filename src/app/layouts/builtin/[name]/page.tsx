import { notFound } from "next/navigation";
import { Frame } from "@/components/frame";
import { previewBase } from "@/lib/hosts";
import { database, host, language, requireUser } from "@/lib/server";
import { listPages } from "@/lib/store";
import { isBuiltinLayout, LAYOUTS } from "@/generated/layouts";
import { BuiltinLayout } from "./builtin";

/**
 * A built-in page layout (标准, 首页, 落地页, 文章): the website's code draws it; here its zones, the pages in it, a preview,
 * and a new layout written in the CMS that starts as it.
 */
export default async function BuiltinLayoutPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  await requireUser();
  if (!isBuiltinLayout(name)) notFound();
  const lang = await language();
  const l = LAYOUTS[name]!;
  const pages = (await listPages(await database())).filter((p) => !p.deleted);
  return (
    <Frame>
      <BuiltinLayout
        name={name}
        label={lang === "en" ? l.label_en : l.label}
        description={lang === "en" ? l.description_en : l.description}
        zones={l.zones.map((z) => ({
          name: z.name,
          label: lang === "en" ? z.label_en : z.label,
          full: !!z.full,
        }))}
        pages={pages.map((p) => ({ id: p.id, path: p.path, inIt: p.layout === name }))}
        preview={previewBase(await host())}
      />
    </Frame>
  );
}
