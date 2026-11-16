# Cameyware Web CMS: tech plan

The content management system for the company website (www.cameyware.com, the repository `C:\Cameyware`). Open work
lives here as stages (S1, S2, …) of work packages (WP); the status table is at the end.

## The owner's request (2026-11-15)

> 进行一次重大更新，主要目的是为了创建一个CMS 系统去update当前的官方网站。
>
> 1. 需要有一个CMS domain专门负责更改页面（以后的每次更改就不再需要通过code push）目前就叫做 cms.preview.cameyware.com
>    打开这个可以看到页面上所有的eidt
> 2. 将页面的每一个部分的内容，除了后台读进来的，只要是静态的都要存放在数据库的相应的表中，表可以通过上传相应的JSON 或者XML 去更改
>    数据，也可以下载下来去更改。
> 3. 当前cms.preview.cameyware.com 会把每一个部分的模块上添加一个Edit, 通过这个edit link 会跳转到相应的UI 去更改内容。比如hero
>    banner
> 4. 给不同的view设置不同的type， 比如herobanner， 有专门的herobanner view 去渲染，比如accordion 还有 freeform的style 通常
>    freeform的style可以放置任何html 包括script也可以
> 5. 还要有个CMS central page， 可以查看已有的所有page， 比如https://cms-edit.preview.cameyware.com, 这个类似于一个file
>    system可以查看所有的active page 和inactive page， 还可以查看不同的component， 比如herobanner
> 6. 可以通过download and upload 去上传并且新建一个新的url of page
> 7. 多语言支持, 翻译已有文档，添加繁体中文和法语作为支持。
> 8. 添加一个workflow deployment process, 比如通过checkin 一些component或者page可以push到 cms.preview.cameyware.com，
>    然后还可以再push到preview.cameyware.com ， 最后可以直接push到production
> 9. 我们需要添加一个新的Folder和新的database专门去updatewebsite
> 10. 如果需要有些准备工作，比如准备tunnel 还有别的什么的，请告知。

Then: 「我已经新建了一个新的repo https://github.com/leonfighter1/CameywareWebCMS」.

**Decisions (the owner, 2026-11-15, asked before the work began):**

| #   | Question                                 | Decision                                                                                                                                                                                       |
| --- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | The two addresses                        | One level below the domain, so Cloudflare's free certificate covers them: `cms-preview.cameyware.com` (the site with Edit) and `cms-edit.cameyware.com` (the central page and editors)         |
| C2  | How 推到正式站 reaches www.cameyware.com | The CMS writes the release into the website repository (`content/site.json`), commits that file alone and pushes; Cloudflare Pages builds it. No new key                                       |
| C3  | freeform's scripts                       | In a sandboxed frame (`<iframe sandbox="allow-scripts …">` without same-origin): scripts run, but never reach the site's sign-in or the rest of the page; the frame takes its content's height |
| C4  | Who signs in                             | The company's staff accounts (人员与权限 in 禄命秘解's 管理后台): roles with `content` (网站编辑, 管理员, 超级管理员) edit, check in and push to preview; 管理员 and up push to production     |

## How it fits together

```
 editors ──► cms-edit.cameyware.com  (this repository: Next.js, port 8790)
                │  central page, editors per type, check-in, releases, import / export
                │  PGlite database in data/ (its own; not 禄命秘解's)
                ▼
            cms-preview.cameyware.com (port 8791): the website built in CMS mode, content live from the CMS,
                │  an Edit button on every block; 已签入 by default, 草稿 on a switch
                ▼  推到预览站: a release (every checked-in item) → the website built with it
            preview.cameyware.com (禄命秘解's server, as now)
                ▼  推到正式站: the same release → C:\Cameyware\content\site.json, committed and pushed
            www.cameyware.com (Cloudflare Pages builds main, as now)
```

- **The website stays the only renderer.** Each type (hero banner, accordion, freeform, …) is a view in the website
  (`src/cms/views`), described in its catalog (`cms/types.json`): the fields the CMS shows and checks. The CMS reads the
  catalog through its `npm run sync`.
- **What the website builds from:** a content snapshot, `CMS_CONTENT` or else `content/site.json` (production's, written
  by the CMS, never by hand). Pages, their blocks, the globals (company, header, footer, works, meta) and every UI text,
  in four languages. Texts missing from it come from `messages/*.json`, so code that adds a text still builds.
