/** Where the CMS's neighbours are on this computer, and where it writes what it deploys (deploy/, git-ignored). */
import { join, resolve } from "node:path";
import addresses from "@/generated/addresses.json";

/** The website's repository: SITE_REPO, else ../Cameyware beside this one. */
export const siteRepo = () =>
  resolve(/*turbopackIgnore: true*/ process.env.SITE_REPO || join(process.cwd(), "..", "Cameyware"));

/** deploy/<env>/: each environment's content.json, and the CMS's preview build (deploy/cms/site). */
export const deployDir = (...p: string[]) =>
  join(/*turbopackIgnore: true*/ process.env.CMS_DEPLOY_DIR || join(process.cwd(), "deploy"), ...p);

/** 禄命秘解's API on this computer: the CMS signs staff in through it. */
export const apiBase = () =>
  process.env.LUMING_API || `http://${addresses.local.host}:${addresses.local.apiPort}`;

export const ADDRESSES = addresses;
