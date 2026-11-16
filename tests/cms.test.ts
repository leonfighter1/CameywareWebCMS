import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { canEdit, canPublish, redeem } from "@/lib/auth";
import { check, checkBlock, fieldsOf } from "@/lib/catalog";
import { freshDb, MIGRATIONS } from "@/lib/db";
import { deploy } from "@/lib/deploy";
import { fileState, fileStates, putBack, take } from "@/lib/files";
import { toHant } from "@/lib/hant";
import { siteRepo } from "@/lib/paths";
import { deployments, diff, environments, readLog, releaseContent } from "@/lib/releases";
import { addCodeTexts, seedIfEmpty } from "@/lib/seed";
import {
  buildContent,
  changes,
  createComponent,
  getComponent,
  listPages,
  saveComponent,
  savePage,
  saveText,
} from "@/lib/store";
import { exportDoc, fromXml, importDoc, parseUpload, toXml } from "@/lib/transfer";
import {
  backToCheckIn,
  checkIn,
  discard,
  restoreVersion,
  rollbackProduction,
  terminate,
  toPreview,
  toProduction,
  versions,
} from "@/lib/workflow";
import { CmsError, say, sayAll } from "@/lib/words";
import type { SiteContent } from "@/generated/model";

const site = JSON.parse(readFileSync(join(siteRepo(), "content", "site.json"), "utf8")) as SiteContent;
const hero = site.pages.find((p) => p.path === "/")!.blocks[0]!;
const HERO_TITLE = "把好想法，做成每天都好用的软件";
const heroItem = [{ kind: "component" as const, id: hero.id }];
const titleOf = (c: SiteContent) =>
  (c.pages.find((p) => p.path === "/")!.blocks[0]!.data.title as { zh: string }).zh;
/** A deployment that builds nothing and pushes nothing: the workflow's steps alone. */
const built = async () => {};
let pg: PGlite;

/** [by] takes the hero banner and gives it [title]. */
async function retitle(by: string, title: string) {
  await take(pg, heroItem, by);
  await saveComponent(pg, hero.id, { data: { ...hero.data, title: { zh: title } } }, by);
}

beforeEach(async () => {
  pg = await freshDb();
  await seedIfEmpty(pg);
});

describe("the first start", () => {
  it("takes the website as it is, as production's version of every file, nobody's, release 1 everywhere", async () => {
    const pages = await listPages(pg);
    expect(pages.map((p) => p.path).sort()).toEqual(site.pages.map((p) => p.path).sort());
    expect(await changes(pg)).toEqual([]);
    const envs = await environments(pg);
    expect([envs.preview.release, envs.production.release]).toEqual([1, 1]);
    const states = [...(await fileStates(pg)).values()];
    expect(states.every((f) => f.status === "available" && f.prod_revision_id)).toBe(true);
    const production = await buildContent(pg, "production");
    for (const p of site.pages) {
      const b = production.pages.find((x) => x.path === p.path)!;
      expect(
        b.blocks.map((x) => x.id),
        p.path,
      ).toEqual(p.blocks.map((x) => x.id));
      expect(
        b.blocks.map((x) => x.data),
        p.path,
      ).toEqual(p.blocks.map((x) => x.data));
    }
    expect(production.globals).toEqual(site.globals);
    // Every UI text of the code, in the four languages.
    expect(production.texts["nav.signIn"]).toEqual({
      zh: "登录",
      "zh-hant": "登入",
      en: "Sign in",
      fr: "Se connecter",
    });
    expect(production.texts["app.homeBazi"]?.["zh-hant"]).toBe("八字排盤");
    expect((await deployments(pg)).map((d) => [d.env, d.action, d.status])).toEqual([
      ["production", "seed", "done"],
      ["preview", "seed", "done"],
    ]);
    expect(await seedIfEmpty(pg)).toBe(false);
    expect(await addCodeTexts(pg)).toEqual([]);
  });

  it("migrates a v1 database: what was checked in is production's, a draft never checked in its editor's", async () => {
    const old = new PGlite();
    await old.exec(MIGRATIONS[0]!);
    await old.exec(`insert into checkins (id, message, author, items) values (1, 'm', 'a', '[]');
      insert into pages (id, path, updated_by) values ('p1', '/a/', 'lee'), ('p2', '/b/', 'kim');
      insert into revisions (kind, entity_id, data, checkin_id, author) values ('page', 'p1', '{}', 1, 'lee');`);
    await old.exec(MIGRATIONS[1]!);
    const rows = (
      await old.query<{ id: string; status: string; owner: string | null; prod: number | null }>(
        `select id, status, owner, prod_revision_id as prod from items order by id`,
      )
    ).rows;
    expect(rows.map((r) => [r.id, r.status, r.owner, r.prod === null ? null : Number(r.prod)])).toEqual([
      ["p1", "available", null, 1],
      ["p2", "checked_out", "kim", null],
    ]);
  });
});

