"use client";
import { notifications } from "@mantine/notifications";
import type { Result } from "@/lib/server";

/** An action's answer said at the top: [done] on success, its refusal with every reason otherwise. */
export function report<T>(r: Result<T>, done?: string): r is { ok: true; value?: T } {
  if (r.ok) {
    if (done) notifications.show({ color: "green", message: done });
    return true;
  }
  // The page's language (the layout's lang): this runs outside React, where next-intl's hooks don't reach.
  const en = typeof document !== "undefined" && document.documentElement.lang === "en";
  const more = r.details.length - 8;
  notifications.show({
    color: "red",
    title: r.error,
    message: r.details.length
      ? r.details.slice(0, 8).join("\n") +
        (more > 0 ? (en ? `\n…and ${more} more` : `\n…还有 ${more} 条`) : "")
      : undefined,
    autoClose: 12_000,
    styles: { description: { whiteSpace: "pre-line" } },
  });
  return false;
}
