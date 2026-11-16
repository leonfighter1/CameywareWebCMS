import type { ReactNode } from "react";
import { ROLE_NAMES } from "@/lib/auth";
import { previewBase, productionBase } from "@/lib/hosts";
import { database, host, requireUser } from "@/lib/server";
import { changes } from "@/lib/store";
import { Shell } from "./shell";

/** Every signed-in page: the menu, the count of changes waiting for a check-in, who is signed in. */
export async function Frame({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const pending = (await changes(await database())).length;
  return (
    <Shell
      user={user.login}
      role={ROLE_NAMES[user.role]}
      pending={pending}
      preview={previewBase(await host())}
      production={productionBase()}
    >
      {children}
    </Shell>
  );
}
