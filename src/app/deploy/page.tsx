import { redirect } from "next/navigation";

/** 发布 is the 工作流 page since v2.0.0 (an address kept for old bookmarks). */
export default function DeployPage() {
  redirect("/workflow/");
}
