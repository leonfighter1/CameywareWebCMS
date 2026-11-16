"use server";
/**
 * Everything the CMS's pages change, as server actions (Next checks each one comes from this site's own pages). Each
 * asks for its role first (server.ts), answers in the reader's words (`Result`), and lets the page reload what it shows.
 */
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { closeSession, SESSION_COOKIE } from "@/lib/auth";
import { startCmsSiteBuild } from "@/lib/deploy";
import { fileState, type Item, putBack, take } from "@/lib/files";
import { toHant } from "@/lib/hant";
import { addCodeFiles } from "@/lib/seed";
import { attempt, coder, database, editor, publisher } from "@/lib/server";
import { fieldsOf } from "@/lib/catalog";
import { placement, starterLayout } from "@/lib/pages";
import { insertPlacement, type Target } from "@/lib/rows";
import {
  codeProblems,
  createComponent,
  createLayout,
  createPage,
  createTemplate,
  deleteComponent,
  deleteLayout,
  deletePage,
  deleteTemplate,
  getComponent,
  getLayout,
  getPage,
  getTemplate,
  type Kind,
  layoutProblems,
  type PageChange,
  type Placement,
  saveCode,
  saveComponent,
  saveGlobal,
  saveLayout,
  savePage,
  saveTemplate,
  saveText,
  templateProblems,
} from "@/lib/store";
import { isBuiltinLayout } from "@/generated/layouts";
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
import { CmsError, LANG_COOKIE, type Lang, say, sayAll } from "@/lib/words";
import type { L10n } from "@/generated/model";
import { starterTemplate } from "@/generated/template";

const done = () => revalidatePath("/", "layout");

export async function createPageAction(path: string, title: L10n) {
  return attempt(async () => {
    const user = await editor();
    const id = await createPage(await database(), { path, title }, user.login);
    done();
    return id;
  });
}

