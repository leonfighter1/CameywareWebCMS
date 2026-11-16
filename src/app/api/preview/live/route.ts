import { NextResponse, type NextRequest } from "next/server";
import { database } from "@/lib/server";
import { buildContent } from "@/lib/store";

/**
 * The whole site as the CMS has it now, for its preview (cms-preview, whose server asks with the key the two share:
 * CMS_PREVIEW_KEY, made at each start). ?view=draft for the drafts, else 已签入: production's files with the workflow's.
 */
export async function GET(req: NextRequest) {
  const key = process.env.CMS_PREVIEW_KEY;
  if (!key || req.headers.get("x-cms-preview-key") !== key)
    return new NextResponse("forbidden", { status: 403 });
  const view = req.nextUrl.searchParams.get("view") === "draft" ? "draft" : "workflow";
  const content = await buildContent(await database(), view);
  return NextResponse.json(content, { headers: { "cache-control": "no-store" } });
}
