/**
 * Migration 7's carrying over (S7): the files in the workflow before jobs existed become jobs, one per check-in and
 * step (a check-in whose files went on apart makes one job at each step), named by its message, its author's, at
 * 进行中 (已签入) or 预览站. Apart from jobs.ts so the database's migrations import nothing of the workflow's.
 */
import type { Transaction } from "@electric-sql/pglite";

export async function jobsFromCheckins(tx: Transaction) {
  const { rows } = await tx.query<{
    checkin_id: number | null;
    stage: string | null;
    owner: string | null;
    since: string;
    message: string | null;
    author: string | null;
    created_at: string | null;
  }>(
    `select i.checkin_id, i.stage, min(i.owner) as owner, max(i.since) as since,
            c.message, c.author, c.created_at
       from items i left join checkins c on c.id = i.checkin_id
      where i.status = 'in_workflow'
      group by i.checkin_id, i.stage, c.message, c.author, c.created_at
      order by i.checkin_id, i.stage`,
  );
  let n = 0;
  for (const g of rows) {
    n++;
    const author = g.author ?? g.owner ?? "";
    const step = g.stage === "preview" ? "preview" : "progress";
    await tx.query(
      `insert into jobs (id, name, author, step, created_at, updated_at) values ($1, $2, $3, $4, $5, $6)`,
      [n, g.message ?? "", author, step, g.created_at ?? g.since, g.since],
    );
    await tx.query(
      `insert into job_files (job_id, kind, id)
         select $1, kind, id from items
          where status = 'in_workflow' and checkin_id is not distinct from $2 and stage is not distinct from $3`,
      [n, g.checkin_id, g.stage],
    );
    await tx.query(`insert into job_events (job_id, action, by, at) values ($1, 'created', $2, $3)`, [
      n,
      author,
      g.created_at ?? g.since,
    ]);
    if (step === "preview")
      await tx.query(`insert into job_events (job_id, action, by, at) values ($1, 'preview', $2, $3)`, [
        n,
        author,
        g.since,
      ]);
  }
}
