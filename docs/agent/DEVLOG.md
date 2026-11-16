# Dev log: Cameyware Web CMS

Newest first. One entry per working session, key points only.

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
