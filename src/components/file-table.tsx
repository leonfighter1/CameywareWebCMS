"use client";
/** A list of files to pick from: each with its kind, its name (to its editor), its state and what the caller adds. */
import { Anchor, Badge, Checkbox, Group, Table, Text } from "@mantine/core";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { fileHref, type FileView } from "@/lib/present";
import { StateBadges } from "./files";
import { NEW_TAB } from "@/components/links";

export const keyOf = (f: { kind: string; id: string }) => `${f.kind}:${f.id}`;

export function FileTable({
  files,
  me,
  picked,
  onPick,
  extra,
  empty,
}: {
  files: FileView[];
  me: string;
  picked?: Set<string>;
  onPick?: (next: Set<string>) => void;
  /** A column of the caller's: its heading and each file's cell. */
  extra?: { title: string; cell: (f: FileView) => ReactNode };
  empty: string;
}) {
  const t = useTranslations("files");
  if (!files.length)
    return (
      <Text size="sm" c="dimmed">
        {empty}
      </Text>
    );
  const all = !!picked && files.every((f) => picked.has(keyOf(f)));
  const set = (keys: string[], on: boolean) => {
    const next = new Set(picked);
    for (const k of keys)
      if (on) next.add(k);
      else next.delete(k);
    onPick?.(next);
  };
  return (
    <Table.ScrollContainer minWidth={560}>
      <Table verticalSpacing={6} highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            {picked && (
              <Table.Th w={36}>
                <Checkbox
                  aria-label={t("pickAll")}
                  checked={all}
                  indeterminate={!all && files.some((f) => picked.has(keyOf(f)))}
                  onChange={(e) => set(files.map(keyOf), e.currentTarget.checked)}
                />
              </Table.Th>
            )}
            <Table.Th style={{ whiteSpace: "nowrap" }}>{t("kind")}</Table.Th>
            <Table.Th>{t("name")}</Table.Th>
            <Table.Th>{t("state")}</Table.Th>
            {extra && <Table.Th>{extra.title}</Table.Th>}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {files.map((f) => (
            <Table.Tr key={keyOf(f)} data-testid={`file-${keyOf(f)}`}>
              {picked && (
                <Table.Td>
                  <Checkbox
                    aria-label={f.label}
                    checked={picked.has(keyOf(f))}
                    disabled={f.busy}
                    onChange={(e) => set([keyOf(f)], e.currentTarget.checked)}
                  />
                </Table.Td>
              )}
              <Table.Td style={{ whiteSpace: "nowrap" }}>
                {/* Whole in a narrow column (a half-width card squeezed it to "区."). */}
                <Badge size="xs" variant="outline" color="gray" style={{ minWidth: "max-content" }}>
                  {t(`kinds.${f.kind}`)}
                </Badge>
              </Table.Td>
              <Table.Td>
                <Anchor component={Link} {...NEW_TAB} href={fileHref(f.kind, f.id)} size="sm">
                  {f.label}
                </Anchor>
              </Table.Td>
              <Table.Td>
                <Group gap={4} wrap="wrap">
                  <StateBadges file={f} me={me} size="xs" />
                  {f.inactive && (
                    <Badge
                      size="xs"
                      color="orange"
                      variant="outline"
                      title={t("inactiveHint")}
                      style={{ minWidth: "max-content" }}
                      data-testid={`inactive-${f.id}`}
                    >
                      {t("inactivePage")}
                    </Badge>
                  )}
                </Group>
                {f.busy && (
                  <Text size="xs" c="dimmed">
                    {t("busy")}
                  </Text>
                )}
              </Table.Td>
              {extra && <Table.Td>{extra.cell(f)}</Table.Td>}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
