import type { ReactNode } from "react";
import { canPublish, roleName } from "@/lib/auth";
import { bell } from "@/lib/jobs";
import { bellView } from "@/lib/present";
import { previewBase, productionBase } from "@/lib/hosts";
import { database, host, language, requireUser } from "@/lib/server";
import { files } from "@/lib/workflow";
import { say } from "@/lib/words";
import { Shell } from "./shell";

/**
 * Every signed-in page: the menu (with how many files are yours and how many jobs are open), who is signed in, the bell
 * (S7).
 */
export async function Frame({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const lang = await language();
  const pg = await database();
  const [all, open, news] = await Promise.all([
    files(pg),
    pg.query<{ n: number }>(`select count(*)::int as n from jobs where step not in ('done', 'terminated')`),
    bell(pg, user.login, canPublish(user.role)),
  ]);
  return (
    <Shell
      user={user.login}
      role={say(roleName(user.role), lang)}
      lang={lang}
      mine={all.filter((f) => f.status === "checked_out" && f.owner === user.login).length}
      workflow={Number(open.rows[0]?.n ?? 0)}
      bell={bellView(news, lang)}
      preview={previewBase(await host())}
      production={productionBase()}
    >
      {children}
    </Shell>
  );
}
