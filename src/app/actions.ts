"use server";
/**
 * Everything the CMS's pages change, as server actions (Next checks each one comes from this site's own pages). Each
 * asks for its role first (server.ts), answers in the reader's words (`Result`), and lets the page reload what it shows.
 */
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { closeSession, SESSION_COOKIE } from "@/lib/auth";
import { startCmsSiteBuild } from "@/lib/deploy";
import { type Item, putBack, take } from "@/lib/files";
import { toHant } from "@/lib/hant";
import { attempt, database, editor, publisher } from "@/lib/server";
import {
  createComponent,
  createPage,
  deleteComponent,
  deletePage,
  getPage,
  type Kind,
  type PageRow,
  saveComponent,
  saveGlobal,
  savePage,
  saveText,
} from "@/lib/store";
import { importDoc, parseUpload } from "@/lib/transfer";
import {
  backToCheckIn,
  checkIn,
  discard,
  rebuildPreview,
  restoreVersion,
  rollbackProduction,
  terminate,
  toPreview,
  toProduction,
} from "@/lib/workflow";
import { CmsError, LANG_COOKIE, type Lang, say } from "@/lib/words";
import type { L10n } from "@/generated/model";

const done = () => revalidatePath("/", "layout");

export async function createPageAction(path: string, title: L10n) {
  return attempt(async () => {
    const user = await editor();
    const id = await createPage(await database(), { path, title }, user.login);
    done();
    return id;
  });
}

export async function savePageAction(id: string, page: Partial<PageRow>) {
  return attempt(async () => {
    const user = await editor();
    await savePage(await database(), id, page, user.login);
    done();
  });
}

export async function deletePageAction(id: string) {
  return attempt(async () => {
    const user = await editor();
    await deletePage(await database(), id, user.login);
    done();
  });
}

/** A block onto [pageId]: a new one of [type], or [existing] (a component already made), at [at] (the end by default). */
export async function addBlockAction(
  pageId: string,
  o: { type?: string; existing?: string; name?: string; at?: number },
) {
  return attempt(async () => {
    const user = await editor();
    const pg = await database();
    const page = await getPage(pg, pageId);
    if (!page) throw new CmsError("errors.noPage");
    return pg.transaction(async (tx) => {
      const id = o.existing ?? (await createComponent(tx, o.type ?? "", o.name ?? "", user.login));
      const blocks = [...page.blocks];
      blocks.splice(o.at ?? blocks.length, 0, id);
      await savePage(tx, pageId, { blocks }, user.login);
      done();
      return id;
    });
  });
}

/** [pageId]'s blocks in a new order, or with one left out. */
export async function setBlocksAction(pageId: string, blocks: string[]) {
  return attempt(async () => {
    const user = await editor();
    await savePage(await database(), pageId, { blocks }, user.login);
    done();
  });
}

export async function saveComponentAction(id: string, name: string, data: unknown) {
  return attempt(async () => {
    const user = await editor();
    await saveComponent(await database(), id, { name, data }, user.login);
    done();
  });
}

export async function deleteComponentAction(id: string) {
  return attempt(async () => {
    const user = await editor();
    await deleteComponent(await database(), id, user.login);
    done();
  });
}

export async function saveGlobalAction(key: string, data: unknown) {
  return attempt(async () => {
    const user = await editor();
    await saveGlobal(await database(), key, data, user.login);
    done();
  });
}

export async function saveTextAction(key: string, value: L10n) {
  return attempt(async () => {
    const user = await editor();
    await saveText(await database(), key, value, user.login);
    done();
  });
}

// ---- files: take, put back, discard, versions ---------------------------------------------------------------

/** 拿取, or with [over] 接手 (taking a file someone else has). */
export async function takeAction(items: Item[], over = false) {
  return attempt(async () => {
    const user = await editor();
    await take(await database(), items, user.login, over);
    done();
  });
}

/** 放回: nobody's again, the changes kept. */
export async function putBackAction(items: Item[]) {
  return attempt(async () => {
    const user = await editor();
    await putBack(await database(), items, user.login);
    done();
  });
}

