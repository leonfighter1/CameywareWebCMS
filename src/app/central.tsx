"use client";
import {
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  Menu,
  Modal,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconDownload, IconEye, IconFile, IconFolder, IconPlus, IconRefresh } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { report } from "@/components/result";
import { createPageAction, rebuildCmsSiteAction } from "./actions";

type PageItem = {
  id: string;
  path: string;
  title: string;
  status: "active" | "inactive";
  deleted: boolean;
  blocks: number;
  change?: "new" | "changed" | "deleted";
  updated: string;
};

export const CHANGE_LABELS = {
  new: "新建，未签入",
  changed: "已修改，未签入",
  deleted: "待删除，未签入",
} as const;

function NewPage() {
  const [opened, { open, close }] = useDisclosure();
  const [path, setPath] = useState("/");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const create = async () => {
    setBusy(true);
    const r = await createPageAction(path, { zh: title });
    setBusy(false);
    if (report(r, "页面已新建（停用状态）")) router.push(`/pages/${r.value}`);
  };
  return (
    <>
      <Button leftSection={<IconPlus size={16} />} onClick={open}>
        新建页面
      </Button>
      <Modal opened={opened} onClose={close} title="新建页面">
        <Stack>
          <TextInput
            label="地址"
            description="以 / 开头和结尾，小写字母、数字和连字符，例如 /about-us/ 或 /works/new-app/"
            value={path}
            onChange={(e) => setPath(e.currentTarget.value)}
            data-autofocus
          />
          <TextInput label="标题（简体）" value={title} onChange={(e) => setTitle(e.currentTarget.value)} />
          <Text size="xs" c="dimmed">
            新页面先是停用的：加好区块、检查好，再启用并签入。也可以在“下载与上传”里上传一个页面文件来新建。
          </Text>
          <Group justify="flex-end">
            <Button onClick={create} loading={busy}>
              新建
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

export function Central({
  pages,
  types,
  pending,
  preview,
  releases,
  building,
}: {
  pages: PageItem[];
  types: { type: string; label: string; count: number; unused: number }[];
  pending: number;
  preview: string;
  releases: { preview?: number; production?: number };
  building: boolean;
}) {
  const [show, setShow] = useState("all");
  const router = useRouter();
  const shown = pages.filter((p) =>
    show === "all" ? true : show === "deleted" ? p.deleted : !p.deleted && p.status === show,
  );
  const paths = new Set(pages.map((p) => p.path));
  const depth = (path: string) => (path === "/" ? 0 : path.split("/").length - 2);
  const isFolder = (path: string) =>
    pages.some((p) => p.path !== path && p.path.startsWith(path) && path !== "/");
  return (
    <Stack gap="lg">
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <Card withBorder>
          <Text size="sm" c="dimmed">
            待签入的修改
          </Text>
          <Group justify="space-between" mt={4}>
            <Text fz={28} fw={700}>
              {pending}
            </Text>
            <Button component={Link} href="/checkin/" variant="light" size="xs">
              去签入
            </Button>
          </Group>
        </Card>
        <Card withBorder>
          <Text size="sm" c="dimmed">
            预览站 / 正式站的版本
          </Text>
          <Group justify="space-between" mt={4}>
            <Text fz={28} fw={700}>
              #{releases.preview ?? "–"} / #{releases.production ?? "–"}
            </Text>
            <Button component={Link} href="/deploy/" variant="light" size="xs">
              发布
            </Button>
          </Group>
        </Card>
        <Card withBorder>
          <Text size="sm" c="dimmed">
            CMS 预览站（网站代码改动后要重建；改内容不用）
          </Text>
          <Group justify="space-between" mt={4}>
            <Badge color={building ? "yellow" : "green"}>{building ? "正在重建…" : "可用"}</Badge>
            <Button
              variant="light"
              size="xs"
              leftSection={<IconRefresh size={14} />}
              disabled={building}
              onClick={async () => {
                if (report(await rebuildCmsSiteAction(), "开始重建 CMS 预览站，要几分钟")) router.refresh();
              }}
            >
              重建 CMS 预览站
            </Button>
          </Group>
        </Card>
      </SimpleGrid>

      <Card withBorder>
        <Group justify="space-between" mb="md">
          <Title order={2} fz={20}>
            页面
          </Title>
          <Group>
            <SegmentedControl
              size="xs"
              value={show}
              onChange={setShow}
              data={[
                { value: "all", label: "全部" },
                { value: "active", label: "启用" },
                { value: "inactive", label: "停用" },
                { value: "deleted", label: "待删除" },
              ]}
            />
            <NewPage />
          </Group>
        </Group>
        <Table.ScrollContainer minWidth={760}>
          <Table highlightOnHover verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>地址</Table.Th>
                <Table.Th>标题</Table.Th>
                <Table.Th>状态</Table.Th>
                <Table.Th>区块</Table.Th>
                <Table.Th>最后修改</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {shown.map((p) => (
                <Table.Tr key={p.id} data-testid={`page-row-${p.id}`}>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap" style={{ paddingLeft: depth(p.path) * 18 }}>
                      {isFolder(p.path) ? <IconFolder size={16} /> : <IconFile size={16} />}
                      <Anchor
                        component={Link}
                        href={`/pages/${p.id}`}
                        ff="monospace"
                        size="sm"
                        td={p.deleted ? "line-through" : undefined}
                      >
                        {p.path}
                      </Anchor>
                      {!paths.has(p.path.replace(/[^/]+\/$/, "")) && p.path !== "/" && (
                        <Text size="xs" c="dimmed">
                          （上级没有页面）
                        </Text>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{p.title}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      <Badge color={p.status === "active" ? "green" : "gray"} variant="light">
                        {p.status === "active" ? "启用" : "停用"}
                      </Badge>
                      {p.change && (
                        <Badge color="yellow" variant="light">
                          {CHANGE_LABELS[p.change]}
                        </Badge>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>{p.blocks}</Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed">
                      {p.updated}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} justify="flex-end" wrap="nowrap">
                      <Button
                        component="a"
                        href={`${preview}/zh${p.path}?view=draft`}
                        target="_blank"
                        size="compact-xs"
                        variant="subtle"
                        leftSection={<IconEye size={14} />}
                      >
                        预览
                      </Button>
                      <Menu>
                        <Menu.Target>
                          <Button size="compact-xs" variant="subtle" leftSection={<IconDownload size={14} />}>
                            下载
                          </Button>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item component="a" href={`/api/export?kind=page&id=${p.id}&format=json`}>
                            JSON
                          </Menu.Item>
                          <Menu.Item component="a" href={`/api/export?kind=page&id=${p.id}&format=xml`}>
                            XML
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>

      <Card withBorder>
        <Title order={2} fz={20} mb="md">
          区块，按类型
        </Title>
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
          {types.map((t) => (
            <Card key={t.type} withBorder padding="sm" component={Link} href={`/components/?type=${t.type}`}>
              <Text fw={600}>{t.label}</Text>
              <Text size="sm" c="dimmed">
                {t.type} · {t.count} 个{t.unused ? `（${t.unused} 个没用在页面上）` : ""}
              </Text>
            </Card>
          ))}
        </SimpleGrid>
      </Card>
    </Stack>
  );
}
