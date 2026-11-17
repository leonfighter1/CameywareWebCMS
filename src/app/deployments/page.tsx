import { Frame } from "@/components/frame";
import { canPublish } from "@/lib/auth";
import { when } from "@/lib/present";
import {
  type Action,
  deploymentPage,
  type Deployment,
  diff,
  type Env,
  environments,
  releases,
} from "@/lib/releases";
import { database, language, requireUser } from "@/lib/server";
import { DeploymentList } from "./list";

const ENVS: Env[] = ["preview", "production"];
const STATUSES: Deployment["status"][] = ["running", "done", "failed"];
const ACTIONS: Action[] = ["preview", "back", "production", "rollback", "rebuild", "seed", "release"];
/** How many a page: the reader's choice (the owner, 2026-11-16: pagination for Deployments), 50 at first. */
const PER = [20, 50, 100];

/**
 * 部署记录, all of them (the owner, 2026-11-16: 「给deployments添加一个新的link，当前的deployment只显示当前的。要查看所有的
 * 可以查看」, then 「以往的log可以又专门的地方查看，比如查看所有deployment history（添加分页和查找和filter等功能）」):
 * every deployment, newest first, found by words in it and filtered by its site, state and step, 50 a page; each one's
 * whole log on a page of its own (/deployments/<id>). Its second tab: every release, and production back to one (the
 * 工作流 page keeps the workflow's progress alone).
 */
export default async function DeploymentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    env?: string;
    status?: string;
    action?: string;
    q?: string;
    page?: string;
    per?: string;
  }>;
}) {
  const q = await searchParams;
  const user = await requireUser();
  const lang = await language();
  const pg = await database();
  const env = ENVS.find((e) => e === q.env);
  const status = STATUSES.find((s) => s === q.status);
  const action = ACTIONS.find((a) => a === q.action);
  const words = q.q?.trim().slice(0, 200) || undefined;
  const page = Math.max(1, Number(q.page) || 1);
  const size = PER.includes(Number(q.per)) ? Number(q.per) : 50;
  const [{ total, rows }, list, envs] = await Promise.all([
    deploymentPage(pg, { page, size, env, status, action, q: words }),
    releases(pg),
    environments(pg),
  ]);
  // How far each release production showed is from what it shows now: what going back to it would change.
  const differs = Object.fromEntries(
    await Promise.all(
      list
        .filter((r) => r.manifest && r.went.includes("production") && r.id !== envs.production.release)
        .map(async (r) => [r.id, (await diff(pg, envs.production.release, r.id)).length] as const),
    ),
  );
  const busy =
    (await deploymentPage(pg, { page: 1, size: 0, env: "production", status: "running" })).total > 0;
  return (
    <Frame>
      <DeploymentList
        tab={q.tab === "releases" ? "releases" : "deployments"}
        total={total}
        page={page}
        pages={Math.max(1, Math.ceil(total / size))}
        filters={{
          env: env ?? null,
          status: status ?? null,
          action: action ?? null,
          q: words ?? "",
          per: size,
        }}
        actions={ACTIONS}
        rows={rows.map((d) => ({
          id: d.id,
          env: d.env,
          action: d.action,
          release: d.release_id,
          status: d.status,
          items: d.items.length,
          by: d.author,
          at: when(d.started_at, lang),
          end: when(d.finished_at, lang),
        }))}
        releases={{
          rows: list.map((r) => ({ ...r, at: when(r.created_at, lang), differs: differs[r.id] })),
          preview: envs.preview.release,
          production: envs.production.release,
          canPublish: canPublish(user.role),
          busy,
        }}
      />
    </Frame>
  );
}