describe("the catalog's check", () => {
  it("cleans what it can and names what is wrong, in either language", () => {
    const ok = checkBlock("hero_banner", {
      title: "标题",
      buttons: [{ label: { zh: "去", en: "Go" }, href: "/works/", style: "filled" }],
    });
    expect(ok.errors).toEqual([]);
    expect(ok.value.title).toEqual({ zh: "标题" });
    expect(ok.value.space_before).toBe("auto");
    const bad = checkBlock("hero_banner", {
      buttons: [{ href: "javascript:alert(1)", style: "loud" }],
      colour: "red",
    });
    const zh = sayAll(bad.errors, "zh").join("\n");
    expect(zh).toMatch(/title：简体必须填写/);
    expect(zh).toMatch(/不是网址/);
    expect(zh).toMatch(/不在可选的值里/);
    expect(zh).toMatch(/colour：没有这个字段/);
    expect(sayAll(bad.errors, "en").join("\n")).toMatch(/colour: no such field/);
    expect(sayAll(checkBlock("nothing", {}).errors, "zh")).toEqual(["没有「nothing」这种区块类型"]);
  });

  it("takes the scripts out of rich text, never out of freeform", () => {
    const rich = checkBlock("rich_text", {
      html: {
        zh: '<p onclick="x()">好<script>alert(1)</script></p><span data-when="server">只在服务器</span>',
      },
    });
    expect(rich.value.html).toEqual({ zh: '<p>好</p><span data-when="server">只在服务器</span>' });
    const free = checkBlock("freeform", { html: { zh: "<script>console.log(1)</script>" } });
    expect(free.value.html).toEqual({ zh: "<script>console.log(1)</script>" });
    expect(check({ x: "true" }, [{ name: "x", label: "x", kind: "boolean" }]).value.x).toBe(true);
    expect(fieldsOf("accordion").map((f) => f.name)).toContain("anchor");
  });
});

