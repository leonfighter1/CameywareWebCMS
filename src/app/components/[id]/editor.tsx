"use client";
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Grid,
  Group,
  Menu,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconArrowBack, IconDownload, IconExternalLink } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { type Context, FieldsEditor } from "@/components/fields";
import { report } from "@/components/result";
import type { Field } from "@/lib/catalog";
import { deleteComponentAction, discardAction, saveComponentAction } from "../../actions";

export function ComponentEditor({
  component,
  typeLabel,
  typeHelp,
  fields,
  ctx,
  changed,
  pages,
  preview,
  back,
  history,
}: {
  component: { id: string; type: string; name: string; data: Record<string, unknown>; deleted: boolean };
  typeLabel: string;
  typeHelp: string;
  fields: Field[];
  ctx: Context;
  changed: boolean;
  pages: { id: string; path: string }[];
  preview?: string;
  back?: string;
  history: { id: number; at: string; by: string; message: string }[];
}) {
  const router = useRouter();
  const [name, setName] = useState(component.name);
  const [data, setData] = useState(component.data);
  const [busy, setBusy] = useState(false);
  const [frame, setFrame] = useState(0);
  const save = async () => {
    setBusy(true);
    const ok = report(
      await saveComponentAction(component.id, name, data),
      "已保存（草稿）：CMS 预览切到“草稿”就能看到",
    );
    setBusy(false);
    if (ok) {
      router.refresh();
      setFrame((n) => n + 1);
    }
  };
  if (component.deleted)
    return (
      <Alert color="yellow" title="这个区块已删除，还没签入">
        <Button
          mt="sm"
          onClick={async () =>
            report(await discardAction("component", component.id), "已恢复") && router.refresh()
          }
        >
          撤销删除
        </Button>
      </Alert>
    );
  return (
    <Grid gap="lg">
      <Grid.Col span={{ base: 12, xl: 6 }}>
        <Stack gap="lg">
          <Group justify="space-between">
            <div>
              <Group gap="xs">
                <Title order={1} fz={22}>
                  {typeLabel}
                </Title>
                {changed && <Badge color="yellow">已修改，未签入</Badge>}
              </Group>
              <Text size="sm" c="dimmed">
                {typeHelp}
              </Text>
            </div>
            <Group gap="xs">
              {back && (
                <Button
                  component="a"
                  href={back}
                  variant="default"
                  size="xs"
                  leftSection={<IconArrowBack size={14} />}
                >
                  返回预览
                </Button>
              )}
              <Menu>
                <Menu.Target>
                  <Button variant="default" size="xs" leftSection={<IconDownload size={14} />}>
                    下载
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item component="a" href={`/api/export?kind=component&id=${component.id}&format=json`}>
                    JSON
                  </Menu.Item>
                  <Menu.Item component="a" href={`/api/export?kind=component&id=${component.id}&format=xml`}>
                    XML
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>
          </Group>
          <Card withBorder>
            <Stack>
              <TextInput
                label="区块名（自己看的，网站上不显示）"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
              />
              <FieldsEditor fields={fields} value={data} onChange={setData} ctx={ctx} />
              <Group justify="space-between">
                <Group gap="xs">
                  {changed && (
                    <Button
                      variant="default"
                      onClick={async () => {
                        if (report(await discardAction("component", component.id), "已撤销草稿")) {
                          router.refresh();
                          window.location.reload();
                        }
                      }}
                    >
                      撤销草稿
                    </Button>
                  )}
                  {!pages.length && (
                    <Button
                      color="red"
                      variant="light"
                      onClick={() =>
                        modals.openConfirmModal({
                          title: "删除这个区块？",
                          children: <Text size="sm">它没用在任何页面上；签入后就没有了。</Text>,
                          labels: { confirm: "删除", cancel: "取消" },
                          confirmProps: { color: "red" },
                          onConfirm: async () =>
                            report(await deleteComponentAction(component.id), "区块已删除（签入后生效）") &&
                            router.push("/components/"),
                        })
                      }
                    >
                      删除区块
                    </Button>
                  )}
                </Group>
                <Button onClick={save} loading={busy}>
                  保存
                </Button>
              </Group>
            </Stack>
          </Card>
          <Card withBorder>
            <Title order={2} fz={16} mb="xs">
              用在这些页面上
            </Title>
            {pages.length ? (
              <Group>
                {pages.map((p) => (
                  <Anchor key={p.id} component={Link} href={`/pages/${p.id}`} ff="monospace" size="sm">
                    {p.path}
                  </Anchor>
                ))}
              </Group>
            ) : (
              <Text size="sm" c="dimmed">
                还没用在页面上：在页面的编辑里“加一个已有的区块”。
              </Text>
            )}
            <Title order={2} fz={16} mt="md" mb="xs">
              签入记录
            </Title>
            {history.length ? (
              history.map((h) => (
                <Text key={h.id} size="sm">
                  {h.at} · {h.by}：{h.message}
                </Text>
              ))
            ) : (
              <Text size="sm" c="dimmed">
                还没签入过。
              </Text>
            )}
          </Card>
        </Stack>
      </Grid.Col>
      <Grid.Col span={{ base: 12, xl: 6 }}>
        {preview ? (
          <>
            <Group justify="space-between" mb="xs">
              <Text size="sm" c="dimmed">
                预览（草稿，简体）
              </Text>
              <Anchor href={preview} target="_blank" size="sm">
                在新标签页打开 <IconExternalLink size={12} />
              </Anchor>
            </Group>
            <iframe key={frame} src={preview} title="区块预览" className="cms-preview-frame" />
          </>
        ) : (
          <Text c="dimmed">这个区块没用在页面上，没有预览。</Text>
        )}
      </Grid.Col>
    </Grid>
  );
}
