"use client";
/**
 * A file to copy, picked from all there are (the owner, 2026-11-16, of 新建页面's list: 「万一有很多page呢，难道一直要往下翻
 * 吗？应该有一个专门的lightbox可以查找所有的相关的content 去copy」): a search by name or address, the files ten a page, one
 * picked by a click (a double click picks it at once). Opened over the dialog that asks for it.
 */
import { Button, Group, Modal, Pagination, Stack, Table, Text, TextInput } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { FileView } from "@/lib/present";
import { StateBadges } from "./files";

/** A file to pick: its id, its name, what is said under it (a page's address), its state. */
export type PickItem = { id: string; name: string; sub?: string; file?: FileView };

const PER = 10;

export function FilePicker({
  opened,
  title,
  items,
  value,
  me,
  onPick,
  close,
}: {
  opened: boolean;
  title: string;
  items: PickItem[];
  value: string | null;
  me: string;
  onPick: (id: string) => void;
  close: () => void;
}) {
  const t = useTranslations("picker");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [at, setAt] = useState<string | null>(value);
  const find = q.trim().toLowerCase();
  const shown = find
    ? items.filter((i) => `${i.name} ${i.sub ?? ""} ${i.id}`.toLowerCase().includes(find))
    : items;
  const pages = Math.max(1, Math.ceil(shown.length / PER));
  const now = Math.min(page, pages);
  const rows = shown.slice((now - 1) * PER, now * PER);
  return (
    <Modal opened={opened} onClose={close} title={title} size="xl" zIndex={400} data-testid="file-picker">
      <Stack>
        <TextInput
          leftSection={<IconSearch size={14} />}
          placeholder={t("search")}
          value={q}
          onChange={(e) => {
            setQ(e.currentTarget.value);
            setPage(1);
          }}
          data-autofocus
          data-testid="picker-search"
        />
        <Table highlightOnHover verticalSpacing={6} data-testid="picker-table">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("name")}</Table.Th>
              <Table.Th>{t("state")}</Table.Th>
              <Table.Th>{t("at")}</Table.Th>
              <Table.Th>{t("by")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((i) => (
              <Table.Tr
                key={i.id}
                onClick={() => setAt(i.id)}
                onDoubleClick={() => onPick(i.id)}
                bg={at === i.id ? "var(--mantine-primary-color-light)" : undefined}
                style={{ cursor: "pointer" }}
                data-testid={`pick-${i.id}`}
              >
                <Table.Td>
                  <Text size="sm" ff="monospace" fw={at === i.id ? 700 : undefined}>
                    {i.name}
                  </Text>
                  {i.sub && (
                    <Text size="xs" c="dimmed">
                      {i.sub}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <StateBadges file={i.file} me={me} size="xs" />
                </Table.Td>
                <Table.Td>
                  <Text size="xs">{i.file?.at ?? "—"}</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="xs">{i.file?.by ?? "—"}</Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        {!shown.length && (
          <Text size="sm" c="dimmed" ta="center">
            {t("none")}
          </Text>
        )}
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            {t("count", { n: shown.length })}
          </Text>
          {pages > 1 && <Pagination size="sm" total={pages} value={now} onChange={setPage} />}
        </Group>
        <Group justify="flex-end">
          <Button variant="default" onClick={close}>
            {t("cancel")}
          </Button>
          <Button disabled={!at} onClick={() => at && onPick(at)} data-testid="picker-ok">
            {t("pick")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
