/**
 * The CMS's own database (the owner, 2026-11-15: 「我们需要添加一个新的Folder和新的database专门去updatewebsite」): PGlite
 * (PostgreSQL in WebAssembly) in data/cms, apart from 禄命秘解's. One instance per process: the CMS's Next server owns it,
 * and its preview server asks it over HTTP. The SQL is plain PostgreSQL, so a managed database can take it later.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { bundlesFromTexts } from "./bundles";
import { pagesToLayouts } from "./pages";

export type Db = PGlite | Transaction;

/**
 * Pages, components, templates, globals and texts are the working copy (what the editors save: the drafts; the texts are
 * filed by their bundle); revisions are what was
 * checked in, one row per item per check-in (each file's versions); items, each file's state; a release is the whole
 * site at a moment, frozen; an environment (preview, production) names the release it shows.
 */
export const MIGRATIONS: (string | ((tx: Transaction) => Promise<void>))[] = [
  `create table pages (
     id text primary key,
     path text not null unique,
     status text not null default 'active' check (status in ('active', 'inactive')),
     title jsonb not null default '{}',
     description jsonb not null default '{}',
     width text not null default 'normal',
     spacing text not null default 'compact',
     blocks jsonb not null default '[]',
     deleted boolean not null default false,
     updated_at timestamptz not null default now(),
     updated_by text not null default ''
   );
   create table components (
     id text primary key,
     type text not null,
     name text not null default '',
     data jsonb not null default '{}',
     deleted boolean not null default false,
     updated_at timestamptz not null default now(),
     updated_by text not null default ''
   );
   create table globals (
     key text primary key,
     data jsonb not null,
     updated_at timestamptz not null default now(),
     updated_by text not null default ''
   );
   create table texts (
     key text primary key,
     value jsonb not null,
     updated_at timestamptz not null default now(),
     updated_by text not null default ''
   );
   create table checkins (
     id bigserial primary key,
     message text not null,
     author text not null,
     created_at timestamptz not null default now(),
     items jsonb not null
   );
   create table revisions (
     id bigserial primary key,
     kind text not null check (kind in ('page', 'component', 'global', 'text')),
     entity_id text not null,
     data jsonb,
     deleted boolean not null default false,
     checkin_id bigint not null references checkins (id),
     author text not null,
     created_at timestamptz not null default now()
   );
   create index revisions_latest on revisions (kind, entity_id, id desc);
   create table releases (
     id bigserial primary key,
     author text not null,
     note text not null default '',
     created_at timestamptz not null default now(),
     content jsonb not null
   );
   create table environments (
     name text primary key check (name in ('preview', 'production')),
     release_id bigint references releases (id),
     deployed_at timestamptz,
     deployed_by text
   );
   create table deployments (
     id bigserial primary key,
     env text not null,
     release_id bigint not null references releases (id),
     status text not null check (status in ('running', 'done', 'failed')),
     author text not null,
     started_at timestamptz not null default now(),
     finished_at timestamptz,
     log text not null default ''
   );
   create table sessions (
     id text primary key,
     user_id text not null,
     login text not null,
     role text not null,
     created_at timestamptz not null default now(),
     seen_at timestamptz not null default now()
   );`,
  // S2 (the owner, 2026-11-15: 「file 必须要先checkout之后才能update」): every page, block, global and text is a file with a
  // state. available: nobody's; checked_out: [owner]'s alone to change; in_workflow: checked in by [owner], locked, at
  // [stage] with [revision_id]. [prod_revision_id] is the version production shows (none: never published). A release
  // keeps the version of every file it was made of (its manifest), so production can go back to it; a deployment, what
  // it does to which files.
  `create table items (
     kind text not null check (kind in ('page', 'component', 'global', 'text')),
     id text not null,
     status text not null default 'available' check (status in ('available', 'checked_out', 'in_workflow')),
     owner text,
     since timestamptz not null default now(),
     stage text check (stage in ('checked_in', 'preview')),
     revision_id bigint references revisions (id),
     checkin_id bigint references checkins (id),
     prod_revision_id bigint references revisions (id),
     primary key (kind, id)
   );
   -- What was checked in before is what production was made of: each file's last version, nobody's.
   insert into items (kind, id, status, prod_revision_id)
     select distinct on (kind, entity_id) kind, entity_id, 'available', id
       from revisions order by kind, entity_id, id desc;
   -- A draft never checked in: its last editor's.
   insert into items (kind, id, status, owner)
     select 'page', id, 'checked_out', updated_by from pages
     union all select 'component', id, 'checked_out', updated_by from components
     union all select 'global', key, 'checked_out', updated_by from globals
     union all select 'text', key, 'checked_out', updated_by from texts
   on conflict (kind, id) do nothing;
   alter table releases add column manifest jsonb;
   alter table deployments add column action text not null default 'release';
   alter table deployments add column items jsonb not null default '[]';`,
  // S3 (the owner, 2026-11-16): templates (component styles) are files, a block names the one that draws it; the UI
  // texts are files by their bundle (T2), the text files merged into them (bundles.ts). The texts' old versions stay.
  async (tx: Transaction) => {
    await tx.exec(`
      create table templates (
        id text primary key,
        type text not null,
        name text not null default '',
        markup text not null default '',
        deleted boolean not null default false,
        updated_at timestamptz not null default now(),
        updated_by text not null default ''
      );
      alter table components add column template text;
      alter table revisions drop constraint revisions_kind_check;
      alter table revisions add constraint revisions_kind_check
        check (kind in ('page', 'component', 'global', 'text', 'bundle', 'template'));
      alter table items drop constraint items_kind_check;
      alter table items add constraint items_kind_check
        check (kind in ('page', 'component', 'global', 'text', 'bundle', 'template'));`);
    await bundlesFromTexts(tx);
    await tx.exec(`
      alter table items drop constraint items_kind_check;
      alter table items add constraint items_kind_check
        check (kind in ('page', 'component', 'global', 'bundle', 'template'));`);
  },
  // S4 (the owner, 2026-11-16: page layouts, a page's components in zones, Bell's WebPage): layouts are files (L1); a
  // page has a layout, a breadcrumb and a sitemap switch, and its blocks are placements with their style (L2), the
  // block's template of S3 moved there (pages.ts); the width and the spacing go (every page is as wide).
  async (tx: Transaction) => {
    await tx.exec(`
      create table layouts (
        id text primary key,
        name text not null default '',
        markup text not null default '',
        deleted boolean not null default false,
        updated_at timestamptz not null default now(),
        updated_by text not null default ''
      );
      alter table revisions drop constraint revisions_kind_check;
      alter table revisions add constraint revisions_kind_check
        check (kind in ('page', 'component', 'global', 'text', 'bundle', 'template', 'layout'));
      alter table items drop constraint items_kind_check;
      alter table items add constraint items_kind_check
        check (kind in ('page', 'component', 'global', 'bundle', 'template', 'layout'));
      alter table pages add column layout text not null default 'standard';
      alter table pages add column breadcrumb boolean;
      alter table pages add column sitemap boolean not null default true;`);
    await pagesToLayouts(tx);
    await tx.exec(`
      alter table pages drop column width;
      alter table pages drop column spacing;
      alter table components drop column template;`);
  },
];

