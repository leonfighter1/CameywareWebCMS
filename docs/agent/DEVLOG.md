# Dev log: Cameyware Web CMS

Newest first. One entry per working session, key points only.

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
