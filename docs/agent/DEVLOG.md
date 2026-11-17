# Dev log: Cameyware Web CMS

Newest first. One entry per working session, key points only.

## 2026-11-16 (o): v9.4.0 (a copied page shares its blocks)

- The owner asked whether a copied page copies its components, then: copy only the page's frame (settings, metadata),
  its rows built from shared blocks, or a 12-row page makes a dozen duplicate files. `copyPage` (store.ts) now keeps the
  placements as they are (deleted blocks left out); takeTheirParts still takes the copy's 依赖 nobody holds. The new-page
  help (explorer.newHelp.page) says so; pages-s9's copy test now checks the same placements and no new block.
- Walked on a copy (4 checks). The owner's old _copy blocks are left for them to discard.

## 2026-11-16 (n): v9.3.1 (停用 pages marked)

- The owner pushed job #4 (/test/) to preview and found nothing at /zh/test/: the push (#430) and a rebuild (#431) were
  fine; /test/ was 停用 (every new page starts so), and 停用 pages stay out of preview and production. Read on the real
  CMS without changing it (rule 16). Now `inactivePage` (store.ts) → FileInfo/FileView.inactive; FileTable's 停用 badge;
  `joinInfoAction` (was dependenciesAction) also names the chosen 停用 pages for 加入工作流's note; the job page's note.
- Mistake 23. Walked on a copy (7 checks; the owner had meanwhile removed /test/ from #4, so a new job was used).

## 2026-11-16 (m): v9.3.0 (a page's dependencies, 依赖)

- The owner couldn't add /test/: its new style was nobody's, and check-in refused it as someone else's with no name.
  `dependencies` (workflow.ts) replaces the walk over a page's new parts with one list (state + the files needing it);
  `takeTheirParts` takes the free ones with a page (takeAction, a copy, an upload); check-in takes free ones along.
- A fourth 相关文件 tab in the dialog was half built, then the owner asked for 依赖 under 在我名下, ticked by default:
  `DependencyTable` (components/dependencies.tsx) with ticks on 我的文件 and two-line rows in 加入工作流;
  `dependencyViews` (present.ts) gives 来自 and 位置; `typeName` (catalog.ts); `takeFiles` (files.tsx) is the one 拿取
  with its message. Walked on a copy (12 checks).
- Mistakes 20–22: a refusal names the file and whose; a tick waits for its refresh; never /dev/stdin to node on Windows.

## 2026-11-16 (l): v9.2.0 (the file to copy picked in a lightbox)

- The owner: 新建页面's copy list doesn't scale. `FilePicker` (search, ten a page, click / double click); the new-file
  dialog shows its starts and 复制已有的…, the pick under it with 换一个; closeOnEscape off while the picker is open.

## 2026-11-16 (k): v9.1.0 (files named in English)

- The owner: page names and files without Chinese, only the content. `names.ts` holds the rule and `nameFiles`, which
  renames blocks (page address + type), styles (type) and layouts and rewrites their versions' names (no file reads as
  changed); migration 9 runs it with `namePages` (now English: the English title, else the address); the seed runs it
  before publishing the first content. store.ts refuses a Chinese name; importDoc keeps a file's own name when an
  old file brings a Chinese one. The real CMS renamed: e.g. contact_page_title, hero_banner_style, Lu_Ming_Mi_Jie.
- Mistake 19: hookTimeout 30 s (seeding in beforeEach under the full suite).

## 2026-11-16 (j): v9.0.0, S9 (page names, a page copied, a page's own file, the history's pages, versions on preview)

- Migration 8: pages.name, made by `namePages` (pages.ts) after every insert (createPage, the seed, writeWorking) from
  `pageNameOf` (title en > zh > address; letters and digits kept, the rest _). The explorer lists a page by its name, the
  address under it; the page editor's title is the name. `copyPage` (store.ts) copies a page's blocks as new files.
- `importPageFile` (transfer.ts) puts a file onto the page of its name through importDoc; `PageTransfer` in the page
  list; `PlanView` shared with 下载与上传, which now says what it does. The export names a page's file by its name
  (filename* for Chinese). 部署记录: `per` (20/50/100) and pages always shown.
- `manifestsOn(env)` replaces productionManifests; versions carry `previewed`.

