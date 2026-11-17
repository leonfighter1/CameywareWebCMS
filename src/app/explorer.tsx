"use client";
/**
 * The explorer (page.tsx): the tree at the left, the folder chosen at the right (its files, or its folders), and at the
 * root who is doing what. The steps on ticked files are the ones each editor's bar has (files.tsx), several at once.
 */
import {
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Flex,
  Group,
  Modal,
  Pagination,
  Radio,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tree,
  type TreeNodeData,
  UnstyledButton,
  getTreeExpandedState,
  useTree,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconArrowsExchange,
  IconChevronDown,
  IconChevronRight,
  IconCode,
  IconFolder,
  IconFolderOpen,
  IconLayoutDashboard,
  IconPlus,
  IconRefresh,
  IconSearch,
} from "@tabler/icons-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { confirm, isMine, jobModal, StateBadges } from "@/components/files";
import { PageTransfer } from "@/components/page-transfer";
import { report } from "@/components/result";
import type { FileView } from "@/lib/present";
import {
  createComponentAction,
  createPageAction,
  createLayoutAction,
  createTemplateAction,
  discardAction,
  putBackAction,
  rebuildCmsSiteAction,
  takeAction,
} from "./actions";
import { NEW_TAB } from "@/components/links";

/** A row of a folder: a file (or a type's built-in template) with what the list says of it. */
export type Entry = {
  key: string;
  folder: string;
  name: string;
  href: string;
  file?: FileView;
  /** Shown in monospace: a page's address, a bundle's name. */
  mono?: boolean;
  /** A page: its title, whether it is active, its blocks, its layout's name. */
  title?: string;
  active?: boolean;
  blocks?: number;
  layout?: string;
  /** A block: the pages it is on. */
  pages?: number;
  /** A template (or a type's built-in one): the places on pages that use it. */
  uses?: number;
  /** A layout (or a built-in one): the pages in it. */
  laidOut?: number;
  /** A bundle: its texts. */
  texts?: number;
  /** A type's built-in view, or a built-in page layout: code, not a file. */
  builtin?: "template" | "layout";
};

type Type = { type: string; label: string };
type T = ReturnType<typeof useTranslations<"explorer">>;

const PER_PAGE = ["20", "50", "100"];

/** The tree, by its folders' paths ("content/components/hero_banner"). */
function treeOf(types: Type[], t: T): TreeNodeData[] {
  return [
    { value: "", label: t("tree.all") },
    {
      value: "content",
      label: t("tree.content"),
      children: [
        { value: "content/pages", label: t("tree.pages") },
        {
          value: "content/components",
          label: t("tree.components"),
          children: types.map((x) => ({ value: `content/components/${x.type}`, label: x.label })),
        },
        {
          value: "content/common",
          label: t("tree.common"),
          children: [
            { value: "content/common/bundles", label: t("tree.bundles") },
            { value: "content/common/globals", label: t("tree.globals") },
          ],
        },
      ],
    },
    {
      value: "views",
      label: t("tree.views"),
      children: [
        {
          value: "views/styles",
          label: t("tree.styles"),
          children: types.map((x) => ({ value: `views/styles/${x.type}`, label: x.label })),
        },
        { value: "views/layouts", label: t("tree.layouts") },
      ],
    },
  ];
}

/** Every node by its path, with its label and its children. */
function nodesOf(data: TreeNodeData[], out = new Map<string, TreeNodeData>()) {
  for (const n of data) {
    out.set(n.value, n);
    if (n.children) nodesOf(n.children, out);
  }
  return out;
}

const within = (folder: string, at: string) => at === "" || folder === at || folder.startsWith(`${at}/`);

/** The folders from the root down to [at]: "content/components/x" → ["content", "content/components", …]. */
const lineOf = (at: string) => at.split("/").map((_, i, all) => all.slice(0, i + 1).join("/"));

