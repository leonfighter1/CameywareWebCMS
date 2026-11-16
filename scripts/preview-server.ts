/**
 * The CMS's preview (cms-preview.cameyware.com → 127.0.0.1:8791): the website built in CMS mode (deploy/cms/site,
 * npm run build:site or the central page's 重建 CMS 预览站), its content live from the CMS (port 8790).
 *   /cms-api/v1/live    the site as the CMS has it now (checked in or drafts), asked of the CMS with the key they share
 *   /cms-api/v1/config  where the editors are, by the address this was reached at (the Edit buttons' links)
 *   /v1/, /app/         禄命秘解's API and web app (the services' order, the web version's button)
 *   anything else       the build's files; a page's address the build didn't make (a page made since) gets the
 *                       catch-all page (/<locale>/__cms__/), which shows it live
 */
import { existsSync } from "node:fs";
import { createServer, type IncomingMessage, request, type ServerResponse } from "node:http";
import sirv from "sirv";
import addresses from "../src/generated/addresses.json";
import { editBase } from "../src/lib/hosts";
import { deployDir } from "../src/lib/paths";

const PORT = Number(process.env.CMS_PREVIEW_PORT ?? addresses.local.cmsPreviewPort);
const CMS = `http://${addresses.local.host}:${addresses.local.cmsEditPort}`;
const API = process.env.LUMING_API ?? `http://${addresses.local.host}:${addresses.local.apiPort}`;
const SITE = deployDir("cms", "site");
const LOCALE = /^\/(zh|zh-hant|en|fr)\//;

/** [req] passed on to [target] + [path], its answer streamed back. */
function proxy(
  req: IncomingMessage,
  res: ServerResponse,
  target: string,
  path: string,
  headers: Record<string, string> = {},
) {
  const url = new URL(path, target);
  const out = request(
    url,
    { method: req.method, headers: { ...req.headers, host: url.host, ...headers } },
    (answer) => {
      res.writeHead(answer.statusCode ?? 502, answer.headers);
      answer.pipe(res);
    },
  );
  out.on("error", () => {
    res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    res.end(`连不上 ${target}`);
  });
  req.pipe(out);
}

let serve = existsSync(SITE) ? sirv(SITE, { dev: true, etag: true }) : undefined;

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const host = req.headers["x-forwarded-host"]?.toString() ?? req.headers.host ?? "127.0.0.1";
  if (url.pathname === "/cms-api/v1/config") {
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    return res.end(JSON.stringify({ edit: editBase(host) }));
  }
  if (url.pathname === "/cms-api/v1/live")
    return proxy(req, res, CMS, `/api/preview/live${url.search}`, {
      "x-cms-preview-key": process.env.CMS_PREVIEW_KEY ?? "",
    });
  if (url.pathname.startsWith("/v1/") || url.pathname.startsWith("/app/"))
    return proxy(req, res, API, req.url ?? "/");
  if (!serve && existsSync(SITE)) serve = sirv(SITE, { dev: true, etag: true });
  if (!serve) {
    res.writeHead(503, { "content-type": "text/html; charset=utf-8" });
    return res.end(
      `<!doctype html><meta charset="utf-8"><title>CMS 预览</title><p style="font:16px system-ui;padding:24px">CMS 预览站正在构建（第一次要几分钟），稍后刷新这一页。</p>`,
    );
  }
  const notFound = () => {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("not found");
  };
  serve(req, res, () => {
    const locale = LOCALE.exec(url.pathname)?.[1];
    if (!locale || req.method !== "GET") return notFound();
    req.url = `/${locale}/__cms__/`;
    serve!(req, res, notFound);
  });
});

server.listen(PORT, addresses.local.host, () =>
  console.log(`CMS preview on http://${addresses.local.host}:${PORT}`),
);