describe("files: take, take over, put back, discard", () => {
  it("only the one who took a file saves it; another may take it over", async () => {
    await expect(saveComponent(pg, hero.id, { name: "x" }, "lee")).rejects.toThrow(/还没拿取/);
    await retitle("lee", "李的标题");
    await expect(saveComponent(pg, hero.id, { name: "x" }, "kim")).rejects.toThrow(/在 lee 名下/);
    await expect(take(pg, heroItem, "kim")).rejects.toMatchObject({
      details: [expect.objectContaining({ key: "errors.othersFile" })],
    });
    await take(pg, heroItem, "kim", true);
    expect((await fileState(pg, "component", hero.id))!.owner).toBe("kim");
    await expect(saveComponent(pg, hero.id, { name: "x" }, "lee")).rejects.toThrow(CmsError);
    // A draft is the CMS preview's under 草稿 alone.
    expect(titleOf(await buildContent(pg, "draft"))).toBe("李的标题");
    expect(titleOf(await buildContent(pg, "workflow"))).toBe(HERO_TITLE);
  });

  it("put back keeps the changes for the next one; discard goes back to production's version", async () => {
    await retitle("lee", "放回的标题");
    await putBack(pg, heroItem, "lee");
    expect((await fileState(pg, "component", hero.id))!.status).toBe("available");
    expect(titleOf(await buildContent(pg, "draft"))).toBe("放回的标题");
    expect((await changes(pg)).map((c) => [c.id, c.change])).toEqual([[hero.id, "changed"]]);
    await take(pg, heroItem, "kim");
    await expect(discard(pg, heroItem, "lee")).rejects.toThrow(CmsError);
    await discard(pg, heroItem, "kim");
    expect(titleOf(await buildContent(pg, "draft"))).toBe(HERO_TITLE);
    expect(await changes(pg)).toEqual([]);
    expect((await fileState(pg, "component", hero.id))!.status).toBe("available");
  });

  it("a new block is its maker's; discarded, it goes, unless a page of theirs still shows it", async () => {
    const page = (await listPages(pg)).find((p) => p.path === "/contact/")!;
    const id = await createComponent(pg, "freeform", "地图", "lee", { html: { zh: "<b>地图</b>" } });
    expect((await fileState(pg, "component", id))!).toMatchObject({ status: "checked_out", owner: "lee" });
    await take(pg, [{ kind: "page", id: page.id }], "lee");
    await savePage(pg, page.id, { blocks: [...page.blocks, id] }, "lee");
    await expect(discard(pg, [{ kind: "component", id }], "lee")).rejects.toThrow(/还在页面上用着/);
    await discard(
      pg,
      [
        { kind: "component", id },
        { kind: "page", id: page.id },
      ],
      "lee",
    );
    expect(await getComponent(pg, id)).toBeUndefined();
    expect(await fileState(pg, "component", id)).toBeUndefined();
    expect(await changes(pg)).toEqual([]);
  });
});

