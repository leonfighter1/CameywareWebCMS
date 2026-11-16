import { Frame } from "@/components/frame";
import { fileView } from "@/lib/present";
import { database, language, requireUser } from "@/lib/server";
import { files } from "@/lib/workflow";
import { Mine } from "./mine";

/**
 * 我的文件 (the owner, 2026-11-15: 「用户可以查看当下哪些文件在他们的名下，然后可以多个文件一同签入，当然也可以移除相关
 * 文件」): the files checked out by you, to check in together, put back or discard; and yours in the workflow.
 */
export default async function MinePage() {
  const user = await requireUser();
  const lang = await language();
  const all = await files(await database());
  const ofMine = all.filter((f) => f.owner === user.login);
  return (
    <Frame>
      <Mine
        me={user.login}
        held={ofMine.filter((f) => f.status === "checked_out").map((f) => fileView(f, lang))}
        inWorkflow={ofMine.filter((f) => f.status === "in_workflow").map((f) => fileView(f, lang))}
      />
    </Frame>
  );
}
