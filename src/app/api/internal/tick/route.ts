import { NextResponse, type NextRequest } from "next/server";
import { runDue } from "@/lib/jobs";
import { database } from "@/lib/server";

/** Each minute (scripts/start.ts, with the preview key): the jobs whose publishing time has come, published (S7). */
export async function POST(req: NextRequest) {
  const key = process.env.CMS_PREVIEW_KEY;
  if (!key || req.headers.get("x-cms-preview-key") !== key)
    return new NextResponse("forbidden", { status: 403 });
  const started = await runDue(await database());
  return NextResponse.json({ started: started.map((s) => s.id) });
}
