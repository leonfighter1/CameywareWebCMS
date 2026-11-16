import { Frame } from "@/components/frame";
import { TYPES } from "@/lib/catalog";
import { cmsSiteBuilding } from "@/lib/deploy";
import { labelIn } from "@/lib/labels";
import { previewBase } from "@/lib/hosts";
import { fileViews, when } from "@/lib/present";
import { environments } from "@/lib/releases";
import { database, host, language, requireUser } from "@/lib/server";
import { listComponents, listPages } from "@/lib/store";
import { files } from "@/lib/workflow";
import { Central } from "./central";

/**
 * The central page (the owner, 2026-11-15: 「类似于一个file system可以查看所有的active page 和inactive page， 还可以查看
 * 不同的component」): every page by its address as a tree, active or not, each with its state; the blocks by type; your
 * files and the workflow's; where preview and production stand.
 */
export default async function CentralPage() {
  const user = await requireUser();
  const lang = await language();
  const pg = await database();
  const [pages, comps, all, envs] = await Promise.all([
    listPages(pg),
    listComponents(pg),
    files(pg),
    environments(pg),
  ]);
  const views = fileViews(all, lang);
  const used = new Set(pages.filter((p) => !p.deleted).flatMap((p) => p.blocks));
  const byType = Object.entries(TYPES).map(([type, def]) => ({
    type,
    label: labelIn(def, lang),
    count: comps.filter((c) => c.type === type && !c.deleted).length,
    unused: comps.filter((c) => c.type === type && !c.deleted && !used.has(c.id)).length,
  }));
  return (
    <Frame>
      <Central
        me={user.login}
        pages={pages.map((p) => ({
          id: p.id,
          path: p.path,
          title: (lang === "en" ? p.title.en : undefined) || p.title.zh || "",
          status: p.status,
          deleted: p.deleted,
          blocks: p.blocks.length,
          file: views[`page:${p.id}`],
          updated: `${p.updated_by} · ${when(p.updated_at, lang)}`,
        }))}
        types={byType}
        mine={all.filter((f) => f.status === "checked_out" && f.owner === user.login).length}
        workflow={all.filter((f) => f.status === "in_workflow").length}
        preview={previewBase(await host())}
        releases={{ preview: envs.preview.release, production: envs.production.release }}
        building={cmsSiteBuilding()}
      />
    </Frame>
  );
}
