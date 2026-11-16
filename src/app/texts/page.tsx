import { Frame } from "@/components/frame";
import { database } from "@/lib/server";
import { changes, listTexts } from "@/lib/store";
import { TextsEditor } from "./editor";

/**
 * 界面文字: every text of the website's code pages (sign-in, the account, buttons, messages), by its key, in the four
 * languages. They win over the code's own (messages/*.json) when the site is built.
 */
export default async function TextsPage() {
  const pg = await database();
  const [texts, pending] = await Promise.all([listTexts(pg), changes(pg)]);
  const changed = new Set(pending.filter((c) => c.kind === "text").map((c) => c.id));
  return (
    <Frame>
      <TextsEditor texts={texts.map((t) => ({ key: t.key, value: t.value, changed: changed.has(t.key) }))} />
    </Frame>
  );
}
