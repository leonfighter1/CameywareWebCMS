import { Frame } from "@/components/frame";
import { previewBase } from "@/lib/hosts";
import { database, host } from "@/lib/server";
import { changes } from "@/lib/store";
import { checkins } from "@/lib/workflow";
import { CheckinForm } from "./form";

/** 签入: the changes not checked in, to choose from; checked in, the CMS's preview shows them (已签入) at once. */
export default async function CheckinPage() {
  const pg = await database();
  const [pending, past] = await Promise.all([changes(pg), checkins(pg, 20)]);
  return (
    <Frame>
      <CheckinForm
        pending={pending}
        preview={`${previewBase(await host())}/zh/`}
        past={past.map((c) => ({
          id: Number(c.id),
          message: c.message,
          by: c.author,
          at: new Date(c.created_at).toLocaleString("zh-CN"),
          count: c.items.length,
        }))}
      />
    </Frame>
  );
}
