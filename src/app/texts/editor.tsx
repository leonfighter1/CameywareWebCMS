"use client";
import {
  Button,
  Card,
  Checkbox,
  Group,
  Menu,
  Pagination,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { IconDownload, IconSearch } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { LOCALE_LABELS } from "@/components/fields";
import { checkInModal, confirm, isMine, StateBadges } from "@/components/files";
import { report } from "@/components/result";
import type { FileView } from "@/lib/present";
import { type L10n, LOCALES } from "@/generated/model";
import { putBackAction, saveTextAction, takeAction } from "../actions";

type Row = { key: string; value: L10n; file: FileView };

function TextRow({
  row,
  me,
  picked,
  onPick,
}: {
  row: Row;
  me: string;
  picked: boolean;
  onPick: (on: boolean) => void;
}) {
  const t = useTranslations("texts");
  const tf = useTranslations("files");
  const router = useRouter();
  const [value, setValue] = useState(row.value);
  const [busy, setBusy] = useState(false);
  const mine = isMine(row.file, me);
  const dirty = JSON.stringify(value) !== JSON.stringify(row.value);
  const item = [{ kind: "text" as const, id: row.key }];
  return (
    <Table.Tr data-testid={`text-${row.key}`}>
      <Table.Td style={{ verticalAlign: "top" }}>
        <Checkbox aria-label={row.key} checked={picked} onChange={(e) => onPick(e.currentTarget.checked)} />
      </Table.Td>
      <Table.Td style={{ verticalAlign: "top" }}>
        <Text size="xs" ff="monospace">
          {row.key}
        </Text>
        <StateBadges file={row.file} me={me} size="xs" />
      </Table.Td>
      {LOCALES.map((l) => (
        <Table.Td key={l} style={{ verticalAlign: "top", minWidth: 180 }}>
          <Textarea
            aria-label={`${row.key} ${LOCALE_LABELS[l]}`}
            value={value[l] ?? ""}
            onChange={(e) => setValue({ ...value, [l]: e.currentTarget.value })}
            autosize
            minRows={1}
            maxRows={8}
            size="xs"
            disabled={!mine}
          />
        </Table.Td>
      ))}
      <Table.Td style={{ verticalAlign: "top" }}>
        {mine ? (
          <Button
            size="compact-xs"
            disabled={!dirty}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              if (report(await saveTextAction(row.key, value), t("saved"))) router.refresh();
              setBusy(false);
            }}
          >
            {t("save")}
          </Button>
        ) : row.file.status === "available" ? (
          <Button
            size="compact-xs"
            variant="light"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              if (report(await takeAction(item), tf("taken"))) router.refresh();
              setBusy(false);
            }}
          >
            {tf("take")}
          </Button>
        ) : row.file.status === "checked_out" ? (
          <Button
            size="compact-xs"
            variant="light"
            color="orange"
            onClick={() =>
              confirm({
                title: tf("takeOverTitle"),
                body: tf("takeOverBody", { owner: row.file.owner ?? "" }),
                label: tf("takeOver"),
                cancel: tf("cancel"),
                run: async () => report(await takeAction(item, true), tf("taken")) && router.refresh(),
              })
            }
          >
            {tf("takeOver")}
          </Button>
        ) : null}
      </Table.Td>
    </Table.Tr>
  );
}

const PER = 25;

export function TextsEditor({ me, texts, initial }: { me: string; texts: Row[]; initial?: string }) {
  const t = useTranslations("texts");
  const tf = useTranslations("files");
  const router = useRouter();
  const [q, setQ] = useState(initial ?? "");
  const [ns, setNs] = useState<string | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const spaces = useMemo(() => [...new Set(texts.map((x) => x.key.split(".")[0]!))], [texts]);
  const shown = texts.filter(
    (x) =>
      (!ns || x.key.startsWith(`${ns}.`)) &&
      (!onlyMine || isMine(x.file, me)) &&
      (!q ||
        x.key.toLowerCase().includes(q.toLowerCase()) ||
        Object.values(x.value).some((v) => v?.toLowerCase().includes(q.toLowerCase()))),
  );
  const pages = Math.max(1, Math.ceil(shown.length / PER));
  const at = Math.min(page, pages);
  const rows = shown.slice((at - 1) * PER, at * PER);
  const items = [...picked].map((id) => ({ kind: "text" as const, id }));
  const done = (ok: boolean) => {
    if (!ok) return;
    setPicked(new Set());
    router.refresh();
  };
  const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.key));
  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <div>
          <Title order={1} fz={22}>
            {t("title")}
          </Title>
          <Text size="sm" c="dimmed">
            {t("lead", { n: texts.length })}
          </Text>
        </div>
        <Menu>
          <Menu.Target>
            <Button variant="default" size="xs" leftSection={<IconDownload size={14} />}>
              {t("downloadAll")}
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item component="a" href="/api/export?kind=texts&format=json">
              JSON
            </Menu.Item>
            <Menu.Item component="a" href="/api/export?kind=texts&format=xml">
              XML
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
      <Group>
        <TextInput
          leftSection={<IconSearch size={16} />}
          placeholder={t("search")}
          value={q}
          onChange={(e) => {
            setQ(e.currentTarget.value);
            setPage(1);
          }}
        />
        <Select
          placeholder={t("allSpaces")}
          data={spaces}
          value={ns}
          onChange={(v) => {
            setNs(v);
            setPage(1);
          }}
          clearable
        />
        <Switch
          label={t("onlyMine")}
          checked={onlyMine}
          onChange={(e) => setOnlyMine(e.currentTarget.checked)}
        />
        <Text size="sm" c="dimmed">
          {t("count", { n: shown.length })}
        </Text>
      </Group>
      {!!picked.size && (
        <Group gap="xs">
          <Text size="sm">{t("picked", { n: picked.size })}</Text>
          <Button size="xs" onClick={async () => done(report(await takeAction(items), tf("taken")))}>
            {tf("take")}
          </Button>
          <Button size="xs" variant="light" onClick={() => checkInModal(items, tf, () => done(true))}>
            {tf("checkIn")}
          </Button>
          <Button
            size="xs"
            variant="default"
            onClick={async () => done(report(await putBackAction(items), tf("putBackDone")))}
          >
            {tf("putBack")}
          </Button>
          <Button size="xs" variant="subtle" onClick={() => setPicked(new Set())}>
            {t("clear")}
          </Button>
        </Group>
      )}
      <Card withBorder p={0}>
        <Table.ScrollContainer minWidth={1040}>
          <Table verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={36}>
                  <Checkbox
                    aria-label={t("pickPage")}
                    checked={allPicked}
                    onChange={(e) => {
                      const next = new Set(picked);
                      for (const r of rows)
                        if (e.currentTarget.checked) next.add(r.key);
                        else next.delete(r.key);
                      setPicked(next);
                    }}
                  />
                </Table.Th>
                <Table.Th>{t("key")}</Table.Th>
                {LOCALES.map((l) => (
                  <Table.Th key={l}>{LOCALE_LABELS[l]}</Table.Th>
                ))}
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((row) => (
                <TextRow
                  key={`${row.key}:${JSON.stringify(row.value)}:${row.file.status}:${row.file.owner}`}
                  row={row}
                  me={me}
                  picked={picked.has(row.key)}
                  onPick={(on) => {
                    const next = new Set(picked);
                    if (on) next.add(row.key);
                    else next.delete(row.key);
                    setPicked(next);
                  }}
                />
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>
      {pages > 1 && (
        <Group justify="center">
          <Pagination total={pages} value={at} onChange={setPage} />
        </Group>
      )}
    </Stack>
  );
}
