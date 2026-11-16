"use client";
import {
  Anchor,
  Badge,
  Card,
  Group,
  Pagination,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { NEW_TAB } from "@/components/links";
import type { Action } from "@/lib/releases";
import { type ReleaseRow, Releases } from "./releases";

export type RunRow = {
  id: number;
  env: "preview" | "production";
  action: Action;
  release: number;
  status: "running" | "done" | "failed";
  items: number;
  by: string;
  at: string;
  end: string;
};

export const STATUS_COLOR = { running: "yellow", done: "green", failed: "red" } as const;

type Filters = { env: string | null; status: string | null; action: string | null; q: string };

/**
 * The history: every deployment a page at a time, found by words and filtered by site, state and step, each one's log in
 * a tab of its own; and every release (所有版本), with production back to one.
 */
export function DeploymentList({
  tab,
  total,
  page,
  pages,
  filters,
  actions,
  rows,
  releases,
}: {
  tab: "deployments" | "releases";
  total: number;
  page: number;
  pages: number;
  filters: Filters;
  actions: Action[];
  rows: RunRow[];
  releases: {
    rows: ReleaseRow[];
    preview?: number;
    production?: number;
    canPublish: boolean;
    busy: boolean;
  };
}) {
  const t = useTranslations("deployments");
  const tw = useTranslations("workflow");
  const router = useRouter();
  const [words, setWords] = useState(filters.q);
  /** The page with [change] made to the filters (a new filter starts at page 1). */
  const go = (change: Partial<Filters> & { page?: number; tab?: string }) => {
    const f = { ...filters, ...change };
    const q = new URLSearchParams();
    if (change.tab ?? tab) q.set("tab", change.tab ?? tab);
    if (f.env) q.set("env", f.env);
    if (f.status) q.set("status", f.status);
    if (f.action) q.set("action", f.action);
    if (f.q.trim()) q.set("q", f.q.trim());
    if (change.page && change.page > 1) q.set("page", String(change.page));
    router.push(`/deployments/?${q}`);
  };
  const choice = (
    key: "env" | "status" | "action",
    label: string,
    all: string,
    data: { value: string; label: string }[],
  ) => (
    <Select
      size="xs"
      label={label}
      data={[{ value: "", label: all }, ...data]}
      value={filters[key] ?? ""}
      onChange={(v) => go({ [key]: v || null })}
      allowDeselect={false}
      w={140}
    />
  );
  return (
    <Stack gap="lg">
      <div>
        <Title order={1} fz={22}>
          {t("title")}
        </Title>
        <Text size="sm" c="dimmed">
          {t("lead")}
        </Text>
      </div>
      <Tabs value={tab} onChange={(v) => go({ tab: v ?? "deployments" })}>
        <Tabs.List>
          <Tabs.Tab value="deployments">{t("tabs.deployments")}</Tabs.Tab>
          <Tabs.Tab value="releases">{t("tabs.releases")}</Tabs.Tab>
        </Tabs.List>
      </Tabs>
      {tab === "releases" ? (
        <Releases
          releases={releases.rows}
          preview={releases.preview}
          production={releases.production}
          canPublish={releases.canPublish}
          busy={releases.busy}
        />
      ) : (
        <Card withBorder>
          <Group justify="space-between" mb="sm" align="flex-end">
            <Group gap="sm" align="flex-end">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  go({ q: words });
                }}
              >
                <TextInput
                  size="xs"
                  label={t("search")}
                  placeholder={t("searchPlaceholder")}
                  value={words}
                  onChange={(e) => setWords(e.currentTarget.value)}
                  leftSection={<IconSearch size={14} />}
                  w={260}
                  data-testid="deployments-search"
                />
              </form>
              {choice("env", t("env"), t("allEnvs"), [
                { value: "preview", label: tw("preview") },
                { value: "production", label: tw("production") },
              ])}
              {choice(
                "status",
                t("status"),
                t("allStatus"),
                (["running", "done", "failed"] as const).map((s) => ({ value: s, label: tw(`status.${s}`) })),
              )}
              {choice(
                "action",
                t("action"),
                t("allActions"),
                actions.map((a) => ({ value: a, label: tw(`actions.${a}`) })),
              )}
            </Group>
            <Text size="sm" c="dimmed" data-testid="deployments-total">
              {t("total", { n: total })}
            </Text>
          </Group>
          <Table.ScrollContainer minWidth={760}>
            <Table verticalSpacing="xs" striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("columns.id")}</Table.Th>
                  <Table.Th>{t("columns.status")}</Table.Th>
                  <Table.Th>{t("columns.what")}</Table.Th>
                  <Table.Th>{t("columns.files")}</Table.Th>
                  <Table.Th>{t("columns.by")}</Table.Th>
                  <Table.Th>{t("columns.started")}</Table.Th>
                  <Table.Th>{t("columns.finished")}</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((r) => (
                  <Table.Tr key={r.id} data-testid={`deployment-${r.id}`}>
                    <Table.Td>#{r.id}</Table.Td>
                    <Table.Td>
                      <Badge size="sm" color={STATUS_COLOR[r.status]} style={{ minWidth: "max-content" }}>
                        {tw(`status.${r.status}`)}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">
                        {tw(r.env === "preview" ? "preview" : "production")} · {tw(`actions.${r.action}`)} ·{" "}
                        {t("release", { id: r.release })}
                      </Text>
                    </Table.Td>
                    <Table.Td>{r.items}</Table.Td>
                    <Table.Td>{r.by}</Table.Td>
                    <Table.Td style={{ whiteSpace: "nowrap" }}>
                      <Text size="xs">{r.at}</Text>
                    </Table.Td>
                    <Table.Td style={{ whiteSpace: "nowrap" }}>
                      <Text size="xs">{r.end || "—"}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Anchor component={Link} {...NEW_TAB} href={`/deployments/${r.id}`} size="sm">
                        {t("log")}
                      </Anchor>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          {!rows.length && (
            <Text c="dimmed" size="sm">
              {t("none")}
            </Text>
          )}
          {pages > 1 && (
            <Group justify="center" mt="md">
              <Pagination total={pages} value={page} onChange={(p) => go({ page: p })} size="sm" />
            </Group>
          )}
        </Card>
      )}
    </Stack>
  );
}
