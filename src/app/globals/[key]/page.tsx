import { notFound } from "next/navigation";
import { Frame } from "@/components/frame";
import { GLOBALS, ICONS } from "@/lib/catalog";
import { database } from "@/lib/server";
import { changes, getGlobal } from "@/lib/store";
import { GlobalEditor } from "./editor";

/** A global (公司, 页头, 页脚, 作品, 网站的标题和描述): where the header's and the footer's Edit lead. */
export default async function GlobalPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ back?: string }>;
}) {
  const { key } = await params;
  const { back } = await searchParams;
  const def = GLOBALS[key];
  if (!def) notFound();
  const pg = await database();
  const [g, pending, works] = await Promise.all([getGlobal(pg, key), changes(pg), getGlobal(pg, "works")]);
  const items = ((works?.data as { items?: { slug: string }[] })?.items ?? []).map((w) => ({
    value: w.slug,
    label: w.slug,
  }));
  return (
    <Frame>
      <GlobalEditor
        name={key}
        def={def}
        all={Object.entries(GLOBALS).map(([k, d]) => ({ key: k, label: d.label }))}
        data={(g?.data ?? {}) as Record<string, unknown>}
        changed={pending.some((c) => c.kind === "global" && c.id === key)}
        ctx={{ works: items, icons: ICONS }}
        back={back}
      />
    </Frame>
  );
}
