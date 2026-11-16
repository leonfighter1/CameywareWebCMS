import { redirect } from "next/navigation";

/** 签入 is in 我的文件 since v2.0.0 (an address kept for old bookmarks). */
export default function CheckinPage() {
  redirect("/mine/");
}
