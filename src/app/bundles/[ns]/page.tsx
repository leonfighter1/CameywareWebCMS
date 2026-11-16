import { notFound } from "next/navigation";
import { Frame } from "@/components/frame";
import { bundleOf } from "@/lib/bundles";
import { fileViews, versionView } from "@/lib/present";
import { database, language, requireUser } from "@/lib/server";
import { listTexts } from "@/lib/store";
import { files, versions } from "@/lib/workflow";
import { BundleEditor } from "./editor";

/**
 * A resource bundle (the owner, 2026-11-16: 「Resource bundle file, that contains all keys and values of all rescourse
 * form the website」; T2): every UI text of one namespace, in the four languages, one file taken and checked in whole.
 */
export default async function BundlePage({
  params,
  searchParams,
}: {
  params: Promise<{ ns: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const ns = decodeURIComponent((await params).ns);
  const { q } = await searchParams;
  const user = await requireUser();
  const lang = await language();
  const pg = await database();
  const [texts, all, past] = await Promise.all([listTexts(pg), files(pg), versions(pg, "bundle", ns)]);
  const file = fileViews(all, lang)[`bundle:${ns}`];
  if (!file) notFound();
  return (
    <Frame>
      <BundleEditor
        me={user.login}
        file={file}
        versions={past.map((v) => versionView(v, lang))}
        ns={ns}
        texts={texts.filter((x) => bundleOf(x.key) === ns).map((x) => ({ key: x.key, value: x.value }))}
        initial={q}
      />
    </Frame>
  );
}
