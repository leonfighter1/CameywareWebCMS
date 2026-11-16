"use client";
import {
  Alert,
  Badge,
  Button,
  Card,
  FileButton,
  Group,
  List,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { IconDownload, IconUpload } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { report } from "@/components/result";
import type { Plan } from "@/lib/transfer";
import { importAction } from "../actions";

const ACTIONS = {
  create: ["blue", "新建"],
  update: ["yellow", "修改"],
  unchanged: ["gray", "不变"],
} as const;
const KINDS = { page: "页面", component: "区块", global: "全局", text: "文字" } as const;

export function Transfer() {
  const router = useRouter();
  const [file, setFile] = useState<{ name: string; text: string }>();
  const [plan, setPlan] = useState<Plan>();
  const [busy, setBusy] = useState(false);
  const read = async (f: File | null) => {
    setPlan(undefined);
    if (!f) return;
    const text = await f.text();
    setFile({ name: f.name, text });
    setBusy(true);
    const r = await importAction(text, false);
    setBusy(false);
    if (report(r)) setPlan(r.value);
  };
  const changed = plan?.items.filter((i) => i.action !== "unchanged") ?? [];
  return (
    <Stack gap="lg">
      <Title order={1} fz={22}>
        下载与上传
      </Title>
      <Card withBorder>
        <Title order={2} fz={18} mb="xs">
          下载
        </Title>
        <Text size="sm" c="dimmed" mb="sm">
          下载的是现在的草稿（工作副本）。单个页面、区块和全局资料在它们自己的编辑页下载。改好后在下面上传，就会变回草稿，签入后生效。
        </Text>
        <Group>
          {(
            [
              ["site", "整个网站"],
              ["texts", "界面文字"],
            ] as const
          ).map(([kind, label]) =>
            (["json", "xml"] as const).map((format) => (
              <Button
                key={kind + format}
                component="a"
                href={`/api/export?kind=${kind}&format=${format}`}
                variant="default"
                leftSection={<IconDownload size={16} />}
              >
                {label}（{format.toUpperCase()}）
              </Button>
            )),
          )}
        </Group>
      </Card>
      <Card withBorder>
        <Title order={2} fz={18} mb="xs">
          上传
        </Title>
        <Text size="sm" c="dimmed" mb="sm">
          JSON 或 XML，要是 CMS
          下载的格式。先检查、列出会改什么，确认后才写入。页面文件里的地址如果还没有页面，就会新建一个页面（新的网址，先是停用的）。
        </Text>
        <FileButton onChange={read} accept=".json,.xml,application/json,application/xml,text/xml">
          {(props) => (
            <Button {...props} leftSection={<IconUpload size={16} />} loading={busy}>
              选择文件
            </Button>
          )}
        </FileButton>
        {file && (
          <Text size="sm" mt="xs">
            {file.name}
          </Text>
        )}
        {plan && (
          <Stack mt="md">
            {!!plan.notes.length && (
              <Alert color="blue">
                <List size="sm">
                  {plan.notes.map((n) => (
                    <List.Item key={n}>{n}</List.Item>
                  ))}
                </List>
              </Alert>
            )}
            <Text size="sm">
              会新建 {plan.items.filter((i) => i.action === "create").length} 项，修改{" "}
              {plan.items.filter((i) => i.action === "update").length} 项，
              {plan.items.filter((i) => i.action === "unchanged").length} 项不变。
            </Text>
            {!!changed.length && (
              <Table verticalSpacing={4}>
                <Table.Tbody>
                  {changed.slice(0, 300).map((i) => (
                    <Table.Tr key={`${i.kind}:${i.id}`}>
                      <Table.Td w={70}>{KINDS[i.kind]}</Table.Td>
                      <Table.Td>
                        <Text size="sm">{i.label}</Text>
                      </Table.Td>
                      <Table.Td w={80}>
                        <Badge color={ACTIONS[i.action][0]} variant="light">
                          {ACTIONS[i.action][1]}
                        </Badge>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
            <Group>
              <Button
                disabled={!changed.length}
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  const r = await importAction(file!.text, true);
                  setBusy(false);
                  if (report(r, "已写入草稿：到“签入”页签入后生效")) {
                    setPlan(undefined);
                    setFile(undefined);
                    router.refresh();
                  }
                }}
              >
                确认写入（{changed.length} 项）
              </Button>
              <Button variant="default" onClick={() => setPlan(undefined)}>
                取消
              </Button>
            </Group>
          </Stack>
        )}
      </Card>
    </Stack>
  );
}
