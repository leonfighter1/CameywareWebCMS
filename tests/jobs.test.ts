import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { freshDb } from "@/lib/db";
import { fileState, take } from "@/lib/files";
import { jobsFromCheckins } from "@/lib/job-migration";
import {
  addToJob,
  approveJob,
  bell,
  cancelSchedule,
  createJob,
  getJob,
  jobBack,
  jobEvents,
  jobItems,
  jobPage,
  jobToPreview,
  markSeen,
  publishJob,
  rejectJob,
  removeFromJob,
  runDue,
  SCHEDULER,
  splitJob,
  submitJob,
  terminateJob,
} from "@/lib/jobs";
import { siteRepo } from "@/lib/paths";
import { seedIfEmpty } from "@/lib/seed";
import { buildContent, createComponent, listPages, saveComponent, savePage, saveText } from "@/lib/store";
import { checkIn, files, toPreview } from "@/lib/workflow";
import type { SiteContent } from "@/generated/model";

const site = JSON.parse(readFileSync(join(siteRepo(), "content", "site.json"), "utf8")) as SiteContent;
const hero = site.pages.find((p) => p.path === "/")!.blocks[0]!;
const heroItem = [{ kind: "component" as const, id: hero.id }];
const texts = [{ kind: "bundle" as const, id: "nav" }];
const titleOf = (c: SiteContent) =>
  (c.pages.find((p) => p.path === "/")!.blocks[0]!.data.title as { zh: string }).zh;
/** A deployment that builds nothing and pushes nothing. */
const built = async () => {};
const lee = { login: "lee", publisher: false };
const kim = { login: "kim", publisher: false };
const admin = { login: "admin", publisher: true };
let pg: PGlite;

/** lee holds the hero banner, retitled, and the nav's words, changed. */
async function leeEdits(title = "任务里的标题") {
  await take(pg, [...heroItem, ...texts], "lee");
  await saveComponent(pg, hero.id, { data: { ...hero.data, title: { zh: title } } }, "lee");
  await saveText(pg, "nav.signIn", { zh: "登入吧", en: "Sign in" }, "lee");
}

/** Job [id] built into preview, submitted by lee and approved. */
async function toApproved(id: number) {
  await (
    await jobToPreview(pg, id, lee, "", built)
  ).done;
  await submitJob(pg, id, lee);
  await approveJob(pg, id, admin);
}

beforeEach(async () => {
  pg = await freshDb();
  await seedIfEmpty(pg);
});

