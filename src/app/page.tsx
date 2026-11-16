import { Frame } from "@/components/frame";
import { TYPES } from "@/lib/catalog";
import { cmsSiteBuilding } from "@/lib/deploy";
import { previewBase } from "@/lib/hosts";
import { database, host } from "@/lib/server";
import { changes, listComponents, listPages } from "@/lib/store";
import { environments } from "@/lib/workflow";
import { Central } from "./central";

/**
 * The central page (the owner, 2026-11-15: 「类似于一个file system可以查看所有的active page 和inactive page， 还可以查看
 * 不同的component」): every page by its address as a tree, active or not, with what is waiting for a check-in; the
 * blocks by type; where preview and production stand.
 */
export default async function CentralPage() {
  const pg = await database();
  const [pages, comps, pending, envs] = await Promise.all([
    listPages(pg),
    listComponents(pg),
    changes(pg),
    environments(pg),
  ]);
  const state = Object.fromEntries(pending.map((c) => [`${c.kind}:${c.id}`, c.change]));
  const used = new Set(pages.filter((p) => !p.deleted).flatMap((p) => p.blocks));
  const byType = Object.entries(TYPES).map(([type, def]) => ({
    type,
    label: def.label,
    count: comps.filter((c) => c.type === type && !c.deleted).length,
    unused: comps.filter((c) => c.type === type && !c.deleted && !used.has(c.id)).length,
  }));
  return (
    <Frame>
      <Central
        pages={pages.map((p) => ({
          id: p.id,
          path: p.path,
          title: p.title.zh ?? "",
          status: p.status,
          deleted: p.deleted,
          blocks: p.blocks.length,
          change: state[`page:${p.id}`],
          updated: `${p.updated_by} · ${new Date(p.updated_at).toLocaleString("zh-CN")}`,
        }))}
        types={byType}
        pending={pending.length}
        preview={previewBase(await host())}
        releases={{ preview: envs.preview.release, production: envs.production.release }}
        building={cmsSiteBuilding()}
      />
    </Frame>
  );
}