## 2026-11-16 (i): v8.0.1 (no 404 after discarding a new file that was deleted)

- The owner: a new template deleted and then discarded showed a 404. The file bar left the page only for change "new";
  a new file marked deleted has none. It now leaves when `file.fresh` (no production version: what discard forgets).
  `app/not-found.tsx` gives a missing file the CMS's own page. Mistake 18.

## 2026-11-16 (h): v8.0.0, S8 (preview without a build on each push; the lightbox)

- The owner asked how to avoid the build on each push; offered a live preview or queued builds, they chose both, with a
  lightbox stopping changes while one runs. Website v2.5.0 builds preview live (`NEXT_PUBLIC_CMS=preview`, content from
  `/cms-content.json`). `deploy.ts` toPreview writes only that file when `liveFits` (the key: the website's main + the
  built-in templates' text; every page has a file), else builds live and records `cms-build.json`. The job page's
  lightbox (`job-building`): a Modal no one closes, the deployment's log, the end said by a notification.
- 禄命秘解's npm run all builds the same way. The queue of builds was left out (content no longer builds).

## 2026-11-16 (g): v7.0.0, S7 (workflow jobs, approval, a time, the bell)

- The owner's requests and answers are in docs/tech-plan.md (S7). `jobs.ts` puts jobs on top of workflow.ts's file
  steps: create (checkIn, then job_files from its check-in), add (anyone's job at 进行中; the files stay the adder's),
  remove (terminate at 进行中; at 预览站 a backToCheckIn whose `also` gives them back), split, terminate, preview,
  back, submit, approve, reject, publish now or at a time, cancel; `runDue` for the tick; `claim` moves a page's new
  part into the job that took it along; the bell from job_events (seen per login). Migration 7 makes jobs of the
  check-ins in the workflow (`job-migration.ts`, apart from jobs.ts so db.ts imports nothing of the workflow).
- Screens: the 工作流 page is a job manager (`workflow/jobs.tsx`; board.tsx gone), `job-table.tsx` (also in 我的文件),
  `job-form.tsx` through `jobModal` (was checkInModal: the file bar, the explorer, 我的文件, split), `bell.tsx` in the
  shell with its count (the owner asked mid-way). The old file-by-file workflow actions are gone.
- The walk ran on a copy with its own website clone pushing to a bare repository (rule 16; rule 17: the clone needs its
  own npm ci). The owner's check-ins webfl5019 and webfl1234 became jobs #1 and #2 on the real CMS.

## 2026-11-16 (f): v6.1.0 (the pages that use a block, Save and Preview at the top, the favicon)

- The owner's requests are in docs/tech-plan.md (v6.1.0, after S6). `pageUses` (present.ts) gives a block's pages,
  each place (zone, style), title, state and draft address; `UsedOn` (components/used-on.tsx) is the link and its list:
  in the block's editor (the bottom card is gone), on a shared block's card in the page editor, and as the 用在 column
  of 用共用的. `PreviewButton` (components/preview.tsx) opens a draft in a new tab and saves changes first (a tab
  opened at the click, sent on once saved); the block's and the global's editors have 保存 and 预览 at the top, the
  block's preview frame is gone. `src/app/icon.svg`: the company's mark with a pencil.
- Mistake 15: Mantine 9 closes every open dialog on Esc (a window listener each); the one under another turns
  `closeOnEscape` off meanwhile (组件属性 under 浏览 and 用在, which had the bug too).
- Mistake 16: the first walk ran as admin on the running CMS and left /works/lumingmijie/delete-account/ taken; the
  owner, as the same admin, checked it in with their own file and pushed it to 预览站 (「webfl5019」; nothing of the
  walk's was saved in it). Walks now run on a copy (`CMS_DATA_DIR`, port 8792).
- The owner, at the end: workflow jobs as Bell's Workflow Job Manager (several workflows, each its own files and
  ticket): planned as S7.

## 2026-11-16 (e): v6.0.0, S6 (built-in templates as files, the deployment history, new tabs)

- The owner's requests are in docs/tech-plan.md (S6). Kind `code` (migration 5, `code_files`): a type's built-in
  template, its working copy the source of the website's `src/cms/views/<type>.tsx` (website v2.4.0 split it).
  `addCodeFiles` (seed.ts) takes main's text in at start and on the template's page, for files nobody holds; a text
  the CMS had before is main behind it. `saveCode` checks with the website's `checkViewCode` and lays out with its
  Prettier settings; `uploadCodeAction` takes a free file first; `coder()` (超级管理员) for taking code.
- `src/lib/code.ts`: the worktree `.cms-tree` inside the website (Turbopack's root set by `CMS_TURBOPACK_ROOT` so the
  website's node_modules serve it; without it the build failed: next not found), one use at a time, left on
  `cms-preview`; `codeChanges` (the files that differ from a ref; the code's own change refuses a workflow file);
  `checkout` (branch commits or uncommitted); `lintCode`. deploy.ts builds preview on `cms-preview`, the CMS preview
  on main with the workflow's, production with code through `codeToProduction` (lint, build, one commit, push);
  rollback sends content alone. `git.ts` holds `run`, `git` (moved from deploy.ts) and `gitTexts`.
- The owner, mid-way: 部署记录 with every deployment (search, filters, pages; a page per deployment with its log),
  the 工作流 page with the current deployment alone, 所有版本 moved to the history's second tab; `NEW_TAB` on 16
  links to editors, lists and logs.
- 禄命秘解's `npm run all` builds the preview in `.cms-tree` when it is on `cms-preview`.
- Mistake 13: vitest from a lower-case `c:\` path loads twice ("reading 'config'" at describe): run it from `C:\`.

## 2026-11-16 (d): v5.0.0, S5 (rows of components)

- The owner's request (Bell's page editor: a Row in the palette, rows dragged, two components side by side in a row) is
  in docs/tech-plan.md (S5). A placement has an optional row key (`Placement.row`, the website's `Block.row`): the
  placements next to each other in a zone with one key are a row (the website's `rowsOf`); none is a row alone, so the
  pages need no migration and a row's number is where it stands.
- `src/lib/rows.ts` (pure, for the editor and the server): `rowsIn`, `insertPlacement`, `moveCard`, `moveRow` on a
  `Target` (beside a row's placements, before one of them, or a row of its own before another row; a new empty row's
  key); a row alone gets a key when another joins it; a move that changes nothing gives the list back.
  `placeBlockAction` places through it (a replaced placement keeps its zone and row); `checkPage` and the WebPage upload
  refuse a bad key (`check.badRow`); assemble, seed and the WebPage (`RowId`) carry it.
- The editor: 新的一行 in the palette (an empty row kept in the editor until its first component is saved), rows with a
  bar (drag, up, down, delete with a confirm), components side by side (drag, left, right; dropped on a component's
  right half, after it). What is dragged travels in the drag's data (mistake 11); moves show at once (`useOptimistic`).
- The walk (`cms-s5.cjs`): an empty row, an image (new), a notice beside it (new), the image again (shared), the row
  to the top, a component right, all kept after a reload; side by side on cms-preview at 1440, stacked at 390; all
  discarded. It found its own drag landing on a moved row while a save refreshed the page (mistake 12).
- Checks: 44 unit tests; production untouched (release 5).

## 2026-11-16 (c): v4.0.0, S4 (page layouts, the page editor, a style per placement)

- The owner's request (Bell's Productivity_Tech.xml, then its page editor's screenshots) and L1–L2 are in
  docs/tech-plan.md (S4). Layouts: the website's `src/cms/layouts.ts` (synced as `src/generated/layouts.ts`); here the
  `layouts` table, kind `layout`, `views/layouts` in the explorer with the four built-ins; a CMS layout is markup with
  `Zone` elements (`layoutProblems`), previewed on cms-preview with `?layout=`.
- A page's blocks are placements `{id, zone, style?}` (`src/lib/pages.ts`): the style moved from the component to its
  place on a page. Migration 4 (a step): `layouts`, pages' `layout/breadcrumb/sitemap`, `pagesToLayouts` upgrading every
  page and page revision in place (styleOf from `components.template`, then dropped with `pages.width/spacing`).
  `newPartsOf` takes a page's new components, styles and CMS layout along at every step; a release refuses a page
  without its layout, block or style; a layout in use isn't deleted or discarded.
- The page editor (`pages/[id]/editor.tsx`, Bell's): the palette dragged (HTML5 drag and drop) into a zone's slot opens
  the place dialog (Use Shared / Create New / Copy From Existing, the zone, the style); rows drag or move by arrows
  (`setBlocksAction`); the style browser (by use or name, pages using it); Metadata (常规 / 标题和描述). Download and
  upload: a page is a WebPage (Bell's shape: MetaData, PageLayout, Components by path, zone, index and style path); the
  old embedded page still reads.
- The walk (`cms-s4.cjs`): the routes in zh and en; an image dragged into /contact/ as a new block with a style, the row
  dragged to the top, Use Shared, Metadata, a layout made from 文章 and previewed, all discarded. It found the home
  crumb named by the home page's SEO title (the site's breadcrumb now takes the menu's word) and the cookie banner over
  the layout preview (hidden in an editor's frame, website v2.2.0); and a wait on a Modal's testid (mistake 10).
- Checks: 39 unit tests; the local database copied first (data/cms-v3-2026-11-16), migrated at start; production
  untouched (release 5).

## 2026-11-16 (b): v3.0.1, the layout less crowded

- The owner (a screenshot with the menu and the tree circled): 「做的有点那味了，闲杂重新布局一下，不要把东西都塞到一起，这样
  显得很拥挤」. The pages are tabs in the top bar now (`shell.tsx`; the navbar only behind the burger below md), the user,
  role, production link and sign-out in a user menu; the explorer's tree a sticky 300px column with its own scroll
  (`explorer.tsx`, Flex instead of Grid); 总览's five counts in even cards, the releases and the CMS site in a 网站 card.
- Checks: typecheck, lint, every route in both languages, screenshots at 1440, 1280 and 390 (the 1280 top bar first ran
  off the edge: the production link moved into the user menu below xl).

## 2026-11-16: v3.0.0, S3 (the explorer, component styles, resource bundles)

- The owner's request (Bell's CMS.Net screenshots) and T1–T3 are in docs/tech-plan.md (S3). Templates: the website's
  markup (`src/cms/template.ts`, synced as `src/generated/template.ts`); here the `templates` table, `components.template`,
  kind `template`; `templateProblems` says each problem as `markup.<code>` with tags and code as values (a message holds
  no tag or brace: next-intl reads them). A block brings its new template along at each step (`newPartsOf`,
  `withTheirParts`, the closure of page → blocks → templates); a release refuses a block without its template.
- Bundles (`bundles.ts`): kind `bundle` per namespace; the texts stay a row each, a bundle's state is its texts;
  migration 3 (now a function: MIGRATIONS takes SQL or a step) merged the text files, production's versions and every
  release's manifest (one bundle revision per distinct content), the holder the last one who took a text.
- The explorer replaced the central page, /components and /texts (they redirect); `FileView` has the last change and
  who made it; the editors' bar opens the versions for `?versions=1`.
- Found: a rename through Get-Content | Set-Content garbled workflow.ts (mistake 9, undone by the 1252 round trip);
  the global rules file can't be written from this session's sandbox (the rule went here); docs/agent/MISTAKES.md wasn't
  in the structure show-rules reads, so it loaded no rule (fixed: the Rules list first).
- The first walk found 退回签入 on a block leaving its new template at 预览站: back to check-in and terminate now take
  a file's new parts along too (as the other steps did); tested.
- Checks: 33 unit tests; every route in zh and en signed in, the phone's width; the walk: a template made, broken and
  fixed, previewed, chosen on the hero, checked in with it, on cms-preview and pushed to preview (2 files), back to
  check-in (2 files), terminated, the hero discarded, the template put back (kept as an example, never published). The
  local database was copied first (data/cms-v2-2026-11-16); production untouched (release 5).

## 2026-11-15 (c): v2.0.0, S2 (check-out, locks, the workflow's steps, versions, English)

- The owner's request and W1–W4 are in docs/tech-plan.md (S2). Migration 2: `items` (each file's status, owner, stage,
  its workflow revision and production's), `releases.manifest`, `deployments.action/items`. Production is no longer
  "the last release": it is each file's `prod_revision_id`; preview is production with the files at 预览站; the CMS's
  已签入 is production with every workflow file (`revisionsAt` + `OVERLAYS` in store.ts).
- New homes: `files.ts` (states, take, put back, mustHold on every save), `releases.ts` (releases, environments,
  deployments, logs; moved out of workflow.ts so the steps can call the deployer), `workflow.ts` (check-in, terminate,
  toPreview, backToCheckIn, toProduction, rollbackProduction, rebuildPreview, discard, versions, restoreVersion),
  `words.ts` (Msg keys, CmsError, say), `present.ts`, `labels.ts`; UI `components/files.tsx` (badges, FileBar, versions
  drawer, Editable fieldset), `file-table.tsx`, pages /mine and /workflow (/checkin and /deploy redirect).
- A step that builds moves its files in deploy()'s onSuccess; a failed build leaves them. A running deployment's files
  are busy (refused). A release refuses a page whose block it lacks; a page takes its new blocks along at each step.
- English: next-intl without routing (cms_lang cookie, src/i18n/request.ts, typed keys from zh.json); server messages
  are keys with values (in both languages: catalog labels via label_en from the website's cms/types.json); deployment
  log lines of the CMS's own are stored as keys (§{…}) and read in the reader's language. The website's CMS bar and
  Edit labels follow the page's locale (website v2.0.1).
- Found: v1's src/app/deploy was never committed (.gitignore `deploy/`) → anchored (mistake 7); stopping npm start left
  the servers holding 8790/8791 (mistake 8). fast-xml-parser 5.12.1 for an advisory.
- Checks: 27 unit tests (every message rendered in both languages, English plurals); every route in zh and en signed in (200, no error, the right language); a browser walk of the
  繁體 fix: take, edit, save, check in, push to preview, back to check-in, push again, on real builds (preview shows
  擴展). The local database was set aside (data/cms-v1-2026-11-15) and seeded again; production untouched (release 1).

## 2026-11-15 (b): v1.0.1 and v1.1.0

- v1.0.1: OpenCC writes 扩展 as the IT term 擴充套件; mapped to 擴展 (src/lib/hant.ts). The 首页 lead was fixed in
  the CMS itself (checked in, release 2 pushed to preview); production waits for the owner's click (the agent's push to
  production was refused by the permission check, so it is left to the owner).
- v1.1.0: 推到正式站 refused while the website had commits not pushed, and the push rules keep small website commits
  local: it would have been blocked most of the time. It now publishes from a worktree at origin/main, content alone.
  Its test (a bare repository as GitHub) found spawn with shell: true splitting the commit message: shell only for
  npx.cmd now (mistake 5).

## 2026-11-15: v1.0.0, the CMS

- The owner's request and the decisions C1–C4 are in docs/tech-plan.md. This repository (github leonfighter1/
  CameywareWebCMS, made by the owner) holds the database, the editors, the workflow and the preview server; the website
  keeps the views and the catalog (C:\Cameyware, v2.0.0), shared here by `npm run sync`.
- Stack as the website's (Next.js 16, Mantine 9), a server this time (route handlers, server actions); PGlite in data/
  (one process: the Next server; the preview server asks it over HTTP with a key made at each start).
- Content: pages list block ids (a component may be on several pages); revisions per item per check-in; a release is
  the checked-in site with its active pages; environments preview and production name a release. 推到预览站 builds the
  website with the release (NEXT_DIST_DIR=.cms-build/preview) and swaps it into out/, which 禄命秘解's server serves;
  推到正式站 commits content/site.json alone and pushes, refused when the website's repository is behind GitHub or holds
  code commits not pushed.
- Sign-in by the website's console handoff code; the role from /v1/admin/me (`content` edits; admin and superadmin
  publish); the console session ended at once.
- Upload: JSON or XML, checked against the catalog, all or nothing, a plan first; a page at a new path is a new page,
  inactive, its blocks copied when their ids are used. XML lists by path (a field may be named text or page).
- Walked through in Chrome against the running preview (admin/admin on the dev accounts): sign-in, central page,
  7 Edit buttons on /zh/, the hero edited and checked in, live on cms-preview, pushed to preview (on 8787), rolled back
  to release 1. Found on the way: release numbers jumped (34 after a killed process: the sequence's cached values) →
  max + 1 for releases and check-ins; the diff compared jsonb's key order → canonical JSON; the header's Edit covered
  the sign-in button → centred; four languages in a row too narrow → two.
- Mistakes 1–4 recorded (dangling else, XML lists by name, tsx and CommonJS, Mantine's dotted parts in a server
  component).
