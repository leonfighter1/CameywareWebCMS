"use server";
/**
 * Everything the CMS's pages change, as server actions (Next checks each one comes from this site's own pages). Each
 * asks for its role first (server.ts), answers in words (`Result`), and lets the page reload what it shows.
 */
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { closeSession, SESSION_COOKIE } from "@/lib/auth";
import { toHant } from "@/lib/hant";
import { deploy, startCmsSiteBuild } from "@/lib/deploy";
import { attempt, database, editor, publisher } from "@/lib/server";
import {
  CmsError,
  createComponent,
  createPage,
  deleteComponent,
  deletePage,
  discard,
  getPage,
  type Kind,
  type PageRow,
  saveComponent,
  saveGlobal,
  savePage,
  saveText,
} from "@/lib/store";
import { importDoc, parseUpload } from "@/lib/transfer";
import { checkIn, createRelease, environments, type Item } from "@/lib/workflow";
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
    if (!page) throw new CmsError("没有这个页面");
    const id = o.existing ?? (await createComponent(pg, o.type ?? "", o.name ?? "", user.login));
    const blocks = [...page.blocks];
    blocks.splice(o.at ?? blocks.length, 0, id);
    await savePage(pg, pageId, { blocks }, user.login);
    done();
    return id;
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

export async function discardAction(kind: Kind, id: string) {
  return attempt(async () => {
    const user = await editor();
    await discard(await database(), kind, id, user.login);
    done();
  });
}

export async function checkInAction(items: Item[], message: string) {
  return attempt(async () => {
    const user = await editor();
    const id = await checkIn(await database(), items, message, user.login);
    done();
    return id;
  });
}

/** 推到预览站: a release of everything checked in, built into preview.cameyware.com in the background. */
export async function pushPreviewAction(note: string) {
  return attempt(async () => {
    const user = await editor();
    const release = await createRelease(await database(), user.login, note);
    const { id } = await deploy("preview", release, user.login);
    done();
    return { release, deployment: id };
  });
}

/** 推到正式站: the release preview shows ([release], or it by default) to www.cameyware.com. */
export async function pushProductionAction(release?: number) {
  return attempt(async () => {
    const user = await publisher();
    const r = release ?? (await environments(await database())).preview.release;
    if (!r) throw new CmsError("预览站还没有版本");
    const { id } = await deploy("production", r, user.login);
    done();
    return { release: r, deployment: id };
  });
}

/** An earlier release to preview again (a rollback there). */
export async function redeployPreviewAction(release: number) {
  return attempt(async () => {
    const user = await editor();
    const { id } = await deploy("preview", release, user.login);
    done();
    return { release, deployment: id };
  });
}

/** The CMS's preview built again from the website's code (after the code changed, not after content). */
export async function rebuildCmsSiteAction() {
  return attempt(async () => {
    await editor();
    if (!startCmsSiteBuild()) throw new CmsError("CMS 预览站正在重建，几分钟后刷新看看");
  });
}

/** An upload: what it would change ([apply] false), or the change made. */
export async function importAction(text: string, apply: boolean) {
  return attempt(async () => {
    const user = await editor();
    const plan = await importDoc(await database(), parseUpload(text), user.login, apply);
    if (apply) done();
    return plan;
  });
}

/** 简体 to 繁體 for an editor's field (lib/hant.ts; the editor reads it before saving). */
export async function toTraditionalAction(text: string) {
  return attempt(async () => {
    await editor();
    return toHant(text);
  });
}

export async function signOutAction() {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (id) await closeSession(await database(), id);
  jar.delete(SESSION_COOKIE);
}