/** A page's settings (its address, its state, its words, its layout, breadcrumb and sitemap). */
export async function savePageAction(id: string, page: Omit<PageChange, "blocks">) {
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

/**
 * A component placed on [pageId] (the page editor's rows, after Bell's Component Attributes: 「Use Shared / Create New /
 * Copy From Existing」): [existing] (shared), a new one of [type] named [name], or a copy of [copyOf]'s content; with
 * [style]; at [to] (rows.ts: beside a row's components, or a row of its own), or in place of the place at [replace] (its
 * zone and row kept).
 */
export async function placeBlockAction(
  pageId: string,
  o: {
    existing?: string;
    type?: string;
    name?: string;
    copyOf?: string;
    style?: string;
    to: Target;
    replace?: number;
  },
) {
  return attempt(async () => {
    const user = await editor();
    const pg = await database();
    const page = await getPage(pg, pageId);
    if (!page) throw new CmsError("errors.noPage");
    return pg.transaction(async (tx) => {
      let id = o.existing;
      if (!id && o.copyOf) {
        const source = await getComponent(tx, o.copyOf);
        if (!source || source.deleted) throw new CmsError("errors.noBlock");
        id = await createComponent(tx, source.type, o.name || source.name, user.login, source.data);
      }
      id ??= await createComponent(tx, o.type ?? "", o.name ?? "", user.login);
      const old = o.replace !== undefined ? page.blocks[o.replace] : undefined;
      const blocks = old
        ? page.blocks.map((b, i) =>
            i === o.replace ? placement({ id, zone: old.zone, row: old.row, style: o.style }) : b,
          )
        : insertPlacement(page.blocks, placement({ id, zone: o.to.zone, style: o.style }), o.to);
      await savePage(tx, pageId, { blocks }, user.login);
      done();
      return id;
    });
  });
}

/** [pageId]'s placements: in a new order, in other zones, with other styles, or with one left out. */
export async function setBlocksAction(pageId: string, blocks: Placement[]) {
  return attempt(async () => {
    const user = await editor();
    await savePage(await database(), pageId, { blocks }, user.login);
    done();
  });
}

/** A block's name and data (its style is chosen where a page places it). */
export async function saveComponentAction(id: string, name: string, data: unknown) {
  return attempt(async () => {
    const user = await editor();
    await saveComponent(await database(), id, { name, data }, user.login);
    done();
  });
}

/** A new page layout: a copy of [from] (a CMS layout's id, or a built-in one's starting markup), yours. */
export async function createLayoutAction(name: string, from: string) {
  return attempt(async () => {
    const user = await editor();
    const pg = await database();
    const source = isBuiltinLayout(from) ? undefined : await getLayout(pg, from);
    const id = await createLayout(pg, name, source?.markup ?? starterLayout(from), user.login);
    done();
    return id;
  });
}

export async function saveLayoutAction(id: string, name: string, markup: string) {
  return attempt(async () => {
    const user = await editor();
    await saveLayout(await database(), id, { name, markup }, user.login);
    done();
  });
}

/** [markup]'s problems as a page layout, said in the reader's language, without saving it. */
export async function checkLayoutAction(markup: string) {
  return attempt(async (lang) => {
    await editor();
    return sayAll(await layoutProblems(await database(), markup), lang);
  });
}

export async function deleteLayoutAction(id: string) {
  return attempt(async () => {
    const user = await editor();
    await deleteLayout(await database(), id, user.login);
    done();
  });
}

/** A new block of [type] on no page yet (the explorer's 新建区块), yours. */
export async function createComponentAction(type: string, name: string) {
  return attempt(async () => {
    const user = await editor();
    const id = await createComponent(await database(), type, name, user.login);
    done();
    return id;
  });
}

/** A new template of [type], a copy of [copyOf]'s markup or the type's starter, yours. */
export async function createTemplateAction(type: string, name: string, copyOf?: string) {
  return attempt(async () => {
    const user = await editor();
    const pg = await database();
    const source = copyOf ? await getTemplate(pg, copyOf) : undefined;
    const id = await createTemplate(
      pg,
      type,
      name,
      source && source.type === type ? source.markup : starterTemplate(fieldsOf(type)),
      user.login,
    );
    done();
    return id;
  });
}

export async function saveTemplateAction(id: string, name: string, markup: string) {
  return attempt(async () => {
    const user = await editor();
    await saveTemplate(await database(), id, { name, markup }, user.login);
    done();
  });
}

/** [markup]'s problems as a template of [type], said in the reader's language, without saving it. */
export async function checkTemplateAction(type: string, markup: string) {
  return attempt(async (lang) => {
    await editor();
    return sayAll(await templateProblems(await database(), type, markup), lang);
  });
}

export async function deleteTemplateAction(id: string) {
  return attempt(async () => {
    const user = await editor();
    await deleteTemplate(await database(), id, user.login);
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

/** 拿取, or with [over] 接手 (taking a file someone else has); a built-in template's code, 超级管理员 alone. */
export async function takeAction(items: Item[], over = false) {
  return attempt(async () => {
    const user = items.some((i) => i.kind === "code") ? await coder() : await editor();
    await take(await database(), items, user.login, over);
    done();
  });
}

/**
 * 上传 a built-in template's code (S6, 超级管理员; the owner: 「if file never taken by others, it should be automatically
 * replaced」): the same file (<type>.tsx), checked first; taken when nobody has it (the code's latest taken in before),
 * then laid out and saved as its working copy. Another's, or one in the workflow, is refused.
 */
export async function uploadCodeAction(id: string, fileName: string, source: string) {
  return attempt(async () => {
    const user = await coder();
    if (fileName !== `${id}.tsx`)
      throw new CmsError("errors.codeFileName", { file: `${id}.tsx`, got: fileName });
    const problems = codeProblems(id, source);
    if (problems.length) throw new CmsError("errors.codeProblems", undefined, problems);
    const pg = await database();
    if ((await fileState(pg, "code", id))?.status === "available") {
      await addCodeFiles(pg);
      await take(pg, [{ kind: "code", id }], user.login);
    }
    await saveCode(pg, id, source, user.login);
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

/** The CMS's own preview built again when built-in templates came into the workflow or left it (it shows them). */
const rebuildFor = (items: Item[]) => items.some((i) => i.kind === "code") && startCmsSiteBuild(true);

export async function checkInAction(items: Item[], message: string) {
  return attempt(async () => {
    const user = await editor();
    const id = await checkIn(await database(), items, message, user.login);
    rebuildFor(items);
    done();
    return id;
  });
}

/** 终止: back to whoever checked them in. */
export async function terminateAction(items: Item[]) {
  return attempt(async () => {
    await editor();
    await terminate(await database(), items);
    rebuildFor(items);
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
