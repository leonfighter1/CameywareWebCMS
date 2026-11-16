/**
 * npm run build:site: the CMS's preview of the website (deploy/cms/site), built from the website's code as it is now.
 * Only while the CMS isn't running: two processes must never open its database at once (the running CMS has 重建 CMS
 * 预览站 on its central page for this).
 */
import addresses from "../src/generated/addresses.json";
import { buildCmsSite } from "../src/lib/deploy";

const edit = `http://${addresses.local.host}:${addresses.local.cmsEditPort}`;
if (
  await fetch(`${edit}/login`).then(
    (r) => r.ok,
    () => false,
  )
) {
  console.error(`The CMS is running (${edit}): use 重建 CMS 预览站 on its central page instead.`);
  process.exit(1);
}
await buildCmsSite();
process.exit(0);