describe("the workflow", () => {
  it("checks in only files you hold; checked in, a file is locked; terminated, it is the submitter's again", async () => {
    await expect(checkIn(pg, heroItem, "首页标题", "lee")).rejects.toThrow(CmsError);
    await retitle("lee", "签入的标题");
    await expect(checkIn(pg, heroItem, " ", "lee")).rejects.toThrow(/签入说明/);
    await checkIn(pg, heroItem, "首页标题", "lee");
    expect(await fileState(pg, "component", hero.id)).toMatchObject({
      status: "in_workflow",
      stage: "checked_in",
      owner: "lee",
    });
    await expect(saveComponent(pg, hero.id, { name: "x" }, "lee")).rejects.toThrow(/锁定/);
    await expect(take(pg, heroItem, "kim", true)).rejects.toThrow(CmsError);
    // The CMS's 已签入 shows it; preview and production don't.
    expect(titleOf(await buildContent(pg, "workflow"))).toBe("签入的标题");
    expect(titleOf(await buildContent(pg, "preview"))).toBe(HERO_TITLE);
    await terminate(pg, heroItem);
    expect(await fileState(pg, "component", hero.id)).toMatchObject({
      status: "checked_out",
      owner: "lee",
      stage: null,
    });
    expect(titleOf(await buildContent(pg, "draft"))).toBe("签入的标题");
    expect(titleOf(await buildContent(pg, "workflow"))).toBe(HERO_TITLE);
  });

  it("goes to preview once built, back to check-in, then to production alone with what was picked", async () => {
    await retitle("lee", "预览站的标题");
    await checkIn(pg, heroItem, "首页标题", "lee");
    const texts = [{ kind: "text" as const, id: "nav.signIn" }];
    await take(pg, texts, "kim");
    await saveText(pg, "nav.signIn", { zh: "登入吧", en: "Sign in" }, "kim");
    await checkIn(pg, texts, "登录的字", "kim");

    // A failed build moves nothing.
    const failed = await toPreview(pg, heroItem, "lee", "", async () => {
      throw new Error("build failed");
    });
    await failed.done;
    expect((await fileState(pg, "component", hero.id))!.stage).toBe("checked_in");
    expect(readLog((await deployments(pg))[0]!.log, "zh")).toMatch(/失败：build failed/);

    await (
      await toPreview(pg, [...heroItem, ...texts], "lee", "两样", built)
    ).done;
    expect((await fileState(pg, "component", hero.id))!.stage).toBe("preview");
    const preview = await buildContent(pg, "preview");
    expect([titleOf(preview), preview.texts["nav.signIn"]!.zh]).toEqual(["预览站的标题", "登入吧"]);
    expect((await environments(pg)).preview.release).toBe(3);

    await (
      await backToCheckIn(pg, texts, "lee", built)
    ).done;
    expect((await fileState(pg, "text", "nav.signIn"))!.stage).toBe("checked_in");
    expect((await buildContent(pg, "preview")).texts["nav.signIn"]!.zh).toBe("登录");

    await expect(toProduction(pg, texts, "admin", "", built)).rejects.toMatchObject({
      details: [expect.objectContaining({ key: "errors.notOnPreview" })],
    });
    const prod = await toProduction(pg, heroItem, "admin", "首页标题", built);
    await prod.done;
    expect(await fileState(pg, "component", hero.id)).toMatchObject({
      status: "available",
      owner: null,
      stage: null,
    });
    const production = await buildContent(pg, "production");
    expect([titleOf(production), production.texts["nav.signIn"]!.zh]).toEqual(["预览站的标题", "登录"]);
    expect((await releaseContent(pg, prod.release)).texts["nav.signIn"]!.zh).toBe("登录");
    expect(await changes(pg)).toEqual([expect.objectContaining({ id: "nav.signIn", change: "changed" })]);
  });

  it("takes a page's new blocks along at each step; a release never shows a page without one", async () => {
    const page = (await listPages(pg)).find((p) => p.path === "/contact/")!;
    const pageItem = [{ kind: "page" as const, id: page.id }];
    const id = await createComponent(pg, "freeform", "地图", "lee", { html: { zh: "<b>地图</b>" } });
    await take(pg, pageItem, "lee");
    await savePage(pg, page.id, { blocks: [...page.blocks, id] }, "lee");
    await checkIn(pg, pageItem, "联系页加地图", "lee");
    expect((await fileState(pg, "component", id))!.stage).toBe("checked_in");
    const r = await toPreview(pg, pageItem, "lee", "", built);
    expect(r.items).toHaveLength(2);
    await r.done;
    // The block alone back to check-in would leave the page on preview without it.
    await expect(backToCheckIn(pg, [{ kind: "component", id }], "lee", built)).rejects.toMatchObject({
      details: [expect.objectContaining({ key: "errors.blockMissingAt" })],
    });
    await (
      await toProduction(pg, pageItem, "admin", "", built)
    ).done;
    expect(
      (await buildContent(pg, "production")).pages.find((p) => p.path === "/contact/")!.blocks.at(-1)!.type,
    ).toBe("freeform");
  });

  it("a page made inactive leaves the releases, not the CMS's preview", async () => {
    const page = (await listPages(pg)).find((p) => p.path === "/contact/")!;
    const pageItem = [{ kind: "page" as const, id: page.id }];
    await take(pg, pageItem, "lee");
    await savePage(pg, page.id, { status: "inactive" }, "lee");
    await checkIn(pg, pageItem, "联系页先停用", "lee");
    const r = await toPreview(pg, pageItem, "lee", "", built);
    await r.done;
    expect((await releaseContent(pg, r.release)).pages.map((p) => p.path)).not.toContain("/contact/");
    expect((await buildContent(pg, "workflow")).pages.map((p) => p.path)).toContain("/contact/");
  });

  it("sends one deployment at a time to each site", async () => {
    await retitle("lee", "一次一个");
    await checkIn(pg, heroItem, "首页标题", "lee");
    let finish!: () => void;
    const first = await toPreview(pg, heroItem, "lee", "", () => new Promise<void>((r) => (finish = r)));
    await expect(terminate(pg, heroItem)).rejects.toMatchObject({
      details: [expect.objectContaining({ key: "errors.fileBusy" })],
    });
    await expect(
      deploy("preview", first.release, "lee", { action: "rebuild", runner: built }),
    ).rejects.toThrow(/预览站正在部署/);
    finish();
    await first.done;
    expect((await deployments(pg))[0]).toMatchObject({ status: "done", action: "preview", items: heroItem });
  });
});

