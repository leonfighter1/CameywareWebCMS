import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { canEdit, canPublish, redeem } from "@/lib/auth";
import { check, checkBlock, fieldsOf } from "@/lib/catalog";
import { freshDb } from "@/lib/db";
import { deploy } from "@/lib/deploy";
import { toHant } from "@/lib/hant";
import { siteRepo } from "@/lib/paths";
import { addCodeTexts, seedIfEmpty } from "@/lib/seed";
import {
  buildContent,
  changes,
  CmsError,
  createComponent,
  discard,
  getComponent,
  listPages,
  saveComponent,
  savePage,
  saveText,
} from "@/lib/store";
import { exportDoc, fromXml, importDoc, parseUpload, toXml } from "@/lib/transfer";
import { checkIn, createRelease, deployments, diff, environments, releaseContent } from "@/lib/workflow";
import type { SiteContent } from "@/generated/model";

const site = JSON.parse(readFileSync(join(siteRepo(), "content", "site.json"), "utf8")) as SiteContent;
let pg: PGlite;

beforeEach(async () => {
  pg = await freshDb();
  await seedIfEmpty(pg);
});

describe("the first start", () => {
  it("takes the website as it is, checked in, as release 1 on preview and production", async () => {
    const pages = await listPages(pg);
    expect(pages.map((p) => p.path).sort()).toEqual(site.pages.map((p) => p.path).sort());
    expect(await changes(pg)).toEqual([]);
    const envs = await environments(pg);
    expect([envs.preview.release, envs.production.release]).toEqual([1, 1]);
    const built = await buildContent(pg, "checked_in");
    for (const p of site.pages) {
      const b = built.pages.find((x) => x.path === p.path)!;
      expect(
        b.blocks.map((x) => x.id),
        p.path,
      ).toEqual(p.blocks.map((x) => x.id));
      expect(
        b.blocks.map((x) => x.data),
        p.path,
      ).toEqual(p.blocks.map((x) => x.data));
    }
    expect(built.globals).toEqual(site.globals);
    // Every UI text of the code, in the four languages.
    expect(built.texts["nav.signIn"]).toEqual({
      zh: "登录",
      "zh-hant": "登入",
      en: "Sign in",
      fr: "Se connecter",
    });
    expect(built.texts["app.homeBazi"]?.["zh-hant"]).toBe("八字排盤");
    expect(await seedIfEmpty(pg)).toBe(false);
    expect(await addCodeTexts(pg)).toEqual([]);
  });
});

