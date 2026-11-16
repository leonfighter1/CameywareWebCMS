"use client";
import { Badge, Button, Card, Group, Menu, SegmentedControl, Stack, Text, Title } from "@mantine/core";
import { IconArrowBack, IconDownload } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { type Context, FieldsEditor } from "@/components/fields";
import { report } from "@/components/result";
import type { GlobalDef } from "@/lib/catalog";
import { discardAction, saveGlobalAction } from "../../actions";

export function GlobalEditor({
  name,
  def,
  all,
  data,
  changed,
  ctx,
  back,
}: {
  name: string;
  def: GlobalDef;
  all: { key: string; label: string }[];
  data: Record<string, unknown>;
  changed: boolean;
  ctx: Context;
  back?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(data);
  const [busy, setBusy] = useState(false);
  return (
    <Stack gap="lg">
      <SegmentedControl
        value={name}
        onChange={(k) => router.push(`/globals/${k}/`)}
        data={all.map((g) => ({ value: g.key, label: g.label }))}
        style={{ alignSelf: "flex-start" }}
      />
      <Group justify="space-between">
        <div>
          <Group gap="xs">
            <Title order={1} fz={22}>
              {def.label}
            </Title>
            {changed && <Badge color="yellow">已修改，未签入</Badge>}
          </Group>
          <Text size="sm" c="dimmed">
            {def.description}
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
              <Menu.Item component="a" href={`/api/export?kind=global&id=${name}&format=json`}>
                JSON
              </Menu.Item>
              <Menu.Item component="a" href={`/api/export?kind=global&id=${name}&format=xml`}>
                XML
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>
      <Card withBorder maw={1100}>
        <Stack>
          <FieldsEditor fields={def.fields} value={value} onChange={setValue} ctx={ctx} />
          <Group justify="flex-end">
            {changed && (
              <Button
                variant="default"
                onClick={async () => {
                  if (report(await discardAction("global", name), "已撤销草稿")) window.location.reload();
                }}
              >
                撤销草稿
              </Button>
            )}
            <Button
              loading={busy}
              onClick={async () => {
                setBusy(true);
                if (report(await saveGlobalAction(name, value), "已保存（草稿）")) router.refresh();
                setBusy(false);
              }}
            >
              保存
            </Button>
          </Group>
        </Stack>
      </Card>
    </Stack>
  );
}