// The owner, 2026-11-16: 「workflow可以有多个 … 每个添加的file不同 … workflow必须实例化，可以把自己checkoutfile都新建
// 不同的workflow ticket去deploy」.
describe("workflow jobs", () => {
  it("makes jobs of your checked-out files, each with its own files, moving on alone", async () => {
    await leeEdits();
    await expect(createJob(pg, { name: " " }, heroItem, "lee")).rejects.toThrow(/任务名/);
    const first = await createJob(pg, { ticket: "webfl-5930", name: "首页 batch 1" }, heroItem, "lee");
    const second = await createJob(pg, { name: "登录的字" }, texts, "lee");
    expect([first, second]).toEqual([1, 2]);
    expect(await getJob(pg, first)).toMatchObject({
      ticket: "webfl-5930",
      step: "progress",
      author: "lee",
      files: 1,
    });
    expect((await getJob(pg, second))!.ticket).toBe("");
    expect(await jobItems(pg, second)).toEqual(texts);
    expect((await files(pg)).find((f) => f.id === hero.id)!.job).toMatchObject({
      id: first,
      name: "首页 batch 1",
    });
    // Checked in: locked, as before.
    await expect(saveComponent(pg, hero.id, { name: "x" }, "lee")).rejects.toThrow(/锁定/);

    await (
      await jobToPreview(pg, first, lee, "", built)
    ).done;
    expect((await getJob(pg, first))!.step).toBe("preview");
    expect((await fileState(pg, "component", hero.id))!.stage).toBe("preview");
    expect((await getJob(pg, second))!.step).toBe("progress");
    expect((await fileState(pg, "bundle", "nav"))!.stage).toBe("checked_in");
    expect(titleOf(await buildContent(pg, "preview"))).toBe("任务里的标题");
    expect(
      (await jobPage(pg, { page: 1, size: 20, step: "open", q: "webfl" })).rows.map((j) => j.id),
    ).toEqual([first]);
    expect((await jobPage(pg, { page: 1, size: 20, author: "kim" })).total).toBe(0);
  });

  it("adds to a job, removes from it, splits it, terminates it", async () => {
    await leeEdits();
    const id = await createJob(pg, { name: "两样" }, heroItem, "lee");
    // Only files you hold go in.
    await expect(addToJob(pg, id, texts, kim)).rejects.toThrow(/不在你名下/);
    await addToJob(pg, id, texts, lee);
    expect((await getJob(pg, id))!.files).toBe(2);
    await removeFromJob(pg, id, texts, lee);
    expect(await fileState(pg, "bundle", "nav")).toMatchObject({ status: "checked_out", owner: "lee" });
    expect(await jobItems(pg, id)).toEqual(heroItem);
    await addToJob(pg, id, texts, lee);
    await expect(splitJob(pg, id, [...heroItem, ...texts], { name: "全部" }, lee)).rejects.toThrow(/全部/);
    const split = await splitJob(pg, id, texts, { name: "字" }, lee);
    expect(await getJob(pg, split)).toMatchObject({ step: "progress", author: "lee", files: 1 });
    expect(await jobItems(pg, id)).toEqual(heroItem);
    await terminateJob(pg, split, lee);
    expect((await getJob(pg, split))!.step).toBe("terminated");
    expect(await fileState(pg, "bundle", "nav")).toMatchObject({ status: "checked_out", owner: "lee" });
    // What it held stays its record.
    expect(await jobItems(pg, split)).toEqual(texts);
    expect((await jobEvents(pg, id)).map((e) => e.action)).toEqual([
      "split",
      "added",
      "removed",
      "added",
      "created",
    ]);
  });

  // The owner: 「可以添加到已有的workflow也可以添加到别人的workflow里 … 第三个tab是添加到其他人的workflow」.
  it("takes someone else's files into your job; they stay theirs and go back to them", async () => {
    await leeEdits();
    const id = await createJob(pg, { name: "lee 的任务" }, heroItem, "lee");
    const contact = site.pages.find((p) => p.path === "/contact/")!.blocks[0]!;
    const kims = [{ kind: "component" as const, id: contact.id }];
    await take(pg, kims, "kim");
    await addToJob(pg, id, kims, kim);
    expect(await getJob(pg, id)).toMatchObject({ author: "lee", files: 2 });
    expect(await fileState(pg, "component", contact.id)).toMatchObject({
      status: "in_workflow",
      owner: "kim",
    });
    expect((await jobEvents(pg, id))[0]).toMatchObject({ action: "added", by: "kim" });
    await removeFromJob(pg, id, kims, lee);
    expect(await fileState(pg, "component", contact.id)).toMatchObject({
      status: "checked_out",
      owner: "kim",
    });
  });

  // The owner (Bell's Remove selected from Job): 「也可以移除workflow」.
  it("removes files from a job on preview once preview is built without them", async () => {
    await leeEdits("留在预览站的标题");
    const id = await createJob(pg, { name: "两样" }, [...heroItem, ...texts], "lee");
    await (
      await jobToPreview(pg, id, lee, "", built)
    ).done;
    expect((await buildContent(pg, "preview")).texts["nav.signIn"]!.zh).toBe("登入吧");
    await expect(removeFromJob(pg, id, [...heroItem, ...texts], lee, built)).rejects.toThrow(/全部文件/);
    const r = await removeFromJob(pg, id, texts, lee, built);
    await r.done;
    expect(await fileState(pg, "bundle", "nav")).toMatchObject({
      status: "checked_out",
      owner: "lee",
      stage: null,
    });
    expect(await getJob(pg, id)).toMatchObject({ step: "preview", files: 1 });
    expect((await buildContent(pg, "preview")).texts["nav.signIn"]!.zh).toBe("登录");
    expect(titleOf(await buildContent(pg, "preview"))).toBe("留在预览站的标题");
  });

  // The owner: 「可以让网站编辑提交、管理员批准后发布」 (approval: 「可以」).
  it("is submitted by its author, approved or sent back by 管理员 alone, then published", async () => {
    await leeEdits("要审批的标题");
    const id = await createJob(pg, { name: "首页" }, heroItem, "lee");
    await expect(submitJob(pg, id, lee)).rejects.toThrow(/不在这一步/);
    await (
      await jobToPreview(pg, id, lee, "", built)
    ).done;
    await expect(submitJob(pg, id, kim)).rejects.toThrow(/lee/);
    await submitJob(pg, id, lee, "请看首页");
    await expect(approveJob(pg, id, lee)).rejects.toThrow(/管理员/);
    expect((await bell(pg, "admin", true)).approvals.map((a) => a.id)).toEqual([id]);
    expect((await bell(pg, "lee", false)).approvals).toEqual([]);

    await rejectJob(pg, id, admin, "标题太长");
    expect(await getJob(pg, id)).toMatchObject({ step: "preview", approver: "admin" });
    const news = await bell(pg, "lee", false);
    expect(news.news[0]).toMatchObject({ action: "rejected", note: "标题太长", by: "admin", unread: true });
    expect(news.unread).toBe(1);
    await markSeen(pg, "lee");
    expect((await bell(pg, "lee", false)).unread).toBe(0);

    await submitJob(pg, id, lee);
    await approveJob(pg, id, admin);
    expect((await bell(pg, "lee", false)).news[0]).toMatchObject({ action: "approved", unread: true });
    await expect(publishJob(pg, id, lee, { runner: built })).rejects.toThrow(/管理员/);
    await (
      await publishJob(pg, id, admin, { runner: built })
    ).done;
    expect((await getJob(pg, id))!.step).toBe("done");
    expect(titleOf(await buildContent(pg, "production"))).toBe("要审批的标题");
    expect(await fileState(pg, "component", hero.id)).toMatchObject({ status: "available", owner: null });
    expect(await jobItems(pg, id)).toEqual(heroItem);
  });

  // The owner: a time for production 「可以设置也可以跳过」; the ticket 「可以不填」.
  it("is published at its time by the CMS, or not once the time is cancelled", async () => {
    await leeEdits("定时的标题");
    const id = await createJob(pg, { name: "定时" }, heroItem, "lee");
    await toApproved(id);
    await expect(publishJob(pg, id, admin, { at: new Date(Date.now() + 10_000) })).rejects.toThrow(/以后/);
    const at = new Date(Date.now() + 3_600_000);
    await publishJob(pg, id, admin, { at });
    expect(await getJob(pg, id)).toMatchObject({ step: "scheduled" });
    await cancelSchedule(pg, id, admin);
    expect(await getJob(pg, id)).toMatchObject({ step: "approved", scheduled_at: null });
    await publishJob(pg, id, admin, { at });
    expect(await runDue(pg, new Date())).toEqual([]);
    const started = await runDue(pg, new Date(at.getTime() + 60_000), built);
    expect(started.map((s) => s.id)).toEqual([id]);
    await started[0]!.done;
    expect((await getJob(pg, id))!.step).toBe("done");
    expect(titleOf(await buildContent(pg, "production"))).toBe("定时的标题");
    expect((await bell(pg, "admin", true)).news[0]).toMatchObject({ action: "published", by: SCHEDULER });
  });

  it("stays where it was when a build fails, and says so; goes back to 进行中 from preview", async () => {
    await leeEdits();
    const id = await createJob(pg, { name: "会失败" }, heroItem, "lee");
    await (
      await jobToPreview(pg, id, lee, "", async () => {
        throw new Error("build failed");
      })
    ).done;
    expect((await getJob(pg, id))!.step).toBe("progress");
    expect((await jobEvents(pg, id))[0]).toMatchObject({ action: "failed", note: "preview" });
    await toApproved(id);
    await (
      await jobBack(pg, id, lee, built)
    ).done;
    expect(await getJob(pg, id)).toMatchObject({ step: "progress", approver: null });
    expect((await fileState(pg, "component", hero.id))!.stage).toBe("checked_in");
  });

  it("takes a page's new block along, out of the job that held it", async () => {
    const page = (await listPages(pg)).find((p) => p.path === "/contact/")!;
    const pageItem = [{ kind: "page" as const, id: page.id }];
    const block = await createComponent(pg, "freeform", "地图", "lee", { html: { zh: "<b>地图</b>" } });
    const blockJob = await createJob(pg, { name: "地图" }, [{ kind: "component", id: block }], "lee");
    await take(pg, pageItem, "lee");
    await savePage(pg, page.id, { blocks: [...page.blocks, { id: block, zone: "main" }] }, "lee");
    const pageJob = await createJob(pg, { name: "联系页" }, pageItem, "lee");
    const r = await jobToPreview(pg, pageJob, lee, "", built);
    expect(r.items).toBe(2);
    await r.done;
    expect(await jobItems(pg, pageJob)).toHaveLength(2);
    expect(await jobItems(pg, blockJob)).toEqual([]);
    expect((await jobEvents(pg, blockJob))[0]).toMatchObject({
      action: "gave",
      note: `#${pageJob} ${block}`,
    });
  });

  it("carries the workflow of before over: one job per check-in and step", async () => {
    await leeEdits();
    await checkIn(pg, heroItem, "首页标题", "lee");
    await checkIn(pg, texts, "登录的字", "lee");
    await (
      await toPreview(pg, texts, "lee", "", built)
    ).done;
    await pg.transaction((tx) => jobsFromCheckins(tx));
    expect(await getJob(pg, 1)).toMatchObject({
      name: "首页标题",
      step: "progress",
      author: "lee",
      files: 1,
    });
    expect(await getJob(pg, 2)).toMatchObject({ name: "登录的字", step: "preview", files: 1 });
    expect(await jobItems(pg, 2)).toEqual(texts);
  });
});
