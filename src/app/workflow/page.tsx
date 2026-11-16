import { Frame } from "@/components/frame";
import { canPublish } from "@/lib/auth";
import { previewBase, productionBase } from "@/lib/hosts";
import { ADDRESSES } from "@/lib/paths";
import { fileView, when } from "@/lib/present";
import { deployments, diff, environments, readLog, releases } from "@/lib/releases";
import { database, host, language, requireUser } from "@/lib/server";
import { files } from "@/lib/workflow";
import { Board } from "./board";

/**
 * 工作流 (the owner, 2026-11-15, on the 发布 page: 「我们可以添加一个退回签入step, 在签入的step我们也可以添加terminate
 * workflow的功能」): the files at 已签入 and at 预览站, each step on the ones you pick, every deployment's log, and the
 * releases production can go back to.
 */
export default async function WorkflowPage() {
  const user = await requireUser();
  const lang = await language();
  const pg = await database();
  const [all, envs, list, runs] = await Promise.all([
    files(pg),
    environments(pg),
    releases(pg),
    deployments(pg),
  ]);
  const inWorkflow = all.filter((f) => f.status === "in_workflow");
  // How far each release production showed is from what it shows now: what going back to it would change.
  const differs = Object.fromEntries(
    await Promise.all(
      list
        .filter((r) => r.manifest && r.went.includes("production") && r.id !== envs.production.release)
        .map(async (r) => [r.id, (await diff(pg, envs.production.release, r.id)).length] as const),
    ),
  );
  const lang2 = lang === "en" ? "en" : "zh";
  return (
    <Frame>
      <Board
        me={user.login}
        canPublish={canPublish(user.role)}
        checkedIn={inWorkflow.filter((f) => f.stage === "checked_in").map((f) => fileView(f, lang))}
        onPreview={inWorkflow.filter((f) => f.stage === "preview").map((f) => fileView(f, lang))}
        envs={{
          preview: { release: envs.preview.release, at: when(envs.preview.at, lang), by: envs.preview.by },
          production: {
            release: envs.production.release,
            at: when(envs.production.at, lang),
            by: envs.production.by,
          },
        }}
        releases={list.map((r) => ({ ...r, at: when(r.created_at, lang), differs: differs[r.id] }))}
        runs={runs.map((d) => ({
          id: d.id,
          env: d.env,
          action: d.action,
          release: d.release_id,
          status: d.status,
          items: d.items.length,
          by: d.author,
          at: when(d.started_at, lang),
          log: readLog(d.log, lang).slice(-12000),
        }))}
        links={{
          cms: `${previewBase(await host())}/${lang2}/`,
          preview: `${ADDRESSES.company.preview}/${lang2}/`,
          production: `${productionBase()}/${lang2}/`,
        }}
      />
    </Frame>
  );
}
