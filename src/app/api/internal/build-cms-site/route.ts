import { NextResponse, type NextRequest } from "next/server";
import { startCmsSiteBuild } from "@/lib/deploy";
import { database } from "@/lib/server";

/** The CMS's preview built (scripts/start.ts asks when there is none yet), with the preview key; once at a time. */
export async function POST(req: NextRequest) {
  const key = process.env.CMS_PREVIEW_KEY;
  if (!key || req.headers.get("x-cms-preview-key") !== key)
    return new NextResponse("forbidden", { status: 403 });
  await database();
  return NextResponse.json({ started: startCmsSiteBuild() });
}
