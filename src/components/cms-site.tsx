"use client";

import { Badge, Group, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

/** The CMS's preview site (cmsSiteState in deploy.ts), its time in the reader's words. */
export type CmsSite = { building: boolean; failed?: string; at: string };

/**
 * The CMS's preview in a word: rebuilding, its last build failed (why on hover), or ready with the time it was built.
 * While it builds the page asks again every few seconds, and says when it ends.
 */
export function CmsSiteBadge({ site }: { site: CmsSite }) {
  const t = useTranslations("explorer");
  const router = useRouter();
  useEffect(() => {
    if (!site.building) return;
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [site.building, router]);
  const was = useRef(site.building);
  useEffect(() => {
    if (was.current && !site.building)
      notifications.show(
        site.failed
          ? { color: "red", message: t("cmsSiteFailedNote", { why: site.failed }), autoClose: 12_000 }
          : { color: "green", message: t("cmsSiteDone") },
      );
    was.current = site.building;
  }, [site.building, site.failed, t]);
  return (
    <Group gap="xs" data-testid="cms-site-state">
      <Badge
        size="sm"
        color={site.building ? "yellow" : site.failed ? "red" : "green"}
        title={site.building ? undefined : site.failed}
      >
        {site.building ? t("rebuilding") : site.failed ? t("cmsSiteFailed") : t("ready")}
      </Badge>
      {!site.building && site.at && (
        <Text size="xs" c="dimmed">
          {t("cmsSiteBuilt", { at: site.at })}
        </Text>
      )}
    </Group>
  );
}