/** 丢弃: back to production's version. */
export async function discardAction(items: Item[]) {
  return attempt(async () => {
    const user = await editor();
    await discard(await database(), items, user.login);
    done();
  });
}

/** A version of a file as its draft again; the blocks it names that are gone, in words. */
export async function restoreVersionAction(kind: Kind, id: string, revision: number) {
  return attempt(async (lang) => {
    const user = await editor();
    const missing = await restoreVersion(await database(), kind, id, revision, user.login);
    done();
    return missing.map((b) => say({ key: "check.noBlock", values: { id: b } }, lang));
  });
}

// ---- the workflow's steps ---------------------------------------------------------------------------------

export async function checkInAction(items: Item[], message: string) {
  return attempt(async () => {
    const user = await editor();
    const id = await checkIn(await database(), items, message, user.login);
    done();
    return id;
  });
}

/** 终止: back to whoever checked them in. */
export async function terminateAction(items: Item[]) {
  return attempt(async () => {
    await editor();
    await terminate(await database(), items);
    done();
  });
}

/** 推到预览站: built into preview.cameyware.com in the background. */
export async function pushPreviewAction(items: Item[], note: string) {
  return attempt(async () => {
    const user = await editor();
    const r = await toPreview(await database(), items, user.login, note);
    done();
    return { release: r.release, deployment: r.deployment, items: r.items.length };
  });
}

/** 退回签入: preview built again without them. */
export async function backAction(items: Item[]) {
  return attempt(async () => {
    const user = await editor();
    const r = await backToCheckIn(await database(), items, user.login);
    done();
    return { release: r.release, deployment: r.deployment };
  });
}

/** 推到正式站 (管理员 and up): committed and pushed to www.cameyware.com. */
export async function pushProductionAction(items: Item[], note: string) {
  return attempt(async () => {
    const user = await publisher();
    const r = await toProduction(await database(), items, user.login, note);
    done();
    return { release: r.release, deployment: r.deployment, items: r.items.length };
  });
}

/** Production back to a release it showed before (管理员 and up). */
export async function rollbackProductionAction(release: number) {
  return attempt(async () => {
    const user = await publisher();
    const r = await rollbackProduction(await database(), release, user.login);
    done();
    return { release: r.release, deployment: r.deployment };
  });
}

/** Preview built again as it should be. */
export async function rebuildPreviewAction() {
  return attempt(async () => {
    const user = await editor();
    const r = await rebuildPreview(await database(), user.login);
    done();
    return { release: r.release, deployment: r.deployment };
  });
}

/** The CMS's preview built again from the website's code (after the code changed, not after content). */
export async function rebuildCmsSiteAction() {
  return attempt(async () => {
    await editor();
    if (!startCmsSiteBuild()) throw new CmsError("errors.cmsSiteBuilding");
  });
}

// ---- upload, words, language, sign-out ----------------------------------------------------------------------

/** An upload: what it would change ([apply] false), or the change made, in the reader's words. */
export async function importAction(text: string, apply: boolean) {
  return attempt(async (lang) => {
    const user = await editor();
    const plan = await importDoc(await database(), parseUpload(text), user.login, apply);
    if (apply) done();
    return {
      items: plan.items.map((i) => ({ ...i, label: i.label[lang] })),
      notes: plan.notes.map((n) => say(n, lang)),
    };
  });
}

/** 简体 to 繁體 for an editor's field (lib/hant.ts; the editor reads it before saving). */
export async function toTraditionalAction(text: string) {
  return attempt(async () => {
    await editor();
    return toHant(text);
  });
}

/** The CMS in [lang] in this browser, for a year. */
export async function setLanguageAction(lang: Lang) {
  (await cookies()).set(LANG_COOKIE, lang === "en" ? "en" : "zh", {
    path: "/",
    maxAge: 365 * 24 * 3600,
    sameSite: "lax",
  });
  done();
}

export async function signOutAction() {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (id) await closeSession(await database(), id);
  jar.delete(SESSION_COOKIE);
}
