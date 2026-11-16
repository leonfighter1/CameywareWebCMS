/**
 * The addresses the CMS links to, by the address it was reached at: through the tunnel (cms-edit.cameyware.com) the
 * company's (cms-preview, preview); on this computer (127.0.0.1) the local ports. From config/addresses.json (sync).
 */
import addresses from "@/generated/addresses.json";

const local = (host: string) => /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host);

/** The CMS's preview (the website with Edit). */
export const previewBase = (host: string) =>
  local(host)
    ? `http://${addresses.local.host}:${addresses.local.cmsPreviewPort}`
    : addresses.company.cmsPreview;

/** The CMS's editors (this server). */
export const editBase = (host: string) =>
  local(host) ? `http://${addresses.local.host}:${addresses.local.cmsEditPort}` : addresses.company.cmsEdit;

/** The website with sign-in (preview.cameyware.com, served by 禄命秘解's server), where 网站内容管理 opens the CMS. */
export const siteBase = (host: string) =>
  local(host) ? `http://${addresses.local.host}:${addresses.local.apiPort}` : addresses.company.preview;

/** www.cameyware.com */
export const productionBase = () => addresses.company.site;
