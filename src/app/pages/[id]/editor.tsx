"use client";
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Grid,
  Group,
  Menu,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import {
  IconArrowDown,
  IconArrowUp,
  IconDownload,
  IconEdit,
  IconExternalLink,
  IconX,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FieldsEditor } from "@/components/fields";
import { report } from "@/components/result";
import type { L10n } from "@/generated/model";
import {
  addBlockAction,
  deletePageAction,
  discardAction,
  savePageAction,
  setBlocksAction,
} from "../../actions";
import { CHANGE_LABELS } from "../../central";

type Change = keyof typeof CHANGE_LABELS | undefined;

const TEXT_FIELDS = [
  {
    name: "title",
    label: "标题（浏览器标签页和搜索结果上显示）",
    kind: "text",
    localized: true,
    required: true,
  },
  { name: "description", label: "描述（搜索结果里的介绍）", kind: "textarea", localized: true },
];

export function PageEditor({
  page,
  change,
  blocks,
  existing,
  types,
  preview,
  history,
}: {
  page: {
    id: string;
    path: string;
    status: "active" | "inactive";
    width: "normal" | "narrow";
    spacing: "compact" | "roomy";
    title: L10n;
    description: L10n;
    deleted: boolean;
  };
  change: Change;
  blocks: { id: string; type: string; label: string; name: string; change: Change }[];
  existing: { value: string; label: string }[];
  types: { value: string; label: string }[];
  preview: string;
  history: { id: number; at: string; by: string; message: string; deleted: boolean }[];
}) {
  const router = useRouter();
  const [settings, setSettings] = useState(page);
  const [busy, setBusy] = useState(false);
  const [newType, setNewType] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [pick, setPick] = useState<string | null>(null);
  const [frame, setFrame] = useState(0);
  const after = (ok: boolean) => {
    if (ok) {
      router.refresh();
      setFrame((n) => n + 1);
    }
  };
  const save = async () => {
    setBusy(true);
    const { path, status, width, spacing, title, description } = settings;
    after(
      report(
        await savePageAction(page.id, { path, status, width, spacing, title, description }),
        "页面已保存（草稿）",
      ),
    );
    setBusy(false);
  };
  const order = async (next: string[]) => after(report(await setBlocksAction(page.id, next)));
  const ids = blocks.map((b) => b.id);
  const move = (i: number, by: number) => {
    const next = [...ids];
    const [x] = next.splice(i, 1);
    next.splice(i + by, 0, x!);
    order(next);
  };

  if (page.deleted)
    return (
      <Alert color="yellow" title={`页面 ${page.path} 已删除，还没签入`}>
        <Group mt="sm">
          <Button onClick={async () => after(report(await discardAction("page", page.id), "已恢复"))}>
            撤销删除
          </Button>
          <Button component={Link} href="/checkin/" variant="default">
            去签入
          </Button>
        </Group>
      </Alert>
    );

  return (
    <Grid gap="lg">
      <Grid.Col span={{ base: 12, xl: 6 }}>
        <Stack gap="lg">
          <Group justify="space-between">
            <Group gap="xs">
              <Title order={1} fz={22} ff="monospace">
                {page.path}
              </Title>
              {change && <Badge color="yellow">{CHANGE_LABELS[change]}</Badge>}
            </Group>
            <Group gap="xs">
              <Menu>
                <Menu.Target>
                  <Button variant="default" size="xs" leftSection={<IconDownload size={14} />}>
                    下载
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item component="a" href={`/api/export?kind=page&id=${page.id}&format=json`}>
                    页面和区块（JSON）
                  </Menu.Item>
                  <Menu.Item component="a" href={`/api/export?kind=page&id=${page.id}&format=xml`}>
                    页面和区块（XML）
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
              {change && (
                <Button
                  variant="default"
                  size="xs"
                  onClick={async () => {
                    const r = await discardAction("page", page.id);
                    if (report(r, "已撤销这个页面的草稿"))
                      router.push(change === "new" ? "/" : `/pages/${page.id}`);
                    router.refresh();
                  }}
                >
                  撤销草稿
                </Button>
              )}
              <Button
                color="red"
                variant="light"
                size="xs"
                onClick={() =>
                  modals.openConfirmModal({
                    title: `删除页面 ${page.path}？`,
                    children: (
                      <Text size="sm">签入后，这个地址在网站上就没有了；区块留着，可以用在别的页面。</Text>
                    ),
                    labels: { confirm: "删除", cancel: "取消" },
                    confirmProps: { color: "red" },
                    onConfirm: async () =>
                      after(report(await deletePageAction(page.id), "页面已删除（签入后生效）")),
                  })
                }
              >
                删除页面
              </Button>
            </Group>
          </Group>

          <Card withBorder>
            <Stack>
              <Title order={2} fz={18}>
                页面设置
              </Title>
              <TextInput
                label="地址"
                description="改了地址，原来的地址就没有这个页面了"
                value={settings.path}
                onChange={(e) => setSettings({ ...settings, path: e.currentTarget.value })}
                ff="monospace"
              />
              <Switch
                label="启用（正式站上显示；停用的页面只在 CMS 预览里看得到）"
                checked={settings.status === "active"}
                onChange={(e) =>
                  setSettings({ ...settings, status: e.currentTarget.checked ? "active" : "inactive" })
                }
              />
              <Group grow>
                <Select
                  label="宽度"
                  data={[
                    { value: "normal", label: "正常" },
                    { value: "narrow", label: "窄（适合文字多的页面）" },
                  ]}
                  value={settings.width}
                  onChange={(v) => setSettings({ ...settings, width: (v ?? "normal") as "normal" })}
                />
                <Select
                  label="上下留白"
                  data={[
                    { value: "compact", label: "正常" },
                    { value: "roomy", label: "宽松（首页）" },
                  ]}
                  value={settings.spacing}
                  onChange={(v) => setSettings({ ...settings, spacing: (v ?? "compact") as "compact" })}
                />
              </Group>
              <FieldsEditor
                fields={TEXT_FIELDS}
                value={{ title: settings.title, description: settings.description }}
                ctx={{ works: [], icons: [] }}
                onChange={(v) =>
                  setSettings({ ...settings, title: v.title as L10n, description: v.description as L10n })
                }
              />
              <Group justify="flex-end">
                <Button onClick={save} loading={busy}>
                  保存页面设置
                </Button>
              </Group>
            </Stack>
          </Card>

          <Card withBorder>
            <Title order={2} fz={18} mb="sm">
              区块（从上到下）
            </Title>
            <Stack gap="xs">
              {blocks.map((b, i) => (
                <Card key={b.id} withBorder padding="xs" data-testid={`block-${b.id}`}>
                  <Group justify="space-between" wrap="nowrap">
                    <div>
                      <Group gap={6}>
                        <Text fw={600} size="sm">
                          {b.label}
                        </Text>
                        {b.change && (
                          <Badge size="xs" color="yellow" variant="light">
                            {CHANGE_LABELS[b.change]}
                          </Badge>
                        )}
                      </Group>
                      <Text size="xs" c="dimmed">
                        {b.name || b.id}
                      </Text>
                    </div>
                    <Group gap={4} wrap="nowrap">
                      <Button
                        component={Link}
                        href={`/components/${b.id}?page=${page.id}`}
                        size="compact-xs"
                        variant="light"
                        leftSection={<IconEdit size={14} />}
                      >
                        编辑
                      </Button>
                      <ActionIcon
                        variant="subtle"
                        aria-label="上移"
                        disabled={i === 0}
                        onClick={() => move(i, -1)}
                      >
                        <IconArrowUp size={16} />
                      </ActionIcon>
                      <ActionIcon
                        variant="subtle"
                        aria-label="下移"
                        disabled={i === blocks.length - 1}
                        onClick={() => move(i, 1)}
                      >
                        <IconArrowDown size={16} />
                      </ActionIcon>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        aria-label="移出这个页面"
                        onClick={() => order(ids.filter((x) => x !== b.id))}
                      >
                        <IconX size={16} />
                      </ActionIcon>
                    </Group>
                  </Group>
                </Card>
              ))}
              {!blocks.length && <Text c="dimmed">这个页面还没有区块。</Text>}
            </Stack>
            <Stack mt="md" gap="xs">
              <Group align="flex-end" grow>
                <Select
                  label="加一个新区块"
                  placeholder="选类型"
                  data={types}
                  value={newType}
                  onChange={setNewType}
                  searchable
                />
                <TextInput
                  label="区块名（自己看的）"
                  value={newName}
                  onChange={(e) => setNewName(e.currentTarget.value)}
                />
                <Button
                  disabled={!newType}
                  onClick={async () => {
                    const r = await addBlockAction(page.id, { type: newType!, name: newName });
                    if (report(r, "已加到页面最后；点“编辑”填内容")) {
                      setNewName("");
                      after(true);
                    }
                  }}
                >
                  加到最后
                </Button>
              </Group>
              {!!existing.length && (
                <Group align="flex-end" grow>
                  <Select
                    label="或者加一个已有的区块"
                    data={existing}
                    value={pick}
                    onChange={setPick}
                    searchable
                  />
                  <Button
                    variant="light"
                    disabled={!pick}
                    onClick={async () => {
                      if (report(await addBlockAction(page.id, { existing: pick! }), "已加到页面最后")) {
                        setPick(null);
                        after(true);
                      }
                    }}
                  >
                    加到最后
                  </Button>
                </Group>
              )}
            </Stack>
          </Card>

          <Card withBorder>
            <Title order={2} fz={18} mb="sm">
              签入记录
            </Title>
            {history.length ? (
              <Stack gap={4}>
                {history.map((h) => (
                  <Text key={h.id} size="sm">
                    {h.at} · {h.by} · {h.deleted ? "删除" : "签入"}：{h.message}
                  </Text>
                ))}
              </Stack>
            ) : (
              <Text size="sm" c="dimmed">
                还没签入过。
              </Text>
            )}
          </Card>
        </Stack>
      </Grid.Col>
      <Grid.Col span={{ base: 12, xl: 6 }}>
        <Group justify="space-between" mb="xs">
          <Text size="sm" c="dimmed">
            预览（草稿，简体）
          </Text>
          <Anchor href={preview} target="_blank" size="sm">
            在新标签页打开 <IconExternalLink size={12} />
          </Anchor>
        </Group>
        <iframe key={frame} src={preview} title="页面预览" className="cms-preview-frame" />
      </Grid.Col>
    </Grid>
  );
}
