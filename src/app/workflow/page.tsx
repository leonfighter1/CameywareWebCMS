import { Frame } from "@/components/frame";
import { canPublish } from "@/lib/auth";
import { previewBase, productionBase } from "@/lib/hosts";
import { ADDRESSES } from "@/lib/paths";
import { fileView, when } from "@/lib/present";
import { deploymentPage, deployments, environments, readLog } from "@/lib/releases";
import { database, host, language, requireUser } from "@/lib/server";
import { files } from "@/lib/workflow";
import { Board } from "./board";

/**
 * 工作流 (the owner, 2026-11-15, on the 发布 page: 「我们可以添加一个退回签入step, 在签入的step我们也可以添加terminate
 * workflow的功能」; S6: 「workflow只针对可查找的workflow进度，为了页面干净，可以显示当前的deployment进度，至于以往的log
 * 可以又专门的地方查看」): the files at 已签入 and at 预览站, each step on the ones you pick, and the deployment running
 * now (none: the last one, its log a link). Every deployment and every release are on /deployments.
 */
export default async function WorkflowPage() {
  const user = await requireUser();
  const lang = await language();
  const pg = await database();
  const [all, envs, recent, { total }] = await Promise.all([
    files(pg),
    environments(pg),
    // At most one runs per site: the latest few hold them.
    deployments(pg, 5),
    deploymentPage(pg, { page: 1, size: 0 }),
  ]);
  const inWorkflow = all.filter((f) => f.status === "in_workflow");
  const running = recent.filter((d) => d.status === "running");
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
        runs={(running.length ? running : recent.slice(0, 1)).map((d) => ({
          id: d.id,
          env: d.env,
          action: d.action,
          release: d.release_id,
          status: d.status,
          items: d.items.length,
          by: d.author,
          at: when(d.started_at, lang),
          log: d.status === "running" ? readLog(d.log, lang).slice(-12000) : "",
        }))}
        total={total}
        links={{
          cms: `${previewBase(await host())}/${lang2}/`,
          preview: `${ADDRESSES.company.preview}/${lang2}/`,
          production: `${productionBase()}/${lang2}/`,
        }}
      />
    </Frame>
  );
}