describe("the catalog's check", () => {
  it("cleans what it can and names what is wrong", () => {
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
    expect(bad.errors.join("\n")).toMatch(/title：简体必须填写/);
    expect(bad.errors.join("\n")).toMatch(/不是网址/);
    expect(bad.errors.join("\n")).toMatch(/不在可选的值里/);
    expect(bad.errors.join("\n")).toMatch(/colour：没有这个字段/);
    expect(checkBlock("nothing", {}).errors).toEqual(["没有「nothing」这种区块类型"]);
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

describe("drafts, check-ins and releases", () => {
  it("a saved block is a draft: the preview's drafts show it, what is checked in doesn't, until it is", async () => {
    const hero = site.pages.find((p) => p.path === "/")!.blocks[0]!;
    await saveComponent(
      pg,
      hero.id,
      { data: { ...hero.data, title: { ...(hero.data.title as object), zh: "新的标题" } } },
      "editor",
    );
    expect(await changes(pg)).toEqual([
      { kind: "component", id: hero.id, label: expect.stringContaining("横幅"), change: "changed" },
    ]);
    const draft = await buildContent(pg, "draft");
    const done = await buildContent(pg, "checked_in");
    const title = (c: SiteContent) =>
      (c.pages.find((p) => p.path === "/")!.blocks[0]!.data.title as { zh: string }).zh;
    expect([title(draft), title(done)]).toEqual(["新的标题", "把好想法，做成每天都好用的软件"]);
    await discard(pg, "component", hero.id, "editor");
    expect(await changes(pg)).toEqual([]);
    await saveComponent(pg, hero.id, { data: { ...hero.data, title: { zh: "又一个" } } }, "editor");
    await checkIn(pg, [{ kind: "component", id: hero.id }], "首页标题", "editor");
    expect(title(await buildContent(pg, "checked_in"))).toBe("又一个");
    await expect(checkIn(pg, [{ kind: "component", id: hero.id }], " ", "editor")).rejects.toThrow(CmsError);
  });

  it("checks a page in with the new blocks on it; a release leaves inactive pages out", async () => {
    const page = (await listPages(pg)).find((p) => p.path === "/contact/")!;
    const id = await createComponent(pg, "freeform", "地图", "editor", { html: { zh: "<b>地图</b>" } });
    await savePage(pg, page.id, { blocks: [...page.blocks, id] }, "editor");
    await checkIn(pg, [{ kind: "page", id: page.id }], "联系页加地图", "editor");
    expect(await changes(pg)).toEqual([]);
    const live = await buildContent(pg, "checked_in");
    expect(live.pages.find((p) => p.path === "/contact/")!.blocks.at(-1)!.type).toBe("freeform");
    await savePage(pg, page.id, { status: "inactive" }, "editor");
    await checkIn(pg, [{ kind: "page", id: page.id }], "联系页先停用", "editor");
    const release = await releaseContent(pg, await createRelease(pg, "editor"));
    expect(release.pages.map((p) => p.path)).not.toContain("/contact/");
    expect((await buildContent(pg, "checked_in")).pages.map((p) => p.path)).toContain("/contact/");
  });

  it("refuses a page at an address the code or another page has", async () => {
    const page = (await listPages(pg)).find((p) => p.path === "/contact/")!;
    await expect(savePage(pg, page.id, { path: "/account/" }, "editor")).rejects.toThrow(CmsError);
    await expect(savePage(pg, page.id, { path: "/works/" }, "editor")).rejects.toMatchObject({
      details: [expect.stringMatching(/已经有页面/)],
    });
    await expect(saveText(pg, "not a key", { zh: "x" }, "editor")).rejects.toThrow(CmsError);
  });
});

describe("releases", () => {
  it("are numbered one after the last, and one just made differs from what is checked in in nothing", async () => {
    const release = await createRelease(pg, "admin");
    expect(release).toBe(2);
    expect(await diff(pg, release, "checked_in")).toEqual([]);
    expect(await diff(pg, 1, release)).toEqual([]);
    const hero = site.pages.find((p) => p.path === "/")!.blocks[0]!;
    await saveComponent(pg, hero.id, { data: { ...hero.data, eyebrow: { zh: "新眉题" } } }, "editor");
    await checkIn(pg, [{ kind: "component", id: hero.id }], "眉题", "editor");
    expect(await diff(pg, release, "checked_in")).toEqual([
      { what: "区块 首页横幅（/）", change: "changed" },
    ]);
  });
});

describe("deployments", () => {
  it("send a release out one at a time, and record a failure with its reason", async () => {
    const release = await createRelease(pg, "admin");
    let finish!: () => void;
    const first = await deploy("preview", release, "admin", (log) => {
      log("building…");
      return new Promise<void>((r) => (finish = r));
    });
    await expect(deploy("preview", release, "admin", async () => {})).rejects.toThrow(/正在部署/);
    finish();
    await first.done;
    expect((await environments(pg)).preview.release).toBe(release);
    const failed = await deploy("production", release, "admin", async () => {
      throw new Error("git push failed");
    });
    await failed.done;
    const [last] = await deployments(pg);
    expect([last!.status, last!.log]).toEqual(["failed", expect.stringContaining("git push failed")]);
    expect((await environments(pg)).production.release).toBe(1);
  });
});

describe("download and upload", () => {
  it("gives back what it took, in JSON and in XML", async () => {
    const doc = await exportDoc(pg, "site");
    for (const text of [JSON.stringify(doc), toXml(doc)]) {
      const plan = await importDoc(pg, parseUpload(text), "editor", false);
      expect(
        plan.items.filter((i) => i.action !== "unchanged"),
        text.slice(0, 20),
      ).toEqual([]);
    }
  });

  it("makes a new page at a new address, its blocks copied, inactive until someone looks", async () => {
    const page = (await listPages(pg)).find((p) => p.path === "/contact/")!;
    const doc = await exportDoc(pg, "page", page.id);
    if (doc.kind !== "page") throw new Error("not a page");
    const xml = toXml({ ...doc, page: { ...doc.page, id: undefined, path: "/contact-copy/" } });
    const plan = await importDoc(pg, fromXml(xml), "editor", true);
    expect(plan.items.find((i) => i.kind === "page")!.action).toBe("create");
    const made = (await listPages(pg)).find((p) => p.path === "/contact-copy/")!;
    expect(made.status).toBe("inactive");
    expect(made.blocks).toHaveLength(page.blocks.length);
    expect(made.blocks.some((b) => page.blocks.includes(b))).toBe(false);
    expect((await getComponent(pg, made.blocks[0]!))!.type).toBe("page_title");
  });

  it("refuses an upload with any part the catalog doesn't take, and changes nothing", async () => {
    const before = await buildContent(pg, "draft");
    const bad = {
      cms: 1,
      kind: "component",
      component: { id: "x-1", type: "hero_banner", data: { title: "" } },
    };
    await expect(importDoc(pg, parseUpload(JSON.stringify(bad)), "editor", true)).rejects.toThrow(
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

  it("refuses a role that may not edit content, and still ends the console session", async () => {
    const { fake, calls } = api("manager", ["view", "assign"]);
    await expect(redeem("code", fake)).rejects.toThrow(/不能修改网站内容/);
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
