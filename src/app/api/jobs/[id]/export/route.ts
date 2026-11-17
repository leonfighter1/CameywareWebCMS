import { NextResponse, type NextRequest } from "next/server";
import { keyOf } from "@/lib/files";
import { getJob, jobEvents, jobItems } from "@/lib/jobs";
import { currentUser, database } from "@/lib/server";
import { files } from "@/lib/workflow";
import { LANG_COOKIE, langOf, say } from "@/lib/words";

/**
 * 导出任务 (S7, Bell's Export Job): a job as a JSON file for a signed-in staff member: its ticket, name, step, people
 * and times, its files (kind, id, name in both languages, state) and its history.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const lang = langOf(req.cookies.get(LANG_COOKIE)?.value);
  if (!(await currentUser()))
    return new NextResponse(say({ key: "errors.signInFirst" }, lang), { status: 401 });
  const id = Number((await params).id);
  const pg = await database();
  const job = await getJob(pg, id);
  if (!job) return new NextResponse(say({ key: "errors.noJob", values: { id } }, lang), { status: 404 });
  const [items, events, all] = await Promise.all([jobItems(pg, id), jobEvents(pg, id), files(pg)]);
  const byKey = new Map(all.map((f) => [keyOf(f), f]));
  const doc = {
    cms: "cameyware-web-cms",
    kind: "job",
    job,
    files: items.map((i) => {
      const f = byKey.get(keyOf(i));
      return {
        kind: i.kind,
        id: i.id,
        name: f?.label,
        status: f?.status,
        stage: f?.stage,
        change: f?.change,
      };
    }),
    events,
  };
  return new NextResponse(JSON.stringify(doc, null, 2) + "\n", {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="cms-job-${id}-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
}
