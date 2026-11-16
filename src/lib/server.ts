/**
 * What every page, action and route of the CMS starts with: the database (seeded on the first start, with the texts the
 * website's code added since), the staff member signed in, and the language they read the CMS in. Server side only.
 */
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { canEdit, canPublish, SESSION_COOKIE, sessionUser, type User } from "./auth";
import { db } from "./db";
import { failInterrupted } from "./releases";
import { addCodeTexts, seedIfEmpty } from "./seed";
import { CmsError, LANG_COOKIE, type Lang, langOf, say, sayAll } from "./words";

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

/** The language this browser reads the CMS in (中文 unless it chose English). */
export async function language(): Promise<Lang> {
  return langOf((await cookies()).get(LANG_COOKIE)?.value);
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
  if (!user) throw new CmsError("errors.signInFirst");
  if (!canEdit(user.role)) throw new CmsError("errors.cannotEdit");
  return user;
}

/** An action's caller who may push to production: 管理员 or 超级管理员. */
export async function publisher(): Promise<User> {
  const user = await editor();
  if (!canPublish(user.role)) throw new CmsError("errors.cannotPublish");
  return user;
}

/** The address this request came to (a page's links depend on it: the tunnel's or this computer's). */
export async function host() {
  const h = await headers();
  return h.get("x-forwarded-host") ?? h.get("host") ?? "127.0.0.1";
}

export type Result<T = unknown> = { ok: true; value?: T } | { ok: false; error: string; details: string[] };

/** An action's work, its refusal in the reader's words: what a client component shows. */
export async function attempt<T>(work: (lang: Lang) => Promise<T>): Promise<Result<T>> {
  const lang = await language();
  try {
    return { ok: true, value: await work(lang) };
  } catch (e) {
    if (e instanceof CmsError)
      return { ok: false, error: say(e.msg, lang), details: sayAll(e.details, lang) };
    console.error(e);
    return {
      ok: false,
      error: say({ key: "errors.failed" }, lang),
      details: [e instanceof Error ? e.message : String(e)],
    };
  }
}