describe("versions", () => {
  it("lists a file's versions with production's marked, and restores one as a draft", async () => {
    await retitle("lee", "第二版");
    await checkIn(pg, heroItem, "第二版", "lee");
    await (
      await toPreview(pg, heroItem, "lee", "", built)
    ).done;
    await (
      await toProduction(pg, heroItem, "admin", "", built)
    ).done;
    const list = await versions(pg, "component", hero.id);
    expect(list.map((v) => [v.message, v.production, v.current])).toEqual([
      ["第二版", true, true],
      ["初始内容：从官网的 content/site.json 和 messages 导入", false, false],
    ]);
    expect(list[1]!.published).toEqual([1]);
    await expect(restoreVersion(pg, "component", hero.id, list[1]!.id, "lee")).rejects.toThrow(/还没拿取/);
    await take(pg, heroItem, "lee");
    expect(await restoreVersion(pg, "component", hero.id, list[1]!.id, "lee")).toEqual([]);
    expect(titleOf(await buildContent(pg, "draft"))).toBe(HERO_TITLE);
  });

  it("takes production back to a release it showed, its files' versions with it, and builds preview again", async () => {
    await retitle("lee", "要回滚的标题");
    await checkIn(pg, heroItem, "要回滚", "lee");
    await (
      await toPreview(pg, heroItem, "lee", "", built)
    ).done;
    await (
      await toProduction(pg, heroItem, "admin", "", built)
    ).done;
    expect(titleOf(await buildContent(pg, "production"))).toBe("要回滚的标题");
    await expect(rollbackProduction(pg, 2, "admin", built)).rejects.toThrow(/没上过正式站/);
    await (
      await rollbackProduction(pg, 1, "admin", built)
    ).done;
    expect((await environments(pg)).production.release).toBe(1);
    expect(titleOf(await buildContent(pg, "production"))).toBe(HERO_TITLE);
    // Nobody had it: its draft follows production.
    expect(titleOf(await buildContent(pg, "draft"))).toBe(HERO_TITLE);
    expect(await changes(pg)).toEqual([]);
    expect((await deployments(pg))[0]).toMatchObject({ env: "preview", action: "rebuild", status: "done" });
    expect(await diff(pg, 1, "production")).toEqual([]);
  });
});

