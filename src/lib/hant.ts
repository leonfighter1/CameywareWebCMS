/**
 * 简体 to 繁體 as 禄命秘解's app writes it (its app_zh_Hant.arb): OpenCC's Taiwan phrases, then the app's own terms. 注销
 * first: OpenCC's Taiwan table reads it as 登出 (signing out), which is not what deleting an account is. The editors'
 * 「用简体生成繁體」 uses it; they read the result before saving.
 */
import * as OpenCC from "opencc-js";

const cn2tw = OpenCC.Converter({ from: "cn", to: "twp" });

const BEFORE: [string, string][] = [
  ["注销账号", "删除账号"],
  ["注销", "删除"],
];

const AFTER: [string | RegExp, string][] = [
  ["郵箱", "電子郵件"],
  ["信箱", "電子郵件"],
  ["賬號", "帳號"],
  ["賬戶", "帳戶"],
  ["登錄", "登入"],
  ["退出登入", "登出"],
  ["後臺", "後台"],
  ["使用者協議", "用戶協議"],
  ["繫結", "綁定"],
  ["許可權", "權限"],
  ["稽核", "審核"],
  ["天后", "天後"],
  ["檔案", "文件"],
  ["儲值", "充值"],
  // Its IT table reads 扩展 (to grow) as a software extension.
  ["擴充套件", "擴展"],
  ["“", "「"],
  ["”", "」"],
  [/手機號(?!碼)/g, "手機號碼"],
];

const swap = (pairs: [string | RegExp, string][], text: string) =>
  pairs.reduce((s, [a, b]) => (typeof a === "string" ? s.replaceAll(a, b) : s.replace(a, b)), text);

export const toHant = (text: string) => swap(AFTER, cn2tw(swap(BEFORE, text)));
