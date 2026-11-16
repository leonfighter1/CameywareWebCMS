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
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { StateBadges } from "@/components/files";
import { report } from "@/components/result";
import type { FileView } from "@/lib/present";
import { createPageAction, rebuildCmsSiteAction } from "./actions";

type PageItem = {
  id: string;
  path: string;
  title: string;
  status: "active" | "inactive";
  deleted: boolean;
  blocks: number;
  file?: FileView;
  updated: string;
};

function NewPage() {
  const t = useTranslations("central");
  const [opened, { open, close }] = useDisclosure();
  const [path, setPath] = useState("/");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const create = async () => {
    setBusy(true);
    const r = await createPageAction(path, { zh: title });
    setBusy(false);
    if (report(r, t("created"))) router.push(`/pages/${r.value}`);
  };
  return (
    <>
      <Button leftSection={<IconPlus size={16} />} onClick={open}>
        {t("newPage")}
      </Button>
      <Modal opened={opened} onClose={close} title={t("newPage")}>
        <Stack>
          <TextInput
            label={t("path")}
            description={t("pathHelp")}
            value={path}
            onChange={(e) => setPath(e.currentTarget.value)}
            data-autofocus
          />
          <TextInput label={t("titleZh")} value={title} onChange={(e) => setTitle(e.currentTarget.value)} />
          <Text size="xs" c="dimmed">
            {t("newPageHelp")}
          </Text>
          <Group justify="flex-end">
            <Button onClick={create} loading={busy}>
              {t("create")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

export function Central({
  me,
  pages,
  types,
  mine,
  workflow,
  preview,
  releases,
  building,
}: {
  me: string;
  pages: PageItem[];
  types: { type: string; label: string; count: number; unused: number }[];
  mine: number;
  workflow: number;
  preview: string;
  releases: { preview?: number; production?: number };
  building: boolean;
}) {
  const t = useTranslations("central");
  const site = useLocale() === "en" ? "en" : "zh";
  const [show, setShow] = useState("all");
  const router = useRouter();
  const shown = pages.filter((p) =>
    show === "all"
      ? true
      : show === "deleted"
        ? p.deleted
        : show === "mine"
          ? p.file?.status === "checked_out" && p.file.owner === me
          : !p.deleted && p.status === show,
  );
  const paths = new Set(pages.map((p) => p.path));
  const depth = (path: string) => (path === "/" ? 0 : path.split("/").length - 2);
  const isFolder = (path: string) =>
    pages.some((p) => p.path !== path && p.path.startsWith(path) && path !== "/");
  return (
    <Stack gap="lg">
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
        <Card withBorder>
          <Text size="sm" c="dimmed">
            {t("myFiles")}
          </Text>
          <Group justify="space-between" mt={4}>
            <Text fz={28} fw={700}>
              {mine}
            </Text>
            <Button component={Link} href="/mine/" variant="light" size="xs">
              {t("open")}
            </Button>
          </Group>
        </Card>
        <Card withBorder>
          <Text size="sm" c="dimmed">
            {t("inWorkflow")}
          </Text>
          <Group justify="space-between" mt={4}>
            <Text fz={28} fw={700}>
              {workflow}
            </Text>
            <Button component={Link} href="/workflow/" variant="light" size="xs">
              {t("open")}
            </Button>
          </Group>
        </Card>
        <Card withBorder>
          <Text size="sm" c="dimmed">
            {t("releases")}
          </Text>
          <Text fz={28} fw={700} mt={4}>
            #{releases.preview ?? "–"} / #{releases.production ?? "–"}
          </Text>
        </Card>
        <Card withBorder>
          <Text size="sm" c="dimmed">
            {t("cmsSite")}
          </Text>
          <Group justify="space-between" mt={4}>
            <Badge color={building ? "yellow" : "green"}>{building ? t("rebuilding") : t("ready")}</Badge>
            <Button
              variant="light"
              size="xs"
              leftSection={<IconRefresh size={14} />}
              disabled={building}
              onClick={async () => {
                if (report(await rebuildCmsSiteAction(), t("rebuildStarted"))) router.refresh();
              }}
            >
              {t("rebuild")}
            </Button>
          </Group>
        </Card>
      </SimpleGrid>

      <Card withBorder>
        <Group justify="space-between" mb="md">
          <Title order={2} fz={20}>
            {t("pages")}
          </Title>
          <Group>
            <SegmentedControl
              size="xs"
              value={show}
              onChange={setShow}
              data={[
                { value: "all", label: t("all") },
                { value: "active", label: t("active") },
                { value: "inactive", label: t("inactive") },
                { value: "mine", label: t("mineOnly") },
                { value: "deleted", label: t("deleted") },
              ]}
            />
            <NewPage />
          </Group>
        </Group>
        <Table.ScrollContainer minWidth={860}>
          <Table highlightOnHover verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("path")}</Table.Th>
                <Table.Th>{t("title")}</Table.Th>
                <Table.Th>{t("status")}</Table.Th>
                <Table.Th>{t("file")}</Table.Th>
                <Table.Th>{t("blocks")}</Table.Th>
                <Table.Th>{t("updated")}</Table.Th>
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
                          {t("noParent")}
                        </Text>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{p.title}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={p.status === "active" ? "green" : "gray"} variant="light">
                      {p.status === "active" ? t("active") : t("inactive")}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <StateBadges file={p.file} me={me} size="xs" />
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
                        href={`${preview}/${site}${p.path}?view=draft`}
                        target="_blank"
                        size="compact-xs"
                        variant="subtle"
                        leftSection={<IconEye size={14} />}
                      >
                        {t("preview")}
                      </Button>
                      <Menu>
                        <Menu.Target>
                          <Button size="compact-xs" variant="subtle" leftSection={<IconDownload size={14} />}>
                            {t("download")}
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
          {t("blocksByType")}
        </Title>
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
          {types.map((x) => (
            <Card key={x.type} withBorder padding="sm" component={Link} href={`/components/?type=${x.type}`}>
              <Text fw={600}>{x.label}</Text>
              <Text size="sm" c="dimmed">
                {x.type} · {t("count", { n: x.count })}
                {x.unused ? ` ${t("unused", { n: x.unused })}` : ""}
              </Text>
            </Card>
          ))}
        </SimpleGrid>
      </Card>
    </Stack>
  );
}
