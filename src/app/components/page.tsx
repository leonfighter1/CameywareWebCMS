import { redirect } from "next/navigation";

/** The blocks by type are the explorer's 内容/组件 since S3. */
export default async function ComponentsPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  redirect(`/?at=${encodeURIComponent(type ? `content/components/${type}` : "content/components")}`);
}
