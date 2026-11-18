# Cameyware Web CMS: agent instructions

The content management system of the company website (www.cameyware.com, `C:\Cameyware`). Read this before working in
this repository; the plan is [docs/tech-plan.md](docs/tech-plan.md).

## Skills: use them on every task

Installed in `C:\Users\AgentSkills` (see its README), as in the website's repository.

| When                               | Skill                                                | Command                                                                                                                       |
| ---------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Start of every task                | **mistake-memory**: the rules learned so far         | `powershell -ExecutionPolicy Bypass -File C:\Users\AgentSkills\mistake-memory\scripts\show-rules.ps1 -Project .`              |
| Before writing any new code        | **reuse-first**, and the website's **website** skill | `powershell -ExecutionPolicy Bypass -File C:\Users\AgentSkills\reuse-first\scripts\find-existing.ps1 -Project . -Terms <a,b>` |
| Before saying "done" or committing | **harness-check**: every gate                        | `powershell -ExecutionPolicy Bypass -File C:\Users\AgentSkills\harness-check\scripts\check.ps1 -Project .`                    |
| After fixing any failure           | **mistake-memory**: record it as a rule              | `...\mistake-memory\scripts\add-mistake.ps1 -Project . -Title ... -Symptom ... -Cause ... -Fix ... -Rule ...`                 |

Records: [docs/agent/MISTAKES.md](docs/agent/MISTAKES.md), [docs/agent/DEVLOG.md](docs/agent/DEVLOG.md), [README.md](README.md)
更新记录 (Chinese, what changed only), and the two Claude Docs the website's CLAUDE.md names (开发上线备忘录, 剩余事项).

## Hard rules

