import { redirect } from "next/navigation";
import { bundleOf } from "@/lib/bundles";

/** 界面文字 is the resource bundles since S3: a text's key opens its bundle, else the bundles' folder. */
export default async function TextsPage({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const { key } = await searchParams;
  redirect(
    key
      ? `/bundles/${encodeURIComponent(bundleOf(key))}?q=${encodeURIComponent(key)}`
      : `/?at=${encodeURIComponent("content/common/bundles")}`,
  );
}
