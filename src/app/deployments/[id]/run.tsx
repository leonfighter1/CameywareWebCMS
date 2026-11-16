"use client";
import { Anchor, Badge, Card, Code, Group, Stack, Text, Title } from "@mantine/core";
import { IconArrowBack } from "@tabler/icons-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { NEW_TAB } from "@/components/links";
import type { Kind } from "@/lib/files";
import type { Action } from "@/lib/releases";
import { STATUS_COLOR } from "../list";

/** A deployment: its line, its files to their editors (new tabs), its whole log, refreshed while it runs. */
export function Run({
  run,
  items,
}: {
  run: {
    id: number;
    env: "preview" | "production";
    action: Action;
    release: number;
    status: "running" | "done" | "failed";
    by: string;
    at: string;
    end: string;
    log: string;
  };
  items: { key: string; kind: Kind; label: string; href?: string }[];
}) {
  const t = useTranslations("deployments");
  const tw = useTranslations("workflow");
  const tf = useTranslations("files");
  const router = useRouter();
  const running = run.status === "running";
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [running, router]);
  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={1} fz={22}>
            {t("one", { id: run.id })}
          </Title>
          <Group gap="xs" mt={4}>
            <Badge color={STATUS_COLOR[run.status]}>{tw(`status.${run.status}`)}</Badge>
            <Text size="sm">
              {tw(run.env === "preview" ? "preview" : "production")} · {tw(`actions.${run.action}`)} ·{" "}
              {t("release", { id: run.release })} · {run.by} · {run.at}
              {run.end ? ` → ${run.end}` : ""}
            </Text>
          </Group>
        </div>
        <Anchor component={Link} href="/deployments/" size="sm">
          <IconArrowBack size={14} /> {t("back")}
        </Anchor>
      </Group>
      <Card withBorder>
        <Title order={2} fz={16} mb="xs">
          {t("files", { n: items.length })}
        </Title>
        {items.length ? (
          <Group gap="sm">
            {items.map((i) =>
              i.href ? (
                <Anchor key={i.key} component={Link} {...NEW_TAB} href={i.href} size="sm">
                  {tf(`kinds.${i.kind}`)} · {i.label}
                </Anchor>
              ) : (
                <Text key={i.key} size="sm" c="dimmed">
                  {tf(`kinds.${i.kind}`)} · {i.label}
                </Text>
              ),
            )}
          </Group>
        ) : (
          <Text size="sm" c="dimmed">
            {t("noFiles")}
          </Text>
        )}
      </Card>
      <Card withBorder>
        <Group justify="space-between" mb="xs">
          <Title order={2} fz={16}>
            {t("log")}
          </Title>
          {running && (
            <Text size="xs" c="dimmed">
              {t("running")}
            </Text>
          )}
        </Group>
        <Code block style={{ whiteSpace: "pre-wrap" }} data-testid="deployment-log">
          {run.log || tw("noOutput")}
        </Code>
      </Card>
    </Stack>
  );
}
