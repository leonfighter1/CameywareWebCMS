/**
 * Who may use the CMS (C4, the owner, 2026-11-15: the company's staff accounts and their roles, from 人员与权限 in 禄命秘解's
 * 管理后台). A staff member signed in on the website opens 网站内容管理 in 我的账号: the website asks 禄命秘解's API for a
 * one-time code (POST /v1/account/handoff, the 管理后台's kind), the CMS redeems it (POST /v1/auth/handoff), reads the
 * role with that console session (GET /v1/admin/me), ends the console session at once, and keeps a session of its own:
 * a random id in an HttpOnly cookie, 12 hours unused at most. The role with `content` (网站编辑, 管理员, 超级管理员)
 * edits, checks in and pushes to preview; 管理员 and up push to production.
 */
import { randomBytes } from "node:crypto";
import type { Db } from "./db";
import { apiBase } from "./paths";
import { CmsError, msg } from "./words";

export type Role = "editor" | "manager" | "admin" | "superadmin";
export type User = { id: string; userId: string; login: string; role: Role };

export const SESSION_COOKIE = "cms_session";
const IDLE_MS = 12 * 3600_000;

export const canEdit = (role: Role) => role === "editor" || role === "admin" || role === "superadmin";
export const canPublish = (role: Role) => role === "admin" || role === "superadmin";

/** A role's name (messages roles.*: 网站编辑, 管理员 …), a staff role this CMS doesn't know as it is. */
export const roleName = (role: string) =>
  ["editor", "manager", "admin", "superadmin"].includes(role) ? msg(`roles.${role}`) : role;

/** The code from the website, redeemed: the staff member and their role, or a refusal in words. */
export async function redeem(code: string, fetcher: typeof fetch = fetch) {
  const api = apiBase();
  const handed = await fetcher(`${api}/v1/auth/handoff`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!handed.ok) throw new CmsError("errors.linkUsed");
  const tokens = (await handed.json()) as { access_token: string; refresh_token: string };
  try {
    const me = await fetcher(`${api}/v1/admin/me`, {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    if (!me.ok) throw new CmsError("errors.notStaff");
    const staff = (await me.json()) as { id: string; login: string; role: Role; can: string[] };
    if (!staff.can.includes("content"))
      throw new CmsError("errors.roleCannotEdit", { role: roleName(staff.role) });
    return { userId: staff.id, login: staff.login, role: staff.role };
  } finally {
    // Only the role was wanted: the console session ends here, so it never counts against the account's devices.
    await fetcher(`${api}/v1/auth/logout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refresh_token: tokens.refresh_token }),
    }).catch(() => {});
  }
}

export async function openSession(db: Db, who: { userId: string; login: string; role: Role }) {
  const id = randomBytes(32).toString("base64url");
  await db.query(`insert into sessions (id, user_id, login, role) values ($1, $2, $3, $4)`, [
    id,
    who.userId,
    who.login,
    who.role,
  ]);
  return id;
}

/** The session's staff member, or undefined (none, ended, or 12 hours unused); its last use moved on. */
export async function sessionUser(db: Db, id: string | undefined): Promise<User | undefined> {
  if (!id) return undefined;
  const row = (
    await db.query<{ id: string; user_id: string; login: string; role: Role; seen_at: string }>(
      `select * from sessions where id = $1`,
      [id],
    )
  ).rows[0];
  if (!row) return undefined;
  if (Date.now() - new Date(row.seen_at).getTime() > IDLE_MS) {
    await db.query(`delete from sessions where id = $1`, [id]);
    return undefined;
  }
  if (Date.now() - new Date(row.seen_at).getTime() > 60_000)
    await db.query(`update sessions set seen_at = now() where id = $1`, [id]);
  return { id: row.id, userId: row.user_id, login: row.login, role: row.role };
}

export async function closeSession(db: Db, id: string) {
  await db.query(`delete from sessions where id = $1`, [id]);
}