async function migrate(db: PGlite) {
  await db.exec(`create table if not exists schema_version (version int not null)`);
  const { rows } = await db.query<{ version: number }>(`select version from schema_version`);
  const at = rows[0]?.version ?? 0;
  for (let v = at; v < MIGRATIONS.length; v++) {
    await db.transaction(async (tx) => {
      const step = MIGRATIONS[v]!;
      if (typeof step === "string") await tx.exec(step);
      else await step(tx);
      await tx.exec(`delete from schema_version`);
      await tx.query(`insert into schema_version values ($1)`, [v + 1]);
    });
  }
}

/** Where the database lives: CMS_DATA_DIR, else data/cms in this repository (git-ignored). */
export const dataDir = () => process.env.CMS_DATA_DIR || join(process.cwd(), "data", "cms");

const holder = globalThis as unknown as { cmsDb?: Promise<PGlite> };

/** The database, opened and migrated once per process (kept across Next's reloads in development). */
export function db(): Promise<PGlite> {
  holder.cmsDb ??= (async () => {
    const dir = dataDir();
    // An in-memory database for tests ("memory://"); else the folder, made first (PGlite needs its parent).
    if (!dir.startsWith("memory://")) mkdirSync(dir, { recursive: true });
    const pg = new PGlite(dir);
    await pg.waitReady;
    await migrate(pg);
    return pg;
  })();
  return holder.cmsDb;
}

/** For tests: a fresh database in memory. */
export async function freshDb(): Promise<PGlite> {
  const pg = new PGlite();
  await pg.waitReady;
  await migrate(pg);
  holder.cmsDb = Promise.resolve(pg);
  return pg;
}
