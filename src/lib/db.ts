/**
 * The CMS's own database (the owner, 2026-11-15: 「我们需要添加一个新的Folder和新的database专门去updatewebsite」): PGlite
 * (PostgreSQL in WebAssembly) in data/cms, apart from 禄命秘解's. One instance per process: the CMS's Next server owns it,
 * and its preview server asks it over HTTP. The SQL is plain PostgreSQL, so a managed database can take it later.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";

export type Db = PGlite | Transaction;

/**
 * Pages, components, globals and texts are the working copy (what the editors save: the drafts); revisions are what was
 * checked in, one row per item per check-in; a release is the whole site as checked in at a moment, frozen; an
 * environment (preview, production) names the release it shows.
 */
const MIGRATIONS = [
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
];

async function migrate(db: PGlite) {
  await db.exec(`create table if not exists schema_version (version int not null)`);
  const { rows } = await db.query<{ version: number }>(`select version from schema_version`);
  const at = rows[0]?.version ?? 0;
  for (let v = at; v < MIGRATIONS.length; v++) {
    await db.transaction(async (tx) => {
      await tx.exec(MIGRATIONS[v]!);
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
