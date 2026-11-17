import { Frame } from "@/components/frame";
import { typeName } from "@/lib/catalog";
import { keyOf } from "@/lib/files";
import { jobPage } from "@/lib/jobs";
import { dependencyViews, fileView, jobView } from "@/lib/present";
import { database, language, requireUser } from "@/lib/server";
import { workingStates } from "@/lib/store";
import { dependencies, files } from "@/lib/workflow";
import { Mine } from "./mine";

/**
 * 我的文件 (the owner, 2026-11-15: 「用户可以查看当下哪些文件在他们的名下，然后可以多个文件一同签入，当然也可以移除相关
 * 文件」; S7: 「我们需要可以知道自己有哪些文件可以添加到workflow里去」): the files checked out by you, to put into a job of
 * the workflow (a new one or one of yours at 进行中), put back or discard; under them their 依赖 (the new files your pages
 * need, yours among them shown there rather than above); and your jobs not ended.
 */
export default async function MinePage() {
  const user = await requireUser();
  const lang = await language();
  const pg = await database();
  const [all, jobs] = await Promise.all([
    files(pg),
    jobPage(pg, { page: 1, size: 200, author: user.login, step: "open" }),
  ]);
  const held = all.filter((f) => f.owner === user.login && f.status === "checked_out");
  const deps = await dependencies(
    pg,
    held.map(({ kind, id }) => ({ kind, id })),
    user.login,
  );
  const isDep = new Set(deps.map(keyOf));
  return (
    <Frame>
      <Mine
        me={user.login}
        held={held.filter((f) => !isDep.has(keyOf(f))).map((f) => fileView(f, lang))}
        deps={dependencyViews(deps, await workingStates(pg), lang, (t) => typeName(t, lang))}
        jobs={jobs.rows.map((j) => jobView(j, lang))}
      />
    </Frame>
  );
}
