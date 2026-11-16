import { Frame } from "@/components/frame";
import { fileViews } from "@/lib/present";
import { database, language, requireUser } from "@/lib/server";
import { listTexts } from "@/lib/store";
import { files } from "@/lib/workflow";
import { TextsEditor } from "./editor";

/**
 * 界面文字: every text of the website's code pages (sign-in, the account, buttons, messages), by its key, in the four
 * languages, each a file of its own (taken, edited, checked in). They win over the code's own (messages/*.json) when
 * the site is built.
 */
export default async function TextsPage({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const { key } = await searchParams;
  const user = await requireUser();
  const lang = await language();
  const pg = await database();
  const [texts, all] = await Promise.all([listTexts(pg), files(pg)]);
  const views = fileViews(all, lang);
  return (
    <Frame>
      <TextsEditor
        me={user.login}
        initial={key}
        texts={texts.flatMap((x) => {
          const file = views[`text:${x.key}`];
          return file ? [{ key: x.key, value: x.value, file }] : [];
        })}
      />
    </Frame>
  );
}
