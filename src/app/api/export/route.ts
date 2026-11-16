import { NextResponse, type NextRequest } from "next/server";
import { currentUser, database } from "@/lib/server";
import { CmsError, type Kind } from "@/lib/store";
import { exportDoc, toXml } from "@/lib/transfer";

/** A download: /api/export?kind=page|component|global|texts|site&id=…&format=json|xml, for a signed-in staff member. */
export async function GET(req: NextRequest) {
  if (!(await currentUser())) return new NextResponse("请先登录", { status: 401 });
  const q = req.nextUrl.searchParams;
  const kind = (q.get("kind") ?? "site") as Kind | "texts" | "site";
  const id = q.get("id") ?? undefined;
  const xml = q.get("format") === "xml";
  try {
    const doc = await exportDoc(await database(), kind, id);
    const name = `cms-${kind}${id ? `-${id.replace(/[^\w-]/g, "_")}` : ""}-${new Date().toISOString().slice(0, 10)}`;
    return new NextResponse(xml ? toXml(doc) : JSON.stringify(doc, null, 2) + "\n", {
      headers: {
        "content-type": xml ? "application/xml; charset=utf-8" : "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${name}.${xml ? "xml" : "json"}"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return new NextResponse(e instanceof CmsError ? e.message : "出错了", { status: 400 });
  }
}
