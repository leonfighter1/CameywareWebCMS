import { Frame } from "@/components/frame";
import { keyOf } from "@/lib/files";
import { canPublish } from "@/lib/auth";
import { previewBase, productionBase } from "@/lib/hosts";
import { getJob, jobDeployments, jobEvents, jobItems, jobPage, type Step, STEPS } from "@/lib/jobs";
import { ADDRESSES } from "@/lib/paths";
import { fileView, jobView, when } from "@/lib/present";
import { deploymentPage, deployments, environments, readLog } from "@/lib/releases";
import { database, host, language, requireUser } from "@/lib/server";
import { files } from "@/lib/workflow";
import { JobManager } from "./jobs";

const PER = 20;

/**
 * 工作流 as Bell's Workflow Job Manager (S7; the owner, 2026-11-16: 「workflow可以有多个 … workflow必须实例化」; before:
 * 「workflow只针对可查找的workflow进度 … 可以显示当前的deployment进度」): the job picked (?job=) with its steps and what
 * can be done now, the jobs (mine or all, by step, found, in pages), its files and history, and the deployment running
 * now. Every deployment and every release are on /deployments.
 */
export default async function WorkflowPage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string; scope?: string; step?: string; q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const user = await requireUser();
  const lang = await language();
  const pg = await database();
  const scope = sp.scope === "all" ? "all" : "mine";
  const step: Step | "open" | undefined =
    sp.step === "all" ? undefined : STEPS.includes(sp.step as Step) ? (sp.step as Step) : "open";
  const page = Math.max(1, Number(sp.page) || 1);
  const list = await jobPage(pg, {
    page,
    size: PER,
    author: scope === "mine" ? user.login : undefined,
    step,
    q: sp.q,
  });
  const chosen = Number(sp.job) || list.rows[0]?.id;
  const job = chosen ? await getJob(pg, chosen) : undefined;
  const [all, envs, recent, { total }, events, items, runs] = await Promise.all([
    files(pg),
    environments(pg),
    // At most one runs per site: the latest few hold them.
    deployments(pg, 5),
    deploymentPage(pg, { page: 1, size: 0 }),
    job ? jobEvents(pg, job.id) : [],
    job ? jobItems(pg, job.id) : [],
    job ? jobDeployments(pg, job.id) : [],
  ]);
  const byKey = new Map(all.map((f) => [keyOf(f), f]));
  const running = recent.filter((d) => d.status === "running");
  const lang2 = lang === "en" ? "en" : "zh";
  return (
    <Frame>
      <JobManager
        me={user.login}
        canPublish={canPublish(user.role)}
        job={job && jobView(job, lang)}
        files={items.flatMap((i) => {
          const f = byKey.get(keyOf(i));
          return f ? [fileView(f, lang)] : [];
        })}
        events={events.map((e) => ({
          ...e,
          at: when(e.at, lang),
          note: e.action === "scheduled" ? when(e.note, lang) : e.note,
        }))}
        jobRuns={runs.map((d) => ({ ...d, at: when(d.started_at, lang) }))}
        list={{ rows: list.rows.map((j) => jobView(j, lang)), total: list.total, page, per: PER }}
        filters={{ scope, step: sp.step === "all" ? "all" : (step ?? "open"), q: sp.q ?? "" }}
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