export function Explorer({
  me,
  at,
  entries,
  types,
  layouts,
  preview,
  releases,
  building,
}: {
  me: string;
  at: string;
  entries: Entry[];
  types: Type[];
  /** The built-in layouts: where a new one starts from. */
  layouts: { name: string; label: string }[];
  preview: string;
  releases: { preview?: number; production?: number };
  building: boolean;
}) {
  const t = useTranslations("explorer");
  const router = useRouter();
  const data = useMemo(() => treeOf(types, t), [types, t]);
  const nodes = useMemo(() => nodesOf(data), [data]);
  const here = nodes.has(at) ? at : "";
  const tree = useTree({
    initialExpandedState: getTreeExpandedState(data, ["content", "views", "views/styles", ...lineOf(here)]),
    initialSelectedState: [here],
  });
  const files = entries.filter((e) => !e.builtin);
  // A style folder counts its built-in template too (every type has one), the layouts' its built-in layouts.
  const count = (folder: string) => entries.filter((e) => within(e.folder, folder)).length;
  const busy = (folder: string) =>
    files.filter((e) => within(e.folder, folder) && e.file && e.file.status !== "available").length;
  const open = (value: string) => {
    tree.setSelectedState([value]);
    router.push(value ? `/?at=${encodeURIComponent(value)}` : "/");
  };
  return (
    <Flex gap="xl" align="flex-start" direction={{ base: "column", md: "row" }}>
      {/* The tree alone at the left (as Bell's CMS.Net): a column of its own, scrolling by itself under the top bar. */}
      <Card
        withBorder
        p="xs"
        w={{ base: "100%", md: 300 }}
        pos={{ base: "static", md: "sticky" }}
        top={84}
        mah={{ base: 360, md: "calc(100vh - 108px)" }}
        style={{ flexShrink: 0, overflowY: "auto" }}
        data-testid="tree"
      >
        <Tree
          data={data}
          tree={tree}
          levelOffset="md"
          expandOnClick={false}
          renderNode={({ node, expanded, hasChildren, elementProps, selected }) => (
            <Group gap={4} wrap="nowrap" {...elementProps} data-testid={`tree-${node.value || "all"}`}>
              <UnstyledButton
                aria-label={expanded ? t("collapse") : t("expand")}
                onClick={(e) => {
                  e.stopPropagation();
                  if (hasChildren) tree.toggleExpanded(node.value);
                }}
                style={{ width: 16, visibility: hasChildren ? "visible" : "hidden" }}
              >
                {expanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
              </UnstyledButton>
              <UnstyledButton
                onClick={() => open(node.value)}
                style={{ flex: 1, minWidth: 0 }}
                aria-current={selected ? "page" : undefined}
              >
                <Group
                  gap={6}
                  wrap="nowrap"
                  py={3}
                  px={4}
                  style={{ borderRadius: 6 }}
                  bg={selected ? "var(--mantine-color-blue-light)" : undefined}
                >
                  {node.value === "" ? (
                    <IconLayoutDashboard size={16} />
                  ) : expanded ? (
                    <IconFolderOpen size={16} />
                  ) : (
                    <IconFolder size={16} />
                  )}
                  <Text size="sm" truncate fw={selected ? 600 : undefined} style={{ flex: 1 }}>
                    {node.label}
                  </Text>
                  {node.value !== "" && (
                    <Group gap={2} wrap="nowrap">
                      {busy(node.value) > 0 && (
                        <Badge size="xs" color="orange" variant="light">
                          {busy(node.value)}
                        </Badge>
                      )}
                      <Badge size="xs" color="gray" variant="light">
                        {count(node.value)}
                      </Badge>
                    </Group>
                  )}
                </Group>
              </UnstyledButton>
            </Group>
          )}
        />
      </Card>
      <Box w="100%" style={{ flex: 1, minWidth: 0 }}>
        {here === "" ? (
          <Dashboard me={me} entries={files} releases={releases} building={building} preview={preview} />
        ) : (
          <Folder
            key={here}
            me={me}
            at={here}
            nodes={nodes}
            entries={entries.filter((e) => e.folder === here)}
            count={count}
            types={types}
            layouts={layouts}
            all={entries}
            open={open}
          />
        )}
      </Box>
    </Flex>
  );
}

// ---- a folder ----------------------------------------------------------------------------------------------------

function Folder({
  me,
  at,
  nodes,
  entries,
  count,
  types,
  layouts,
  all,
  open,
}: {
  me: string;
  at: string;
  nodes: Map<string, TreeNodeData>;
  entries: Entry[];
  count: (folder: string) => number;
  types: Type[];
  layouts: { name: string; label: string }[];
  all: Entry[];
  open: (value: string) => void;
}) {
  const t = useTranslations("explorer");
  const node = nodes.get(at)!;
  const path = lineOf(at).map((v) => String(nodes.get(v)?.label ?? v));
  const [kind, type] = at.startsWith("content/components/")
    ? (["content", at.slice("content/components/".length)] as const)
    : at.startsWith("views/styles/")
      ? (["views", at.slice("views/styles/".length)] as const)
      : [undefined, undefined];
  const label = types.find((x) => x.type === type)?.label ?? type ?? "";
  return (
    <Stack gap="lg">
      <div>
        <Text size="xs" c="dimmed" ff="monospace" data-testid="folder-path">
          /{path.join("/")}
        </Text>
        <Group justify="space-between" gap="sm">
          <Title order={1} fz={24}>
            {String(node.label)}
          </Title>
          {kind === "content" && (
            <Button
              variant="light"
              size="xs"
              leftSection={<IconArrowsExchange size={14} />}
              onClick={() => open(`views/styles/${type}`)}
              data-testid="matched-path"
            >
              {t("matchedStyles", {
                label,
                n: all.filter((e) => e.folder === `views/styles/${type}`).length,
              })}
            </Button>
          )}
          {kind === "views" && (
            <Button
              variant="light"
              size="xs"
              leftSection={<IconArrowsExchange size={14} />}
              onClick={() => open(`content/components/${type}`)}
              data-testid="matched-path"
            >
              {t("matchedContent", { label, n: count(`content/components/${type}`) })}
            </Button>
          )}
        </Group>
        <Text size="sm" c="dimmed">
          {t(`about.${aboutKey(at)}`)}
        </Text>
      </div>
      {node.children?.length ? (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          {node.children.map((c) => (
            <Card
              key={c.value}
              withBorder
              padding="sm"
              component="button"
              onClick={() => open(c.value)}
              style={{ textAlign: "start", cursor: "pointer" }}
            >
              <Group gap="xs" wrap="nowrap">
                <IconFolder size={18} />
                <Text fw={600} size="sm" style={{ flex: 1 }}>
                  {String(c.label)}
                </Text>
                <Badge size="sm" color="gray" variant="light">
                  {count(c.value)}
                </Badge>
              </Group>
            </Card>
          ))}
        </SimpleGrid>
      ) : (
        <FileList me={me} at={at} type={type} entries={entries} all={all} layouts={layouts} />
      )}
    </Stack>
  );
}

/** Each folder's explanation (messages explorer.about), by its place in the tree. */
const ABOUT = {
  content: "content",
  "content/pages": "pages",
  "content/components": "components",
  "content/common": "common",
  "content/common/bundles": "bundles",
  "content/common/globals": "globals",
  views: "views",
  "views/styles": "styles",
  "views/layouts": "layouts",
} as const;

function aboutKey(at: string): (typeof ABOUT)[keyof typeof ABOUT] | "componentType" | "styleType" {
  if (at.startsWith("content/components/")) return "componentType";
  if (at.startsWith("views/styles/")) return "styleType";
  return ABOUT[at as keyof typeof ABOUT] ?? "content";
}

type StateFilter = "all" | "available" | "mine" | "theirs" | "checkedIn" | "preview" | "fresh" | "changed";

const STATES: StateFilter[] = [
  "all",
  "available",
  "mine",
  "theirs",
  "checkedIn",
  "preview",
  "fresh",
  "changed",
];

function stateIs(f: FileView | undefined, s: StateFilter, me: string) {
  if (s === "all") return true;
  if (!f) return false;
  return {
    available: f.status === "available",
    mine: isMine(f, me),
    theirs: f.status === "checked_out" && f.owner !== me,
    checkedIn: f.status === "in_workflow" && f.stage === "checked_in",
    preview: f.status === "in_workflow" && f.stage === "preview",
    fresh: f.fresh,
    changed: !!f.change,
  }[s];
}

/** A folder's files: filters, the steps on the ticked ones, the list in pages. */
function FileList({
  me,
  at,
  type,
  entries,
  all,
  layouts,
}: {
  me: string;
  at: string;
  type?: string;
  entries: Entry[];
  all: Entry[];
  layouts: { name: string; label: string }[];
}) {
  const t = useTranslations("explorer");
  const tf = useTranslations("files");
  const router = useRouter();
  const [q, setQ] = useState("");
  const [state, setState] = useState<StateFilter>("all");
  const [person, setPerson] = useState<string | null>(null);
  const [sort, setSort] = useState<"at" | "name">("at");
  const [per, setPer] = useState("20");
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const people = [
    ...new Set(entries.flatMap((e) => [e.file?.by, e.file?.owner]).filter(Boolean) as string[]),
  ].sort();
  const shown = entries
    .filter(
      (e) =>
        (!q || `${e.name} ${e.title ?? ""} ${e.file?.id ?? ""}`.toLowerCase().includes(q.toLowerCase())) &&
        stateIs(e.file, state, me) &&
        (!person || e.file?.by === person || e.file?.owner === person),
    )
    .sort((a, b) =>
      a.builtin
        ? -1
        : b.builtin
          ? 1
          : sort === "name"
            ? a.name.localeCompare(b.name)
            : (b.file?.atTime ?? 0) - (a.file?.atTime ?? 0),
    );
  const size = Number(per);
  const pages = Math.max(1, Math.ceil(shown.length / size));
  const now = Math.min(page, pages);
  const rows = shown.slice((now - 1) * size, now * size);
  const chosen = entries.filter((e) => e.file && picked.has(e.key)).map((e) => e.file!);
  const items = (fs: FileView[]) => fs.map((f) => ({ kind: f.kind, id: f.id }));
  const free = chosen.filter((f) => f.status === "available" && !f.busy);
  const theirs = chosen.filter((f) => f.status === "checked_out" && f.owner !== me);
  const mine = chosen.filter((f) => isMine(f, me));
  const done = (ok: boolean) => {
    if (!ok) return;
    setPicked(new Set());
    router.refresh();
  };
  const pickable = rows.filter((r) => r.file && !r.file.busy);
  const allPicked = pickable.length > 0 && pickable.every((r) => picked.has(r.key));
  const set = (keys: string[], on: boolean) => {
    const next = new Set(picked);
    for (const k of keys)
      if (on) next.add(k);
      else next.delete(k);
    setPicked(next);
  };
  return (
    <Stack gap="sm">
      <Group gap="xs" wrap="wrap" data-testid="toolbar">
        <NewFile at={at} type={type} all={all} layouts={layouts} />
        <Button
          size="xs"
          disabled={!free.length}
          onClick={async () => done(report(await takeAction(items(free)), tf("taken")))}
        >
          {t("withCount", { label: tf("take"), n: free.length })}
        </Button>
        <Button
          size="xs"
          color="orange"
          variant="light"
          disabled={!theirs.length}
          onClick={() =>
            confirm({
              title: tf("takeOverTitle"),
              body: t("takeOverMany", { n: theirs.length }),
              label: tf("takeOver"),
              cancel: tf("cancel"),
              run: async () => done(report(await takeAction(items(theirs), true), tf("taken"))),
            })
          }
        >
          {t("withCount", { label: tf("takeOver"), n: theirs.length })}
        </Button>
        <Button
          size="xs"
          variant="light"
          disabled={!mine.length}
          onClick={() =>
            jobModal(
              mine.map((f) => ({ kind: f.kind, id: f.id, label: f.label })),
              tf,
              () => done(true),
            )
          }
        >
          {t("withCount", { label: tf("checkIn"), n: mine.length })}
        </Button>
        <Button
          size="xs"
          variant="default"
          disabled={!mine.length}
          onClick={async () => done(report(await putBackAction(items(mine)), tf("putBackDone")))}
        >
          {t("withCount", { label: tf("putBack"), n: mine.length })}
        </Button>
        <Button
          size="xs"
          variant="light"
          color="red"
          disabled={!mine.length}
          onClick={() =>
            confirm({
              title: tf("discardTitle", { n: mine.length }),
              body: tf("discardBody"),
              label: tf("discard"),
              cancel: tf("cancel"),
              danger: true,
              run: async () => done(report(await discardAction(items(mine)), tf("discarded"))),
            })
          }
        >
          {t("withCount", { label: tf("discard"), n: mine.length })}
        </Button>
        {at === "content/pages" && (
          <PageTransfer picked={chosen.filter((f) => f.kind === "page")} done={() => done(true)} />
        )}
        <Button
          size="xs"
          variant="subtle"
          leftSection={<IconRefresh size={14} />}
          onClick={() => router.refresh()}
        >
          {t("refresh")}
        </Button>
      </Group>
      <Group gap="xs" wrap="wrap">
        <TextInput
          size="xs"
          leftSection={<IconSearch size={14} />}
          placeholder={t("search")}
          value={q}
          onChange={(e) => {
            setQ(e.currentTarget.value);
            setPage(1);
          }}
        />
        <Select
          size="xs"
          aria-label={t("stateFilter")}
          data={STATES.map((s) => ({ value: s, label: t(`states.${s}`) }))}
          value={state}
          onChange={(v) => {
            setState((v as StateFilter) ?? "all");
            setPage(1);
          }}
          allowDeselect={false}
          w={170}
        />
        <Select
          size="xs"
          placeholder={t("person")}
          aria-label={t("person")}
          data={people}
          value={person}
          onChange={(v) => {
            setPerson(v);
            setPage(1);
          }}
          clearable
          w={150}
        />
        <Text size="xs" c="dimmed">
          {t("count", { n: shown.filter((e) => !e.builtin).length })}
          {picked.size ? ` · ${t("picked", { n: picked.size })}` : ""}
        </Text>
      </Group>
      <Card withBorder p={0}>
        <Table.ScrollContainer minWidth={760}>
          <Table verticalSpacing={6} highlightOnHover data-testid="file-list">
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={36}>
                  <Checkbox
                    aria-label={tf("pickAll")}
                    checked={allPicked}
                    indeterminate={!allPicked && pickable.some((r) => picked.has(r.key))}
                    onChange={(e) =>
                      set(
                        pickable.map((r) => r.key),
                        e.currentTarget.checked,
                      )
                    }
                  />
                </Table.Th>
                <Table.Th>
                  <UnstyledButton onClick={() => setSort("name")} fw={sort === "name" ? 700 : 600} fz="sm">
                    {t("columns.name")}
                  </UnstyledButton>
                </Table.Th>
                <Table.Th>{t("columns.state")}</Table.Th>
                <Table.Th>{t("columns.about")}</Table.Th>
                <Table.Th style={{ whiteSpace: "nowrap" }}>
                  <UnstyledButton onClick={() => setSort("at")} fw={sort === "at" ? 700 : 600} fz="sm">
                    {t("columns.at")} {sort === "at" ? "▾" : ""}
                  </UnstyledButton>
                </Table.Th>
                <Table.Th>{t("columns.by")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((e) => (
                <Table.Tr key={e.key} data-testid={`row-${e.key}`}>
                  <Table.Td>
                    {e.file && (
                      <Checkbox
                        aria-label={e.name || e.key}
                        checked={picked.has(e.key)}
                        disabled={e.file.busy}
                        onChange={(ev) => set([e.key], ev.currentTarget.checked)}
                      />
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap">
                      {e.builtin && <IconCode size={14} />}
                      <Anchor
                        component={Link}
                        {...NEW_TAB}
                        href={e.href}
                        size="sm"
                        ff={e.mono ? "monospace" : undefined}
                        td={e.file?.deleted ? "line-through" : undefined}
                      >
                        {e.builtin === "template" ? t("builtinName") : e.name}
                      </Anchor>
                    </Group>
                    {e.title && (
                      <Text size="xs" c="dimmed">
                        {e.title}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {e.builtin && !e.file ? (
                      <Badge size="xs" color="gray" variant="outline" style={{ minWidth: "max-content" }}>
                        {t("builtinState")}
                      </Badge>
                    ) : (
                      <StateBadges file={e.file} me={me} size="xs" />
                    )}
                  </Table.Td>
                  <Table.Td>
                    <About e={e} t={t} />
                  </Table.Td>
                  <Table.Td style={{ whiteSpace: "nowrap" }}>
                    <Text size="xs">{e.file?.at ?? "—"}</Text>
                  </Table.Td>
                  <Table.Td>
                    {e.file ? (
                      <Stack gap={0}>
                        <Text size="xs">{e.file.by || "—"}</Text>
                        <Anchor
                          component={Link}
                          {...NEW_TAB}
                          href={`${e.href}${e.href.includes("?") ? "&" : "?"}versions=1`}
                          size="xs"
                        >
                          {t("history")}
                        </Anchor>
                      </Stack>
                    ) : (
                      <Text size="xs" c="dimmed">
                        —
                      </Text>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {!rows.length && (
          <Text size="sm" c="dimmed" p="md">
            {entries.length ? t("noMatch") : t("empty")}
          </Text>
        )}
      </Card>
      <Group justify="space-between">
        <Group gap="xs">
          <Text size="xs" c="dimmed">
            {t("perPage")}
          </Text>
          <Select
            size="xs"
            data={PER_PAGE}
            value={per}
            onChange={(v) => {
              setPer(v ?? "20");
              setPage(1);
            }}
            allowDeselect={false}
            w={80}
            aria-label={t("perPage")}
          />
        </Group>
        {pages > 1 && <Pagination size="sm" total={pages} value={now} onChange={setPage} />}
      </Group>
    </Stack>
  );
}

/**
 * What the list says of a row: a page's state, layout and blocks; a block's pages; a template's places; a layout's pages;
 * a bundle's texts.
 */
function About({ e, t }: { e: Entry; t: T }) {
  const parts: string[] = [];
  if (e.active !== undefined) parts.push(e.active ? t("active") : t("inactive"));
  if (e.layout) parts.push(t("inLayout", { name: e.layout }));
  if (e.blocks !== undefined) parts.push(t("blocks", { n: e.blocks }));
  if (e.pages !== undefined) parts.push(e.pages ? t("onPages", { n: e.pages }) : t("onNoPage"));
  if (e.uses !== undefined) parts.push(t("uses", { n: e.uses }));
  if (e.laidOut !== undefined) parts.push(t("laidOut", { n: e.laidOut }));
  if (e.texts !== undefined) parts.push(t("texts", { n: e.texts }));
  if (e.builtin) parts.push(t(e.builtin === "layout" ? "builtinLayoutAbout" : "builtinAbout"));
  return (
    <Text size="xs" c="dimmed">
      {parts.join(" · ")}
    </Text>
  );
}

// ---- new files ---------------------------------------------------------------------------------------------------

/** 新建 for the folder: a page, a block of its type, a template of its type, a page layout. */
function NewFile({
  at,
  type,
  all,
  layouts,
}: {
  at: string;
  type?: string;
  all: Entry[];
  layouts: { name: string; label: string }[];
}) {
  const t = useTranslations("explorer");
  const router = useRouter();
  const [opened, { open, close }] = useDisclosure();
  const [path, setPath] = useState("/");
  const [name, setName] = useState("");
  const what =
    at === "content/pages"
      ? "page"
      : at.startsWith("content/components/")
        ? "block"
        : at.startsWith("views/styles/")
          ? "template"
          : at === "views/layouts"
            ? "layout"
            : undefined;
  const [from, setFrom] = useState(what === "layout" ? "standard" : "starter");
  const [busy, setBusy] = useState(false);
  if (!what) return null;
  const copies = all.filter((e) => e.folder === at && !e.builtin && e.file);
  const create = async () => {
    setBusy(true);
    if (what === "page") {
      const r = await createPageAction(path, { zh: name }, from === "starter" ? undefined : from);
      if (report(r, t("createdPage"))) router.push(`/pages/${r.value}`);
    } else if (what === "block") {
      const r = await createComponentAction(type!, name);
      if (report(r, t("createdBlock"))) router.push(`/components/${r.value}`);
    } else if (what === "layout") {
      const r = await createLayoutAction(name, from);
      if (report(r, t("createdLayout"))) router.push(`/layouts/${r.value}`);
    } else {
      const r = await createTemplateAction(type!, name, from === "starter" ? undefined : from);
      if (report(r, t("createdTemplate"))) router.push(`/templates/${r.value}`);
    }
    setBusy(false);
  };
  return (
    <>
      <Button
        size="xs"
        variant="filled"
        color="dark"
        leftSection={<IconPlus size={14} />}
        onClick={open}
        data-testid="new-file"
      >
        {t(`new.${what}`)}
      </Button>
      <Modal opened={opened} onClose={close} title={t(`new.${what}`)}>
        <Stack>
          {what === "page" && (
            <TextInput
              label={t("path")}
              description={t("pathHelp")}
              value={path}
              onChange={(e) => setPath(e.currentTarget.value)}
              data-autofocus
            />
          )}
          <TextInput
            label={
              what === "page"
                ? t("titleZh")
                : what === "block"
                  ? t("blockName")
                  : what === "layout"
                    ? t("layoutName")
                    : t("templateName")
            }
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            data-autofocus={what !== "page" ? true : undefined}
          />
          {what === "layout" && (
            <Radio.Group label={t("startFrom")} value={from} onChange={setFrom}>
              <Stack gap={6} mt={4}>
                {layouts.map((l) => (
                  <Radio key={l.name} value={l.name} label={t("fromBuiltinLayout", { name: l.label })} />
                ))}
                {copies.map((c) => (
                  <Radio key={c.key} value={c.file!.id} label={t("fromCopy", { name: c.name })} />
                ))}
              </Stack>
            </Radio.Group>
          )}
          {what === "page" && !!copies.length && (
            <Radio.Group label={t("startFrom")} value={from} onChange={setFrom}>
              <Stack gap={6} mt={4} mah={220} style={{ overflow: "auto" }}>
                <Radio value="starter" label={t("blankPage")} />
                {copies.map((c) => (
                  <Radio
                    key={c.key}
                    value={c.file!.id}
                    label={t("fromCopy", { name: `${c.name} (${c.title ?? ""})` })}
                    data-testid={`copy-${c.file!.id}`}
                  />
                ))}
              </Stack>
            </Radio.Group>
          )}
          {what === "template" && (
            <Radio.Group label={t("startFrom")} value={from} onChange={setFrom}>
              <Stack gap={6} mt={4}>
                <Radio value="starter" label={t("fromStarter")} />
                {copies.map((c) => (
                  <Radio key={c.key} value={c.file!.id} label={t("fromCopy", { name: c.name })} />
                ))}
              </Stack>
            </Radio.Group>
          )}
          <Text size="xs" c="dimmed">
            {t(`newHelp.${what}`)}
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

// ---- the root: who is doing what --------------------------------------------------------------------------------

function Dashboard({
  me,
  entries,
  releases,
  building,
  preview,
}: {
  me: string;
  entries: Entry[];
  releases: { preview?: number; production?: number };
  building: boolean;
  preview: string;
}) {
  const t = useTranslations("explorer");
  const tf = useTranslations("files");
  const router = useRouter();
  const fs = entries.filter((e) => e.file);
  const held = fs.filter((e) => e.file!.status === "checked_out");
  const flow = fs.filter((e) => e.file!.status === "in_workflow");
  const people = [...new Set([...held, ...flow].map((e) => e.file!.owner ?? ""))].filter(Boolean).sort();
  const recent = [...fs].sort((a, b) => b.file!.atTime - a.file!.atTime).slice(0, 12);
  /** A count in a card of its own: its label, the number, a way to the page that lists them. */
  const stat = (label: string, n: number, href?: string, test?: string) => (
    <Card withBorder padding="md" data-testid={test}>
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text fz={30} fw={700} lh={1.2} mt={6}>
        {n}
      </Text>
      {href && (
        <Anchor component={Link} {...NEW_TAB} href={href} size="xs" mt={6}>
          {t("open")} →
        </Anchor>
      )}
    </Card>
  );
  /** One of the sites: what it shows now. */
  const site = (label: string, value: string) => (
    <div>
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text fz={20} fw={700} mt={4}>
        {value}
      </Text>
    </div>
  );
  const chip = (e: Entry) => (
    <Anchor key={e.key} component={Link} {...NEW_TAB} href={e.href} size="xs">
      <Badge
        size="sm"
        variant="light"
        color={e.file!.status === "in_workflow" ? "violet" : "orange"}
        style={{ cursor: "pointer", textTransform: "none" }}
      >
        {tf(`kinds.${e.file!.kind}`)} · {e.name}
      </Badge>
    </Anchor>
  );
  return (
    <Stack gap="xl">
      <div>
        <Title order={1} fz={24}>
          {t("dashboard.title")}
        </Title>
        <Text size="sm" c="dimmed" mt={4}>
          {t("dashboard.lead")}
        </Text>
      </div>
      <SimpleGrid cols={{ base: 2, sm: 3, lg: 5 }} spacing="md">
        {stat(t("dashboard.mine"), held.filter((e) => e.file!.owner === me).length, "/mine/", "stat-mine")}
        {stat(t("dashboard.held"), held.length, undefined, "stat-held")}
        {stat(
          t("dashboard.checkedIn"),
          flow.filter((e) => e.file!.stage === "checked_in").length,
          "/workflow/",
        )}
        {stat(t("dashboard.preview"), flow.filter((e) => e.file!.stage === "preview").length, "/workflow/")}
        {stat(t("dashboard.fresh"), fs.filter((e) => e.file!.fresh).length)}
      </SimpleGrid>
      <Card withBorder padding="lg">
        <Title order={2} fz={18} mb={4}>
          {t("dashboard.who")}
        </Title>
        <Text size="sm" c="dimmed" mb="sm">
          {t("dashboard.whoLead")}
        </Text>
        {people.length ? (
          <Table verticalSpacing="xs" data-testid="who">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("dashboard.person")}</Table.Th>
                <Table.Th>{t("dashboard.holding")}</Table.Th>
                <Table.Th>{t("dashboard.inWorkflow")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {people.map((p) => (
                <Table.Tr key={p}>
                  <Table.Td>
                    <Text size="sm" fw={600}>
                      {p}
                      {p === me ? ` (${t("dashboard.you")})` : ""}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4}>{held.filter((e) => e.file!.owner === p).map(chip)}</Group>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4}>{flow.filter((e) => e.file!.owner === p).map(chip)}</Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        ) : (
          <Text size="sm" c="dimmed">
            {t("dashboard.nobody")}
          </Text>
        )}
      </Card>
      <Card withBorder padding="lg">
        <Title order={2} fz={18} mb="sm">
          {t("dashboard.recent")}
        </Title>
        <Table.ScrollContainer minWidth={560}>
          <Table verticalSpacing={4} data-testid="recent">
            <Table.Tbody>
              {recent.map((e) => (
                <Table.Tr key={e.key}>
                  <Table.Td style={{ whiteSpace: "nowrap" }}>
                    <Text size="xs">{e.file!.at}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs">{e.file!.by}</Text>
                  </Table.Td>
                  <Table.Td style={{ whiteSpace: "nowrap" }}>
                    <Badge size="xs" variant="outline" color="gray" style={{ minWidth: "max-content" }}>
                      {tf(`kinds.${e.file!.kind}`)}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Anchor
                      component={Link}
                      {...NEW_TAB}
                      href={e.href}
                      size="sm"
                      ff={e.mono ? "monospace" : undefined}
                    >
                      {e.name}
                    </Anchor>
                  </Table.Td>
                  <Table.Td>
                    <StateBadges file={e.file} me={me} size="xs" />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>
      <Card withBorder padding="lg" data-testid="sites">
        <Title order={2} fz={18} mb="md">
          {t("dashboard.sites")}
        </Title>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="xl">
          {site(t("dashboard.previewSite"), t("dashboard.release", { id: releases.preview ?? "–" }))}
          {site(t("dashboard.productionSite"), t("dashboard.release", { id: releases.production ?? "–" }))}
          <div>
            <Group gap="xs">
              <Text size="sm" c="dimmed">
                {t("cmsSite")}
              </Text>
              <Badge size="sm" color={building ? "yellow" : "green"}>
                {building ? t("rebuilding") : t("ready")}
              </Badge>
            </Group>
            <Group gap="xs" mt={8}>
              <Button component="a" href={preview} target="_blank" variant="default" size="xs">
                {t("openPreview")}
              </Button>
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
            <Text size="xs" c="dimmed" mt={6}>
              {t("cmsSiteHelp")}
            </Text>
          </div>
        </SimpleGrid>
      </Card>
    </Stack>
  );
}
