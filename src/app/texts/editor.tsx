"use client";
import {
  Badge,
  Button,
  Card,
  Group,
  Menu,
  Pagination,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { IconDownload, IconSearch } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { LOCALE_LABELS } from "@/components/fields";
import { report } from "@/components/result";
import { type L10n, LOCALES } from "@/generated/model";
import { saveTextAction } from "../actions";

type Row = { key: string; value: L10n; changed: boolean };

function TextRow({ row }: { row: Row }) {
  const router = useRouter();
  const [value, setValue] = useState(row.value);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(value) !== JSON.stringify(row.value);
  return (
    <Table.Tr>
      <Table.Td style={{ verticalAlign: "top" }}>
        <Text size="xs" ff="monospace">
          {row.key}
        </Text>
        {row.changed && (
          <Badge size="xs" color="yellow" variant="light" mt={4}>
            未签入
          </Badge>
        )}
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
          />
        </Table.Td>
      ))}
      <Table.Td style={{ verticalAlign: "top" }}>
        <Button
          size="compact-xs"
          disabled={!dirty}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            if (report(await saveTextAction(row.key, value), "已保存（草稿）")) router.refresh();
            setBusy(false);
          }}
        >
          保存
        </Button>
      </Table.Td>
    </Table.Tr>
  );
}

const PER = 25;

export function TextsEditor({ texts }: { texts: Row[] }) {
  const [q, setQ] = useState("");
  const [ns, setNs] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const spaces = useMemo(() => [...new Set(texts.map((t) => t.key.split(".")[0]!))], [texts]);
  const shown = texts.filter(
    (t) =>
      (!ns || t.key.startsWith(`${ns}.`)) &&
      (!q ||
        t.key.toLowerCase().includes(q.toLowerCase()) ||
        Object.values(t.value).some((v) => v?.toLowerCase().includes(q.toLowerCase()))),
  );
  const pages = Math.max(1, Math.ceil(shown.length / PER));
  const at = Math.min(page, pages);
  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <div>
          <Title order={1} fz={22}>
            界面文字
          </Title>
          <Text size="sm" c="dimmed">
            网站上代码页面的文字：登录、账号中心、按钮和提示，共 {texts.length} 条。app.* 是 App
            的词（服务名称等）。
          </Text>
        </div>
        <Menu>
          <Menu.Target>
            <Button variant="default" size="xs" leftSection={<IconDownload size={14} />}>
              下载全部
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
          placeholder="搜名字或文字"
          value={q}
          onChange={(e) => {
            setQ(e.currentTarget.value);
            setPage(1);
          }}
        />
        <Select
          placeholder="全部分类"
          data={spaces}
          value={ns}
          onChange={(v) => {
            setNs(v);
            setPage(1);
          }}
          clearable
        />
        <Text size="sm" c="dimmed">
          {shown.length} 条
        </Text>
      </Group>
      <Card withBorder p={0}>
        <Table.ScrollContainer minWidth={980}>
          <Table verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>名字</Table.Th>
                {LOCALES.map((l) => (
                  <Table.Th key={l}>{LOCALE_LABELS[l]}</Table.Th>
                ))}
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {shown.slice((at - 1) * PER, at * PER).map((row) => (
                <TextRow key={row.key} row={row} />
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