describe("download and upload", () => {
  it("gives back what it took, in JSON and in XML", async () => {
    const doc = await exportDoc(pg, "site");
    for (const text of [JSON.stringify(doc), toXml(doc)]) {
      const plan = await importDoc(pg, parseUpload(text), "lee", false);
      expect(
        plan.items.filter((i) => i.action !== "unchanged"),
        text.slice(0, 20),
      ).toEqual([]);
    }
  });

  it("takes the files it changes when nobody has them, and refuses one someone else has", async () => {
    const doc = {
      cms: 1,
      kind: "component",
      component: { id: hero.id, type: "hero_banner", data: { ...hero.data, title: { zh: "上传的" } } },
    };
    const plan = await importDoc(pg, parseUpload(JSON.stringify(doc)), "lee", false);
    expect(plan.items).toEqual([expect.objectContaining({ action: "update", take: true })]);
    await take(pg, heroItem, "kim");
    await expect(importDoc(pg, parseUpload(JSON.stringify(doc)), "lee", true)).rejects.toMatchObject({
      details: [expect.objectContaining({ key: "errors.importOthers" })],
    });
    await putBack(pg, heroItem, "kim");
    await importDoc(pg, parseUpload(JSON.stringify(doc)), "lee", true);
    expect(await fileState(pg, "component", hero.id)).toMatchObject({ status: "checked_out", owner: "lee" });
    expect(titleOf(await buildContent(pg, "draft"))).toBe("上传的");
  });

  it("makes a new page at a new address, its blocks copied, inactive and its uploader's", async () => {
    const page = (await listPages(pg)).find((p) => p.path === "/contact/")!;
    const doc = await exportDoc(pg, "page", page.id);
    if (doc.kind !== "page") throw new Error("not a page");
    const xml = toXml({ ...doc, page: { ...doc.page, id: undefined, path: "/contact-copy/" } });
    const plan = await importDoc(pg, fromXml(xml), "lee", true);
    expect(plan.items.find((i) => i.kind === "page")!.action).toBe("create");
    const made = (await listPages(pg)).find((p) => p.path === "/contact-copy/")!;
    expect(made.status).toBe("inactive");
    expect(made.blocks).toHaveLength(page.blocks.length);
    expect(made.blocks.some((b) => page.blocks.includes(b))).toBe(false);
    expect((await getComponent(pg, made.blocks[0]!))!.type).toBe("page_title");
    expect((await fileState(pg, "page", made.id))!.owner).toBe("lee");
  });

  it("refuses an upload with any part the catalog doesn't take, and changes nothing", async () => {
    const before = await buildContent(pg, "draft");
    const bad = {
      cms: 1,
      kind: "component",
      component: { id: "x-1", type: "hero_banner", data: { title: "" } },
    };
    await expect(importDoc(pg, parseUpload(JSON.stringify(bad)), "lee", true)).rejects.toThrow(
      /没有通过检查/,
    );
    expect(() => fromXml('<!DOCTYPE x [<!ENTITY a "b">]><cms kind="texts"/>')).toThrow(/DOCTYPE/);
    expect(() => parseUpload('{"a":1}')).toThrow(/不是 CMS/);
    expect((await buildContent(pg, "draft")).pages).toEqual(before.pages);
  });
});

describe("signing in", () => {
  const api = (role: string, can: string[]) => {
    const calls: string[] = [];
    const fake = (async (url: string) => {
      calls.push(String(url).replace(/^http:\/\/[^/]+/, ""));
      if (String(url).endsWith("/v1/auth/handoff"))
        return Response.json({ access_token: "a", refresh_token: "r" });
      if (String(url).endsWith("/v1/admin/me")) return Response.json({ id: "u1", login: "lee", role, can });
      return new Response(null, { status: 204 });
    }) as typeof fetch;
    return { fake, calls };
  };

  it("takes the role from the API and ends that console session at once", async () => {
    const { fake, calls } = api("editor", ["messages", "content"]);
    expect(await redeem("code", fake)).toEqual({ userId: "u1", login: "lee", role: "editor" });
    expect(calls).toEqual(["/v1/auth/handoff", "/v1/admin/me", "/v1/auth/logout"]);
    expect([canEdit("editor"), canPublish("editor"), canPublish("admin"), canEdit("manager")]).toEqual([
      true,
      false,
      true,
      false,
    ]);
  });

  it("refuses a role that may not edit content, in either language, and still ends the console session", async () => {
    const { fake, calls } = api("manager", ["view", "assign"]);
    const e = await redeem("code", fake).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(CmsError);
    expect(say((e as CmsError).msg, "zh")).toBe("你的角色（经理）不能修改网站内容");
    expect(say((e as CmsError).msg, "en")).toBe("Your role (Manager) can't change the website's content");
    expect(calls.at(-1)).toBe("/v1/auth/logout");
  });
});

describe("繁體 from 简体", () => {
  it("writes as the app's zh_Hant does", () => {
    expect(toHant("注销账号")).toBe("刪除帳號");
    expect(toHant("邮箱和用户协议")).toBe("電子郵件和用戶協議");
    expect(toHant("“我的账号”")).toBe("「我的帳號」");
    expect(toHant("30 天后自动删除")).toBe("30 天後自動刪除");
    expect(toHant("未来我们会持续扩展")).toBe("未來我們會持續擴展");
  });
});