1. **The website stays the only renderer.** A block type is a view in the website (`src/cms/views/<type>.tsx`) and an entry in
   its catalog (`cms/types.json`); this CMS only edits and checks data of that shape. A new type: the website first, then
   `npm run sync` here. A template (组件样式, S3) is data too: markup the website's `src/cms/template.ts` defines and its
   `template-view.tsx` draws; this CMS checks it with that file's `checkTemplate`, never a grammar of its own. A page
   layout (S4) likewise: the built-ins and their zones are the website's `src/cms/layouts.ts`; a CMS layout is template
   markup with `Zone` elements (`checkTemplate(…, { layout: true })`). A page's blocks are placements
   `{id, zone, row?, style?}` (`src/lib/pages.ts`): the style belongs to the place on the page, never to the component;
   placements next to each other with one row key stand side by side (the website's `rowsOf`; S5). A row keeps no
   number: every change to rows goes through `src/lib/rows.ts`, never index arithmetic of its own. A type's view is
   its built-in template and a file here too (S6, kind `code`): its working copy is the source, checked by the website's
   `src/cms/code.ts` (`checkViewCode`, synced) and laid out by the website's Prettier before it is saved; only
   超级管理员 take or replace one (`coder()`); the website's main brings its changes in (`addCodeFiles`).
2. **One source for each fact.** `src/generated` comes from `npm run sync` (the website's content model, catalog and
   template markup, the layouts, 禄命秘解's `config/addresses.json`); never edit it by hand. The 繁體 conversion has one home (`src/lib/hant.ts`).
3. **Its own database** (the owner, 2026-11-15): PGlite in `data/` (git-ignored), never 禄命秘解's. One process opens it:
   the Next server. Anything else asks that server over HTTP (the preview server does); a script that opens the
   database refuses while the CMS runs.
4. **Sign-in is the company's** (C4): staff accounts and roles from 禄命秘解's 管理后台 (人员与权限), through the website's
   one-time code. No password, no account here. `content` edits, checks in and pushes to preview; 管理员 and 超级管理员
   push to production.
5. **A file is changed only by whoever checked it out** (S2, the owner, 2026-11-15; since S3 a page, a block, a template,
   a global, or a resource bundle: the UI texts of one namespace, T2; since S4 a layout too): every save goes through
   `mustHold` (`src/lib/files.ts`); a file checked in is locked in the workflow until it leaves it. A page takes its new
   blocks, styles and CMS layout along at every step (`newPartsOf`, `withTheirParts`): its 依赖 (`dependencies`, v9.3.0),
   taken with it when nobody holds them, listed under 在我名下 on 我的文件. Production is each
   file's `prod_revision_id`; preview is production with the files at 预览站; the CMS's 已签入 is production with every
   workflow file. A step that builds moves its files only once the build succeeded (deploy()'s onSuccess). 推到正式站
   commits `content/site.json` alone on top of GitHub's main, from a temporary worktree, and pushes it (C2): a
   developer's commits not pushed yet never go out with it. Its git steps are tested against a bare repository
   (`tests/publish.test.ts`, `tests/code.test.ts`), never against GitHub; an agent never pushes content to production
   (the owner's click). Since S6 every site is built in the CMS's checkout of the website (`src/lib/code.ts`: the
   worktree `.cms-tree`, built with the website's node_modules through `CMS_TURBOPACK_ROOT`, one build at a time):
   preview on the branch `cms-preview` (main and a commit per built-in template the release has otherwise), the CMS's
   preview on main with the workflow's; a release with built-in templates goes to production with `content/site.json`
   in one commit on GitHub's main, linted and built first. A template main (or GitHub) changed since the CMS took it in
   refuses to go on (`codeChanges`); a text the CMS had before is main behind it, never a change. A rollback sends
   content alone. Run vitest from `C:\` (rule 13).
6. **freeform runs in the page itself** (C3 as the owner changed it on 2026-11-17: 「不用iframe， 一定要是什么就是什么」,
   scripts too): the website's view draws its HTML into the page and runs its scripts there, so they can read a signed-in
   visitor's session; only staff write it, and production takes it through 管理员's approval. rich_text is sanitised
   here (catalog allowlist) and again by the website's build.
7. **Every check of content is the catalog's** (`src/lib/catalog.ts` `check`): saves, uploads (JSON and XML) and page
   paths go through it; an upload is all or nothing.
8. **Secrets only in `.env`** (git-ignored). The preview key is made at each start (`scripts/start.ts`).
9. **Two languages, one home each:** the CMS's words are `messages/zh.json` and `messages/en.json` (same keys, enforced
   by `tests/messages.test.ts`; pages through next-intl, typed from zh.json); what the server says is a key with values
   (`msg`, `CmsError` in `src/lib/words.ts`), never a sentence in code; a catalog name's English is its `label_en` in
   the website's `cms/types.json`.

## Map

- `src/lib`: the database (`db.ts`), the catalog's check, the working copy (`store.ts`, templates and layouts included),
  placements and migration 4's page upgrade (`pages.ts`), a page's rows (`rows.ts`), files'
  states (`files.ts`), resource bundles (`bundles.ts`, migration 3's merge), the workflow's file steps and versions
  (`workflow.ts`), files' names in English (`names.ts`), its jobs (`jobs.ts`: a ticket, a name, files, a step, approval, a time, the bell's news;
  `job-migration.ts`), releases, environments and deployments (`releases.ts`), deploying (`deploy.ts`), the built-in
  templates' code and the website's checkout (`code.ts`), git (`git.ts`), download and upload
  (`transfer.ts`), sign-in (`auth.ts`), the first content (`seed.ts`), the two languages (`words.ts`), what pages hand
  their client parts (`present.ts`, with a block's pages: `pageUses`), JSON compared (`json.ts`)
- `src/app`: the explorer (`page.tsx`, `explorer.tsx`: the tree, each folder's files, who is doing what), the editors
  (pages: Bell's page editor with the palette, rows, the place dialog, the style browser and Metadata; components,
  templates and each type's built-in one, layouts and the built-in ones, globals, bundles), 我的文件 (`mine`), 工作流
  (`workflow`: the job manager, a job's steps, the jobs, its files and history, the deployment running now), 部署记录
  (`deployments`: every deployment found, filtered and paged, each one's log, 所有版本 and the rollback); `actions.ts` every change (server actions); routes for
  sign-in, the preview's live content and downloads (`api/export`; a built-in template's code, `api/code`)
- `src/components`: the shell, the fields' form, a file's state and its bar (`files.tsx`), a list of files
  (`file-table.tsx`), `NEW_TAB` (`links.ts`: every link to an editor, a list or a log opens a tab of its own; the
  menu, the tree and 回到文件夹 stay), 用在 N 个页面 and its list (`used-on.tsx`), 预览 at an editor's top
  (`preview.tsx`: saves changes first, opens the draft in a new tab), 加入工作流's dialog (`job-form.tsx`, opened by
  `jobModal`), a list of jobs and a step's badge (`job-table.tsx`), the bell (`bell.tsx`), an upload's plan (`plan.tsx`),
  a page's own download and upload in the page list (`page-transfer.tsx`), a file to copy picked from all there
  are (`file-picker.tsx`)
- `scripts`: `start.ts` (both servers), `preview-server.ts` (cms-preview), `build-site.ts`, `sync.mjs`
- `tests`: Vitest on an in-memory database seeded from the website
