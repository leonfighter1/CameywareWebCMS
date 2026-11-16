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

1. **The website stays the only renderer.** A block type is a view in the website (`src/cms/views.tsx`) and an entry in
   its catalog (`cms/types.json`); this CMS only edits and checks data of that shape. A new type: the website first, then
   `npm run sync` here. A template (组件样式, S3) is data too: markup the website's `src/cms/template.ts` defines and its
   `template-view.tsx` draws; this CMS checks it with that file's `checkTemplate`, never a grammar of its own. A page
   layout (S4) likewise: the built-ins and their zones are the website's `src/cms/layouts.ts`; a CMS layout is template
   markup with `Zone` elements (`checkTemplate(…, { layout: true })`). A page's blocks are placements `{id, zone, style?}`
   (`src/lib/pages.ts`): the style belongs to the place on the page, never to the component.
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
   blocks, styles and CMS layout along at every step (`newPartsOf`, `withTheirParts`). Production is each
   file's `prod_revision_id`; preview is production with the files at 预览站; the CMS's 已签入 is production with every
   workflow file. A step that builds moves its files only once the build succeeded (deploy()'s onSuccess). 推到正式站
   commits `content/site.json` alone on top of GitHub's main, from a temporary worktree, and pushes it (C2): a
   developer's commits not pushed yet never go out with it. Its git steps are tested against a bare repository
   (`tests/publish.test.ts`), never against GitHub; an agent never pushes content to production (the owner's click).
6. **freeform runs sandboxed** (C3): the website's view puts it in an iframe without same-origin. Never render a
   freeform's HTML into the page itself. rich_text is sanitised here (catalog allowlist) and again by the website's
   build.
7. **Every check of content is the catalog's** (`src/lib/catalog.ts` `check`): saves, uploads (JSON and XML) and page
   paths go through it; an upload is all or nothing.
8. **Secrets only in `.env`** (git-ignored). The preview key is made at each start (`scripts/start.ts`).
9. **Two languages, one home each:** the CMS's words are `messages/zh.json` and `messages/en.json` (same keys, enforced
   by `tests/messages.test.ts`; pages through next-intl, typed from zh.json); what the server says is a key with values
   (`msg`, `CmsError` in `src/lib/words.ts`), never a sentence in code; a catalog name's English is its `label_en` in
   the website's `cms/types.json`.

## Map

- `src/lib`: the database (`db.ts`), the catalog's check, the working copy (`store.ts`, templates and layouts included),
  placements and migration 4's page upgrade (`pages.ts`), files'
  states (`files.ts`), resource bundles (`bundles.ts`, migration 3's merge), the workflow's steps and versions
  (`workflow.ts`), releases, environments and deployments (`releases.ts`), deploying (`deploy.ts`), download and upload
  (`transfer.ts`), sign-in (`auth.ts`), the first content (`seed.ts`), the two languages (`words.ts`), what pages hand
  their client parts (`present.ts`), JSON compared (`json.ts`)
- `src/app`: the explorer (`page.tsx`, `explorer.tsx`: the tree, each folder's files, who is doing what), the editors
  (pages: Bell's page editor with the palette, rows, the place dialog, the style browser and Metadata; components,
  templates and each type's built-in one, layouts and the built-in ones, globals, bundles), 我的文件 (`mine`), 工作流
  (`workflow`); `actions.ts` every change (server actions); routes for sign-in, the preview's live content and downloads
- `src/components`: the shell, the fields' form, a file's state and its bar (`files.tsx`), a list of files
  (`file-table.tsx`)
- `scripts`: `start.ts` (both servers), `preview-server.ts` (cms-preview), `build-site.ts`, `sync.mjs`
- `tests`: Vitest on an in-memory database seeded from the website
