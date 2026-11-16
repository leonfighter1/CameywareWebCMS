import type { ReactNode } from "react";
import { roleName } from "@/lib/auth";
import { previewBase, productionBase } from "@/lib/hosts";
import { database, host, language, requireUser } from "@/lib/server";
import { files } from "@/lib/workflow";
import { say } from "@/lib/words";
import { Shell } from "./shell";

/** Every signed-in page: the menu (with how many files are yours and in the workflow), who is signed in. */
export async function Frame({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const lang = await language();
  const all = await files(await database());
  return (
    <Shell
      user={user.login}
      role={say(roleName(user.role), lang)}
      lang={lang}
      mine={all.filter((f) => f.status === "checked_out" && f.owner === user.login).length}
      workflow={all.filter((f) => f.status === "in_workflow").length}
      preview={previewBase(await host())}
      production={productionBase()}
    >
      {children}
    </Shell>
  );
}
