"use client";
import {
  Anchor,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Stack,
  Table,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { report } from "@/components/result";
import type { Change } from "@/lib/store";
import { checkInAction, discardAction } from "../actions";
import { CHANGE_LABELS } from "../central";

const KIND_NAMES = { page: "页面", component: "区块", global: "全局", text: "文字" } as const;
const link = (c: Change) =>
  c.kind === "page"
    ? `/pages/${c.id}`
    : c.kind === "component"
      ? `/components/${c.id}`
      : c.kind === "global"
        ? `/globals/${c.id}/`
        : "/texts/";

export function CheckinForm({
  pending,
  preview,
  past,
}: {
  pending: Change[];
  preview: string;
  past: { id: number; message: string; by: string; at: string; count: number }[];
}) {
  const router = useRouter();
  const key = (c: Change) => `${c.kind}:${c.id}`;
  const [chosen, setChosen] = useState<Set<string>>(new Set(pending.map(key)));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const toggle = (k: string) => {
    const next = new Set(chosen);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setChosen(next);
  };
  return (
    <Stack gap="lg">
      <div>
        <Title order={1} fz={22}>
          签入
        </Title>
        <Text size="sm" c="dimmed">
          选好要签入的修改，写一句说明。签入后，
          <Anchor href={preview} target="_blank">
            CMS 预览
          </Anchor>
          （“已签入”）马上就是新的；再到“发布”推到预览站和正式站。页面里新加的区块会跟着页面一起签入。
        </Text>
      </div>
      <Card withBorder>
        {pending.length ? (
          <>
            <Group mb="xs">
              <Checkbox
                label={`全选（${pending.length} 项）`}
                checked={chosen.size === pending.length}
                indeterminate={chosen.size > 0 && chosen.size < pending.length}
                onChange={(e) => setChosen(e.currentTarget.checked ? new Set(pending.map(key)) : new Set())}
              />
            </Group>
            <Table verticalSpacing="xs">
              <Table.Tbody>
                {pending.map((c) => (
                  <Table.Tr key={key(c)}>
                    <Table.Td w={40}>
                      <Checkbox
                        aria-label={`签入 ${c.label}`}
                        checked={chosen.has(key(c))}
                        onChange={() => toggle(key(c))}
                      />
                    </Table.Td>
                    <Table.Td w={70}>
                      <Text size="sm">{KIND_NAMES[c.kind]}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Anchor component={Link} href={link(c)} size="sm">
                        {c.label}
                      </Anchor>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        color={c.change === "deleted" ? "red" : c.change === "new" ? "blue" : "yellow"}
                        variant="light"
                      >
                        {CHANGE_LABELS[c.change]}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        onClick={async () => {
                          if (report(await discardAction(c.kind, c.id), "已撤销这项修改")) router.refresh();
                        }}
                      >
                        撤销
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            <Textarea
              mt="md"
              label="签入说明"
              placeholder="例如：首页横幅换了新标语"
              value={message}
              onChange={(e) => setMessage(e.currentTarget.value)}
              autosize
              minRows={2}
            />
            <Group justify="flex-end" mt="md">
              <Button
                disabled={!chosen.size || !message.trim()}
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  const items = pending
                    .filter((c) => chosen.has(key(c)))
                    .map((c) => ({ kind: c.kind, id: c.id }));
                  if (
                    report(
                      await checkInAction(items, message),
                      `已签入 ${items.length} 项：CMS 预览已经是新的`,
                    )
                  ) {
                    setMessage("");
                    router.refresh();
                  }
                  setBusy(false);
                }}
              >
                签入所选的 {chosen.size} 项
              </Button>
            </Group>
          </>
        ) : (
          <Text c="dimmed">没有待签入的修改。</Text>
        )}
      </Card>
      <Card withBorder>
        <Title order={2} fz={18} mb="sm">
          最近的签入
        </Title>
        <Stack gap={4}>
          {past.map((c) => (
            <Text key={c.id} size="sm">
              #{c.id} · {c.at} · {c.by}：{c.message}（{c.count} 项）
            </Text>
          ))}
        </Stack>
      </Card>
    </Stack>
  );
}
