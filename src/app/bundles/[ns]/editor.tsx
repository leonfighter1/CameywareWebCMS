"use client";
import {
  Button,
  Card,
  Group,
  Menu,
  Pagination,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { IconArrowBack, IconDownload, IconPlus, IconSearch } from "@tabler/icons-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LOCALE_LABELS } from "@/components/fields";
import { FileBar, isMine } from "@/components/files";
import { report } from "@/components/result";
import type { FileView, VersionView } from "@/lib/present";
import { type L10n, LOCALES } from "@/generated/model";
import { saveTextAction } from "../../actions";

type Row = { key: string; value: L10n };

/** One text of the bundle: its four languages, open while the bundle is yours, saved on its own. */
function TextRow({ row, mine }: { row: Row; mine: boolean }) {
  const t = useTranslations("bundle");
  const router = useRouter();
  const [value, setValue] = useState(row.value);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(value) !== JSON.stringify(row.value);
  return (
    <Table.Tr data-testid={`text-${row.key}`}>
      <Table.Td style={{ verticalAlign: "top" }}>
        <Text size="xs" ff="monospace">
          {row.key}
        </Text>
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
        {mine && (
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
        )}
      </Table.Td>
    </Table.Tr>
  );
}

const PER = 25;

export function BundleEditor({
  me,
  file,
  versions,
  ns,
  texts,
  initial,
}: {
  me: string;
  file: FileView;
  versions: VersionView[];
  ns: string;
  texts: Row[];
  initial?: string;
}) {
  const t = useTranslations("bundle");
  const router = useRouter();
  const mine = isMine(file, me);
  const [q, setQ] = useState(initial ?? "");
  const [page, setPage] = useState(1);
  const [key, setKey] = useState("");
  const [zh, setZh] = useState("");
  const shown = texts.filter(
    (x) =>
      !q ||
      x.key.toLowerCase().includes(q.toLowerCase()) ||
      Object.values(x.value).some((v) => v?.toLowerCase().includes(q.toLowerCase())),
  );
  const pages = Math.max(1, Math.ceil(shown.length / PER));
  const at = Math.min(page, pages);
  const rows = shown.slice((at - 1) * PER, at * PER);
  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <div>
          <Text size="xs" c="dimmed" ff="monospace">
            /{t("path")}/{ns}
          </Text>
          <Title order={1} fz={22}>
            {file.label}
          </Title>
          <Text size="sm" c="dimmed">
            {t("lead", { n: texts.length })}
          </Text>
        </div>
        <Group gap="xs">
          <Button
            component={Link}
            href={`/?at=${encodeURIComponent("content/common/bundles")}`}
            variant="default"
            size="xs"
            leftSection={<IconArrowBack size={14} />}
          >
            {t("toFolder")}
          </Button>
          <Menu>
            <Menu.Target>
              <Button variant="default" size="xs" leftSection={<IconDownload size={14} />}>
                {t("download")}
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                component="a"
                href={`/api/export?kind=bundle&id=${encodeURIComponent(ns)}&format=json`}
              >
                JSON
              </Menu.Item>
              <Menu.Item
                component="a"
                href={`/api/export?kind=bundle&id=${encodeURIComponent(ns)}&format=xml`}
              >
                XML
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>
      <FileBar file={file} me={me} versions={versions} />
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
        <Text size="sm" c="dimmed">
          {t("count", { n: shown.length })}
        </Text>
      </Group>
      <Card withBorder p={0}>
        <Table.ScrollContainer minWidth={1040}>
          <Table verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("key")}</Table.Th>
                {LOCALES.map((l) => (
                  <Table.Th key={l}>{LOCALE_LABELS[l]}</Table.Th>
                ))}
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((row) => (
                <TextRow key={`${row.key}:${JSON.stringify(row.value)}:${mine}`} row={row} mine={mine} />
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
      {mine && (
        <Card withBorder>
          <Title order={2} fz={16} mb="xs">
            {t("addTitle")}
          </Title>
          <Group align="flex-end">
            <TextInput
              label={t("newKey")}
              leftSection={<Text size="xs" ff="monospace">{`${ns}.`}</Text>}
              leftSectionWidth={ns.length * 8 + 16}
              value={key}
              onChange={(e) => setKey(e.currentTarget.value)}
            />
            <TextInput label={LOCALE_LABELS.zh} value={zh} onChange={(e) => setZh(e.currentTarget.value)} />
            <Button
              leftSection={<IconPlus size={14} />}
              disabled={!key.trim() || !zh.trim()}
              onClick={async () => {
                if (report(await saveTextAction(`${ns}.${key.trim()}`, { zh }), t("added"))) {
                  setKey("");
                  setZh("");
                  router.refresh();
                }
              }}
            >
              {t("add")}
            </Button>
          </Group>
          <Text size="xs" c="dimmed" mt="xs">
            {t("addHelp")}
          </Text>
        </Card>
      )}
    </Stack>
  );
}
