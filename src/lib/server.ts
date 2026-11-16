/**
 * What every page, action and route of the CMS starts with: the database (seeded on the first start, with the texts the
 * website's code added since), and the staff member signed in. Server side only.
 */
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { canEdit, canPublish, SESSION_COOKIE, sessionUser, type User } from "./auth";
import { db } from "./db";
import { addCodeTexts, seedIfEmpty } from "./seed";
import { CmsError } from "./store";
import { failInterrupted } from "./workflow";

const ready = globalThis as unknown as { cmsReady?: Promise<void> };

/** The database, ready: on this process's first use, seeded if empty, the code's new texts in, interrupted deployments failed. */
export async function database() {
  const pg = await db();
  ready.cmsReady ??= (async () => {
    await seedIfEmpty(pg);
    await addCodeTexts(pg);
    await failInterrupted(pg);
  })();
  await ready.cmsReady;
  return pg;
}

export async function currentUser(): Promise<User | undefined> {
  const pg = await database();
  return sessionUser(pg, (await cookies()).get(SESSION_COOKIE)?.value);
}

/** A page's visitor, signed in, or off to sign in. */
export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/** An action's caller who may edit (refused in words otherwise). */
export async function editor(): Promise<User> {
  const user = await currentUser();
  if (!user) throw new CmsError("请先登录");
  if (!canEdit(user.role)) throw new CmsError("你的角色不能修改网站内容");
  return user;
}

/** An action's caller who may push to production: 管理员 or 超级管理员. */
export async function publisher(): Promise<User> {
  const user = await editor();
  if (!canPublish(user.role)) throw new CmsError("只有管理员和超级管理员能推到正式站");
  return user;
}

/** The address this request came to (a page's links depend on it: the tunnel's or this computer's). */
export async function host() {
  const h = await headers();
  return h.get("x-forwarded-host") ?? h.get("host") ?? "127.0.0.1";
}

export type Result<T = unknown> = { ok: true; value?: T } | { ok: false; error: string; details: string[] };

/** An action's work, its refusal in words: what a client component shows. */
export async function attempt<T>(work: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await work() };
  } catch (e) {
    if (e instanceof CmsError) return { ok: false, error: e.message, details: e.details };
    console.error(e);
    return { ok: false, error: "出错了", details: [e instanceof Error ? e.message : String(e)] };
  }
}
