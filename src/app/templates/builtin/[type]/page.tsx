import { notFound } from "next/navigation";
import { Frame } from "@/components/frame";
import { canCode } from "@/lib/auth";
import { TYPES } from "@/lib/catalog";
import { knownTexts, standing } from "@/lib/code";
import { gitTexts } from "@/lib/git";
import { previewBase } from "@/lib/hosts";
import { descriptionIn, labelIn } from "@/lib/labels";
import { fileViews, versionView } from "@/lib/present";
import { addCodeFiles } from "@/lib/seed";
import { database, host, language, requireUser } from "@/lib/server";
import { getCode, listComponents, listPages, revisionsAt } from "@/lib/store";
import { files, versions } from "@/lib/workflow";
import { codePath } from "@/generated/code";
import { Builtin } from "./builtin";

/**
 * A type's built-in template: its view in the website's code (src/cms/views/<type>.tsx), which draws every block of the
 * type placed without a style. Since S6 a file like any other (kind code): its state, versions, the code to read, download
 * and replace by upload (超级管理员), and whether the website's main changed it since the CMS took it in. A new template
 * starts from the type's fields.
 */
export default async function BuiltinPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const user = await requireUser();
  const def = TYPES[type];
  if (!def) notFound();
  const lang = await language();
  const pg = await database();
  // The code's latest in first, while nobody has the file (seed.ts).
  await addCodeFiles(pg).catch((e) => console.error(e));
  const [comps, pages, code, all, past, prod, known, main] = await Promise.all([
    listComponents(pg, type),
    listPages(pg),
    getCode(pg, type),
    files(pg),
    versions(pg, "code", type),
    revisionsAt(pg, () => false),
    knownTexts(pg),
    gitTexts("main", [codePath(type)]).catch(() => new Map<string, string | undefined>()),
  ]);
  const live = pages.filter((p) => !p.deleted);
  const there = main.get(codePath(type));
  const now = standing(
    there,
    (prod.get(`code:${type}`)?.data as { source?: string } | undefined)?.source,
    known.get(type),
  );
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
        me={user.login}
        canCode={canCode(user.role)}
        path={codePath(type)}
        source={code?.source}
        file={fileViews(all, lang)[`code:${type}`]}
        versions={past.map((v) => versionView(v, lang))}
        standing={now === "changed" || now === "behind" ? now : undefined}
      />
    </Frame>
  );
}
