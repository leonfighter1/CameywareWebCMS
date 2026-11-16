import { notFound } from "next/navigation";
import { Frame } from "@/components/frame";
import { fileHref, fileViews, when } from "@/lib/present";
import { deploymentById, readLog } from "@/lib/releases";
import { database, language, requireUser } from "@/lib/server";
import { files } from "@/lib/workflow";
import { Run } from "./run";

/** One deployment (S6): what it did, its files (each to its editor) and its whole log. */
export default async function DeploymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser();
  const lang = await language();
  const pg = await database();
  const d = Number(id) ? await deploymentById(pg, Number(id)) : undefined;
  if (!d) notFound();
  const views = fileViews(await files(pg), lang);
  return (
    <Frame>
      <Run
        run={{
          id: d.id,
          env: d.env,
          action: d.action,
          release: d.release_id,
          status: d.status,
          by: d.author,
          at: when(d.started_at, lang),
          end: when(d.finished_at, lang),
          log: readLog(d.log, lang),
        }}
        items={d.items.map((i) => ({
          key: `${i.kind}:${i.id}`,
          kind: i.kind,
          label: views[`${i.kind}:${i.id}`]?.label ?? i.id,
          href: views[`${i.kind}:${i.id}`] ? fileHref(i.kind, i.id) : undefined,
        }))}
      />
    </Frame>
  );
}