- **What stays code:** what the API reads in (the account centre's data, the services' on/off), the behaviour (sign-in,
  forms), the views themselves. Their words are UI texts, and editable.
- **Languages:** 简体 (`/zh/`), 繁體 (`/zh-hant/`, Taiwan usage as the app's), English (`/en/`), Français (`/fr/`).

## S1 The CMS, the website on it, four languages (big: CMS v1.0.0, website v2.0.0)

| WP   | What                                                                                                                                                                                                                  |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WP1  | This repository: Next.js + Mantine (the website's libraries), PGlite in `data/`, migrations, CLAUDE.md, records; ports and addresses in 禄命秘解's `config/addresses.json`                                            |
| WP2  | The content model: pages (path, active / inactive, title, description, blocks), components (a type and its data), globals, UI texts; revisions, check-ins, releases, environments, deployments                        |
| WP3  | The website: the catalog and a view per type; every public page from the snapshot (`[locale]/[...slug]`), the header and footer from the globals, the texts merged in; the first snapshot made from the site as it is |
| WP4  | Four languages on the website: routing, the switch, 繁體 (OpenCC, Taiwan phrases, then read) and French for every text and page                                                                                       |
| WP5  | Sign-in: 我的账号 → 网站内容管理 (staff) → a one-time code → the CMS reads the role from `/v1/admin/me`                                                                                                               |
| WP6  | The central page (cms-edit): pages as folders, active and inactive; components by type; globals; texts; each with its editor (a form from the catalog, four languages side by side, a live preview)                   |
| WP7  | cms-preview: the website in CMS mode, live content, an Edit button on every block, the header and the footer, 已签入 / 草稿                                                                                           |
| WP8  | Download and upload, JSON and XML: a page (a new path makes a new page), a component, the texts, everything; checked against the catalog, shown as a diff before it applies                                           |
| WP9  | The workflow: save (draft) → 签入 (chosen items, a message) → cms-preview → 推到预览站 (a release, built) → 推到正式站 (committed, pushed); history, rollback to any release                                          |
| WP10 | Checks: unit tests of the model, the XML round trip, the workflow and the roles; the website's tests on the snapshot and in four languages; the harness on both                                                       |

## S2 Check-out, locks, the workflow's steps, versions, the CMS in English (big: CMS v2.0.0)

**The owner (2026-11-15), on the 发布 page (a screenshot with the space under 推到预览站 and 推到正式站 circled):**

> 添加version tracker 同时还能rollback。 同时file 必须要先checkout之后才能update， 每个file有 没有被touch的情况，这样editor可以
> 进行拿取操作，一旦拿取，file/component就进入checkout 状态，此时如果另一个人想要拿回去可以直接take over， 但是一旦当文件进入
> 签入(added to workflow)状态，file就被lock住了。此时文件就无法被拿取。只有文件被checkout的情况下可以add into workflow. 还有图中，
> 我们可以添加一个退回签入step, 在签入的step我们也可以添加terminate workflow的功能。 用户可以查看当下哪些文件在他们的名下，然后可以
> 多个文件一同签入，当然也可以移除相关文件。文件还可以被discard, discard后的文件自动退回上一个 pushed to prod的版本。 preview 版本只
> 留在cms preview 和preview中。

Then: 「给CMS网站同时添加一个英文语言。」

**Decisions (asked first):** W1 终止工作流 at the check-in step: back to the one who checked it in, checked out, the
changes kept. W2 退回签入 at the preview step: back to the check-in step, still locked; preview is built again without
it. W3 移除 in 我的文件: put back (not checked out), the changes kept; 丢弃 is another button (back to production's
version). W4 versions: each file's own (rolling one back = that version as a draft, then the workflow), and the whole
site's production too (straight back to a release pushed before, for emergencies).

**The model:** every page, block, global and UI text is a file with a state: 未拿取 (anyone may take it), 拿取 (one
person's; only they edit; another may take it over), 工作流 (checked in: locked, at 已签入 or 预览站). Production holds
each file's version pushed last; preview shows production plus the files at 预览站; cms-preview shows production plus the
workflow's files (已签入) or every draft (草稿).

| WP   | What                                                                                                                                                     |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WP11 | Files' states and owners (migration 2), every save checked against them; take, take over, put back, discard (to production's version)                    |
| WP12 | The workflow's steps: check in (several files, a message), terminate, push to preview, back to check-in, push to production; selected files at each step |
| WP13 | Versions: each file's history (its production version marked) and rollback to any; the whole site's production rolled back to a release                  |
| WP14 | 我的文件 (mine, to check in, put back or discard together); the central page, editors and texts show each file's state                                   |
| WP15 | The CMS in English and Chinese (next-intl, a switch); the catalog's labels in English; cms-preview's bar in the page's language                          |

## Status

| WP   | Status                                       | Version                |
| ---- | -------------------------------------------- | ---------------------- |
| WP1  | done                                         | v1.0.0                 |
| WP2  | done                                         | v1.0.0                 |
| WP3  | done                                         | website v2.0.0         |
| WP4  | done (French to be read by a French speaker) | website v2.0.0         |
| WP5  | done                                         | v1.0.0, website v2.0.0 |
| WP6  | done                                         | v1.0.0                 |
| WP7  | done                                         | v1.0.0, website v2.0.0 |
| WP8  | done                                         | v1.0.0                 |
| WP9  | done                                         | v1.0.0                 |
| WP10 | done                                         | v1.0.0, website v2.0.0 |
| WP11 | done                                         | v2.0.0                 |
| WP12 | done                                         | v2.0.0                 |
| WP13 | done                                         | v2.0.0                 |
| WP14 | done                                         | v2.0.0                 |
| WP15 | done                                         | v2.0.0, website v2.0.1 |

## 阶段总结 S2 (v2.0.0, 2026-11-15)

1. **Delivered:** WP11 file states (migration 2, `files.ts`; every save checked; take, take over, put back; new files
   their maker's; uploads take what nobody has and refuse the rest). WP12 the steps (`workflow.ts`): check-in of your
   files, terminate (W1), push to preview, back to check-in (W2), push to production of the files picked alone, each
   moving its files only once its build succeeded; a page's new blocks go along. WP13 versions: each file's check-ins
   with production's and the workflow's marked and the releases it was published in; restore as a draft; production
   back to a release it showed (its manifest), preview rebuilt after. WP14 我的文件, 工作流 (replacing 签入 and 发布),
   the state on the central page, the blocks list, the texts table (batch take, check-in, put back) and each editor (a
   bar with the steps; fields read-only unless yours). WP15 the CMS in English and Chinese (next-intl, a switch, server
   messages and logs by key, the catalog's English); the website's CMS bar in the page's language (website v2.0.1).
2. **Numbers:** 27 unit tests (16 before); every route opened in both languages; a browser walk on real preview builds.
3. **Against the plan:** releases, environments and deployments moved to `releases.ts` so the steps can call the
   deployer without a cycle; preview always rebuilds as production plus 预览站 (no more "deploy an old release to
   preview"); production's rollback needs a release with a manifest, so the v1 releases can't be rolled back to (the
   local database was seeded again anyway).
4. **Mistakes:** 7 (an unanchored .gitignore folder hid src/app/deploy: anchor output folders), 8 (stopping npm start
   left the servers on 8790/8791: check the ports).
5. **Next:** the owner's 推到正式站 of the 繁體 fix (now through 工作流's 预览站 column); a French reader; picture upload
   into the CMS (left for later).

**Left for later:** pictures uploaded into the CMS (now an image is a path under the site or a full address); a live
check that a freeform's script runs on the production build; legal documents in French (D5 decided 简体, 繁體 and
English; Quebec is counsel's question).

## Prepared by the owner (C1–C4 decided; the rest when the work is ready to be seen)

1. The tunnel: two public hostnames on the existing tunnel: `cms-preview.cameyware.com` → `http://127.0.0.1:8791`,
   `cms-edit.cameyware.com` → `http://127.0.0.1:8790`.
2. Cloudflare Access: both hostnames in the application that guards preview.cameyware.com (one application, one sign-in
   for both, so the editor's preview frame opens), with the same e-mail list.
3. The GitHub repository: done (leonfighter1/CameywareWebCMS, 2026-11-15).
4. French: written by the agent; a French speaker should read it before production.
