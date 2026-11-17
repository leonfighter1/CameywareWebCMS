"use client";
/**
 * A page's editor, as Bell's CMS.Net has it (the owner, 2026-11-16, with its screenshots: 「you can drag and drop rows
 * (create new row), and create a new file of component based on the drag and drop, reorder. you can create component and
 * pick avaialbe styles from the files」, then S5: 「we should be able to add new row to the page level, also rows can be
 * drag and drop reordered, row index don't carry … one row can be added multiple components (can be duplicated components
 * as well)」): the available components at the left and 新的一行 under them; each zone of the page's layout a list of
 * rows, each row one or more components side by side (rows.ts). A component dropped into a row stands beside its others,
 * between rows it makes a row of its own; 新的一行 makes an empty row to fill; a row is dragged by its bar, a component by
 * its own. A component's content is chosen as shared, new or a copy, its style browsed with how many pages use each; the
 * page's properties are behind 元数据.
 */
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Divider,
  Drawer,
  Flex,
  Group,
  Menu,
  Modal,
  Pagination,
  Radio,
  ScrollArea,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import {
  IconArrowDown,
  IconArrowLeft,
  IconArrowRight,
  IconArrowUp,
  IconCode,
  IconDownload,
  IconEdit,
  IconExternalLink,
  IconEye,
  IconFile,
  IconGripVertical,
  IconLayoutRows,
  IconListDetails,
  IconSearch,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { type DragEvent, type ReactNode, useOptimistic, useState, useTransition } from "react";
import { FieldsEditor } from "@/components/fields";
import { Editable, FileBar, isMine, StateBadges } from "@/components/files";
import { report } from "@/components/result";
import { UsedOn } from "@/components/used-on";
import type { FileView, PageUse, VersionView } from "@/lib/present";
import { moveCard, moveRow, newRowKey, type Row, rowsIn, type Target } from "@/lib/rows";
import type { L10n } from "@/generated/model";
import { deletePageAction, placeBlockAction, savePageAction, setBlocksAction } from "../../actions";
import { NEW_TAB } from "@/components/links";

/** The style of a place that names no template: its type's own view. */
const BUILTIN = "builtin";

type Placed = {
  id: string;
  zone: string;
  row?: string;
  style?: string;
  type: string;
  label: string;
  name: string;
  missing: boolean;
  file?: FileView;
};
type Zone = { name: string; label: string; full: boolean };
type Option = { value: string; label: string };
/** A style of a type: its name, how many pages use it, which. */
export type StyleInfo = Option & { uses: number; pages: string[] };
/** A component: its file's state and the pages it stands on (用在 N 个页面). */
type Library = { id: string; type: string; name: string; file?: FileView; uses: PageUse[] };
type T = ReturnType<typeof useTranslations<"page">>;

/** What is being dragged: a type, 新的一行, a row (its placements), or one component of a row. */
type Drag =
  | { kind: "type"; type: string }
  | { kind: "newrow" }
  | { kind: "row"; at: number[] }
  | { kind: "card"; index: number };
type Kind = Drag["kind"];

/**
 * What is dragged travels with the drag: its kind in the data's type (all a target is told while something is over it),
 * all of it as the data (read on the drop). Browsers lower-case the type, so the kinds are lower-case.
 */
const CARRIED = "application/x-cms-";
const carry = (e: DragEvent, d: Drag) => {
  e.stopPropagation();
  e.dataTransfer.setData(CARRIED + d.kind, JSON.stringify(d));
  e.dataTransfer.effectAllowed = "copyMove";
};
const kindOf = (e: DragEvent) =>
  Array.from(e.dataTransfer.types)
    .find((x) => x.startsWith(CARRIED))
    ?.slice(CARRIED.length) as Kind | undefined;
const carried = (e: DragEvent, kind: Kind) => JSON.parse(e.dataTransfer.getData(CARRIED + kind)) as Drag;

/**
 * A row made empty (新的一行) and not filled yet: kept here until a component is saved into it, in [zone] before the row
 * known as [before] (`rowName`; none: the end of the zone).
 */
type Fresh = { key: string; zone: string; before: string | null };

/** What keeps naming a row while the placements around it change: its key, or its only component's id. */
const rowName = (row: Row, list: Placed[]) => row.row ?? `@${list[row.at[0]!]!.id}`;

/** A palette item: a type or 新的一行, dragged onto the page or clicked. */
function PaletteItem({
  label,
  mine,
  testId,
  drag,
  click,
  icon,
}: {
  label: string;
  mine: boolean;
  testId: string;
  drag: Drag;
  click: () => void;
  icon?: ReactNode;
}) {
  return (
    <UnstyledButton
      draggable={mine}
      disabled={!mine}
      onDragStart={(e: DragEvent) => carry(e, drag)}
      onClick={() => mine && click()}
      data-testid={testId}
      style={{
        border: "1px solid var(--mantine-color-default-border)",
        borderRadius: 6,
        padding: "6px 10px",
        cursor: mine ? "grab" : "default",
        opacity: mine ? 1 : 0.6,
      }}
    >
      <Group justify="space-between" wrap="nowrap" gap={6}>
        <Group gap={6} wrap="nowrap">
          {icon}
          <Text size="sm" truncate>
            {label}
          </Text>
        </Group>
        <IconGripVertical size={14} aria-hidden />
      </Group>
    </UnstyledButton>
  );
}

export function PageEditor({
  me,
  file,
  versions,
  page,
  placements: saved,
  layouts,
  zones,
  styles,
  library,
  types,
  preview,
}: {
  me: string;
  file: FileView;
  versions: VersionView[];
  page: {
    id: string;
    path: string;
    status: "active" | "inactive";
    title: L10n;
    description: L10n;
    layout: string;
    breadcrumb: boolean | null;
    sitemap: boolean;
    deleted: boolean;
  };
  placements: Placed[];
  layouts: (Option & { description: string })[];
  /** Each layout's zones, by the layout's name. */
  zones: Record<string, Zone[]>;
  /** Each type's styles: its own view first, then its templates. */
  styles: Record<string, StyleInfo[]>;
  /** Every component, for 「Use Shared」 and 「Copy From Existing」. */
  library: Library[];
  types: Option[];
  preview: string;
}) {
  const t = useTranslations("page");
  const router = useRouter();
  const mine = isMine(file, me);
  const [properties, setProperties] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [frame, setFrame] = useState(0);
  /** The place dialog: a component of [type] put at [to], or the content of the place at [replace]. */
  const [placing, setPlacing] = useState<{ type: string; to: Target; replace?: number } | null>(null);
  const [styling, setStyling] = useState<number | null>(null);
  const [freshRows, setFresh] = useState<Fresh[]>([]);
  const [over, setOver] = useState<string | null>(null);
  const after = (ok: boolean) => {
    if (ok) {
      router.refresh();
      setFrame((n) => n + 1);
    }
  };
  /** The placements as saved, or as a move left them while it is being saved (shown at once, not after the save). */
  const [placements, show] = useOptimistic(saved);
  const [, startTransition] = useTransition();
  /** The placements as [next] has them; nothing to save when a move changed nothing (rows.ts gives the list back). */
  const put = (next: Placed[]) => {
    if (next === placements) return;
    startTransition(async () => {
      show(next);
      const r = await setBlocksAction(
        page.id,
        next.map((p) => ({ id: p.id, zone: p.zone, row: p.row, style: p.style })),
      );
      if (report(r)) setFrame((n) => n + 1);
    });
  };
  const zoneList = zones[page.layout] ?? [];
  const known = new Set(zoneList.map((z) => z.name));
  const firstZone = zoneList.find((z) => z.name === "main")?.name ?? zoneList[0]?.name ?? "main";
  const typeLabel = (type: string) => types.find((x) => x.value === type)?.label ?? type;
  const styleName = (p: Placed) =>
    (styles[p.type] ?? []).find((s) => s.value === (p.style ?? BUILTIN))?.label ??
    p.style ??
    t("builtinStyle");
  /** The empty rows still empty: one a component was saved into is a row of the page now. */
  const fresh = freshRows.filter((f) => !placements.some((p) => p.row === f.key));

  /** Drop-target handlers: [key] lit while a kind it [accepts] is over it; [drop] given what was dragged and where. */
  const target = (key: string, accepts: Kind[], drop: (d: Drag, e: DragEvent) => void) => ({
    onDragOver: (e: DragEvent) => {
      const kind = kindOf(e);
      if (!mine || !kind || !accepts.includes(kind)) return;
      e.preventDefault();
      e.stopPropagation();
      setOver(key);
    },
    onDragLeave: () => setOver((o) => (o === key ? null : o)),
    onDrop: (e: DragEvent) => {
      const kind = kindOf(e);
      if (!kind || !accepts.includes(kind)) return;
      e.preventDefault();
      e.stopPropagation();
      setOver(null);
      drop(carried(e, kind), e);
    },
  });
  const dragging = (d: Drag) => ({
    draggable: mine,
    onDragStart: (e: DragEvent) => carry(e, d),
    onDragEnd: () => setOver(null),
  });

  /**
   * The gap between rows, before the row [beforeRow] (the end of [zone] when none): a component dropped here is a row of
   * its own, 新的一行 an empty row, a row or a component moved here stands here.
   */
  const gap = (zone: string, beforeRow: Row | undefined, empty = false) => {
    const key = `gap:${zone}:${beforeRow?.at[0] ?? "end"}`;
    const on = over === key;
    const to: Target = { zone, beforeRow: beforeRow?.at };
    return (
      <Box
        key={key}
        data-testid={`drop-${zone}-${beforeRow ? beforeRow.at[0] : "end"}`}
        {...target(key, ["type", "newrow", "row", "card"], (d) => {
          if (d.kind === "type") setPlacing({ type: d.type, to });
          else if (d.kind === "newrow")
            setFresh((f) => [
              ...f,
              { key: newRowKey(), zone, before: beforeRow ? rowName(beforeRow, placements) : null },
            ]);
          else if (d.kind === "row") put(moveRow(placements, d.at, to));
          else put(moveCard(placements, d.index, to));
        })}
        style={{
          height: empty ? 56 : on ? 40 : 12,
          border: on || empty ? "2px dashed var(--mantine-color-default-border)" : undefined,
          borderColor: on ? "var(--mantine-primary-color-filled)" : undefined,
          borderRadius: 8,
          transition: "height 120ms",
          display: "grid",
          placeItems: "center",
        }}
      >
        {(on || empty) && (
          <Text size="xs" c="dimmed">
            {mine ? t("dropHere") : t("emptyZone")}
          </Text>
        )}
      </Box>
    );
  };

  /** A row's bar: its number, a grip to drag it by, what can be done to all of it. */
  const rowBar = (n: number, grip: object, actions: ReactNode, note?: ReactNode) => (
    <Group
      justify="space-between"
      wrap="nowrap"
      px="sm"
      py={6}
      bg="var(--mantine-color-default-hover)"
      style={{ cursor: mine ? "grab" : undefined }}
      {...grip}
    >
      <Group gap="xs" wrap="nowrap">
        {mine && <IconGripVertical size={16} aria-hidden />}
        <Text size="sm" fw={600}>
          {t("rowNo", { n })}
        </Text>
        {note}
      </Group>
      {mine && (
        <Group gap={2} wrap="nowrap">
          {actions}
        </Group>
      )}
    </Group>
  );

  /** A row of [zone]: its components side by side; one dropped on it stands beside them, on one of them before it. */
  const row = (r: Row, k: number, all: Row[], n: number) => {
    const key = `row:${r.at[0]}`;
    const to: Target = { zone: r.zone, join: r.at };
    return (
      <Card
        key={key}
        withBorder
        p={0}
        data-testid={`row-${n}`}
        style={over === key ? { borderColor: "var(--mantine-primary-color-filled)" } : undefined}
      >
        {rowBar(
          n,
          dragging({ kind: "row", at: r.at }),
          <>
            <ActionIcon
              variant="subtle"
              aria-label={t("up")}
              disabled={k === 0}
              onClick={() => put(moveRow(placements, r.at, { zone: r.zone, beforeRow: all[k - 1]?.at }))}
            >
              <IconArrowUp size={16} />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              aria-label={t("down")}
              disabled={k === all.length - 1}
              onClick={() => put(moveRow(placements, r.at, { zone: r.zone, beforeRow: all[k + 2]?.at }))}
            >
              <IconArrowDown size={16} />
            </ActionIcon>
            <Tooltip label={t("removeRow")}>
              <ActionIcon
                variant="subtle"
                color="red"
                aria-label={t("removeRow")}
                onClick={() =>
                  modals.openConfirmModal({
                    title: t("removeRowTitle", { n }),
                    children: <Text size="sm">{t("removeRowBody", { count: r.at.length })}</Text>,
                    labels: { confirm: t("removeRow"), cancel: t("cancel") },
                    confirmProps: { color: "red" },
                    onConfirm: () => put(placements.filter((_, x) => !r.at.includes(x))),
                  })
                }
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
          </>,
        )}
        <Box
          p="sm"
          {...target(key, ["type", "card"], (d) => {
            if (d.kind === "type") setPlacing({ type: d.type, to });
            else if (d.kind === "card") put(moveCard(placements, d.index, to));
          })}
        >
          <SimpleGrid cols={{ base: 1, lg: Math.min(r.at.length, 3) }} spacing="sm">
            {r.at.map((i, c) => card(placements[i]!, i, c, r))}
          </SimpleGrid>
          {over === key && (
            <Text size="xs" c="dimmed" ta="center" mt={6}>
              {t("dropInRow")}
            </Text>
          )}
        </Box>
      </Card>
    );
  };

  /** One component of a row: its content and style, what can be done to it; dragged by its bar. */
  const card = (p: Placed, i: number, c: number, r: Row) => {
    const key = `card:${i}`;
    const uses = library.find((x) => x.id === p.id)?.uses ?? [];
    return (
      <Card
        key={`${p.id}:${i}`}
        withBorder
        p={0}
        data-testid={`card-${p.id}`}
        style={
          over === key ? { borderColor: "var(--mantine-primary-color-filled)", borderWidth: 2 } : undefined
        }
        {...target(key, ["type", "card"], (d, e) => {
          // Dropped on its right half: after it; on its left half: before it.
          const box = e.currentTarget.getBoundingClientRect();
          const before = e.clientX > box.left + box.width / 2 ? r.at[c + 1] : i;
          const to: Target = { zone: r.zone, join: r.at, before };
          if (d.kind === "type") setPlacing({ type: d.type, to });
          else if (d.kind === "card") put(moveCard(placements, d.index, to));
        })}
      >
        <Group
          justify="space-between"
          wrap="nowrap"
          px="sm"
          py={4}
          bg="var(--mantine-primary-color-light)"
          style={{ cursor: mine ? "grab" : undefined }}
          {...dragging({ kind: "card", index: i })}
        >
          <Text
            fw={600}
            size="sm"
            c={p.missing ? "red" : "var(--mantine-primary-color-light-color)"}
            truncate
          >
            {p.missing ? t("missingBlock") : p.label}
          </Text>
          <Group gap={0} wrap="nowrap">
            {!p.missing && (
              <Tooltip label={t("editContent")}>
                <ActionIcon
                  component={Link}
                  {...NEW_TAB}
                  href={`/components/${p.id}?page=${page.id}`}
                  variant="subtle"
                  size="sm"
                  aria-label={t("editContent")}
                >
                  <IconEdit size={15} />
                </ActionIcon>
              </Tooltip>
            )}
            {mine && (
              <>
                <Tooltip label={t("contentSource")}>
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    aria-label={t("contentSource")}
                    onClick={() => setPlacing({ type: p.type, to: { zone: p.zone }, replace: i })}
                  >
                    <IconFile size={15} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label={t("styleBrowse")}>
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    aria-label={t("styleBrowse")}
                    onClick={() => setStyling(i)}
                  >
                    <IconCode size={15} />
                  </ActionIcon>
                </Tooltip>
                {r.at.length > 1 && (
                  <>
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      aria-label={t("left")}
                      disabled={c === 0}
                      onClick={() =>
                        put(moveCard(placements, i, { zone: r.zone, join: r.at, before: r.at[c - 1] }))
                      }
                    >
                      <IconArrowLeft size={15} />
                    </ActionIcon>
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      aria-label={t("right")}
                      disabled={c === r.at.length - 1}
                      onClick={() =>
                        put(moveCard(placements, i, { zone: r.zone, join: r.at, before: r.at[c + 2] }))
                      }
                    >
                      <IconArrowRight size={15} />
                    </ActionIcon>
                  </>
                )}
                <Tooltip label={t("removeBlock")}>
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    color="red"
                    aria-label={t("removeBlock")}
                    onClick={() => put(placements.filter((_, x) => x !== i))}
                  >
                    <IconTrash size={15} />
                  </ActionIcon>
                </Tooltip>
              </>
            )}
          </Group>
        </Group>
        <Stack gap={4} px="sm" py="xs">
          <Group gap={6}>
            <Text size="sm" fw={600}>
              {t("contentLabel")}
            </Text>
            {p.missing ? (
              <Text size="sm" c="red">
                {p.id}
              </Text>
            ) : (
              <Anchor component={Link} {...NEW_TAB} href={`/components/${p.id}?page=${page.id}`} size="sm">
                {p.name || p.id}
              </Anchor>
            )}
            <StateBadges file={p.file} me={me} size="xs" />
            {uses.length > 1 && (
              <UsedOn
                name={p.name || p.id}
                uses={uses}
                here={page.id}
                label={t("sharedOn", { n: uses.length })}
                size="xs"
              />
            )}
          </Group>
          <Group gap={6}>
            <Text size="sm" fw={600}>
              {t("styleLabel")}
            </Text>
            <Anchor
              component={Link}
              {...NEW_TAB}
              href={p.style ? `/templates/${p.style}` : `/templates/builtin/${p.type}`}
              size="sm"
            >
              {styleName(p)}
            </Anchor>
          </Group>
        </Stack>
      </Card>
    );
  };

  /** An empty row (新的一行) before [beforeRow]: a component dropped in it is its first; saved then. */
  const freshRow = (f: Fresh, beforeRow: Row | undefined, n: number) => {
    const key = `fresh:${f.key}`;
    const to: Target = { zone: f.zone, beforeRow: beforeRow?.at, row: f.key };
    return (
      <Card
        key={key}
        withBorder
        p={0}
        data-testid={`row-${n}`}
        data-fresh
        style={{
          borderStyle: "dashed",
          ...(over === key && { borderColor: "var(--mantine-primary-color-filled)" }),
        }}
      >
        {rowBar(
          n,
          {},
          <Tooltip label={t("removeRow")}>
            <ActionIcon
              variant="subtle"
              color="red"
              aria-label={t("removeRow")}
              onClick={() => setFresh((all) => all.filter((x) => x.key !== f.key))}
            >
              <IconX size={16} />
            </ActionIcon>
          </Tooltip>,
          <Badge size="xs" variant="light" color="gray">
            {t("emptyRowBadge")}
          </Badge>,
        )}
        <Box
          p="lg"
          {...target(key, ["type", "card"], (d) => {
            if (d.kind === "type") setPlacing({ type: d.type, to });
            else if (d.kind === "card") put(moveCard(placements, d.index, to));
          })}
        >
          <Text size="sm" c="dimmed" ta="center">
            {t("emptyRow")}
          </Text>
        </Box>
      </Card>
    );
  };

  const stray = placements.map((p, i) => ({ p, i })).filter(({ p }) => !known.has(p.zone));
  let number = 0;

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <div>
          <Text size="xs" c="dimmed">
            {t("pageLabel")}
          </Text>
          <Title order={1} fz={22} ff="monospace">
            {page.path}
          </Title>
          <Text size="sm" c="dimmed">
            {page.title.zh || page.title.en} ·{" "}
            {layouts.find((l) => l.value === page.layout)?.label ?? page.layout}
          </Text>
        </div>
        <Group gap="xs">
          <Button
            variant="light"
            size="xs"
            leftSection={<IconListDetails size={14} />}
            onClick={() => setProperties(true)}
            data-testid="metadata"
          >
            {t("metadata")}
          </Button>
          <Button
            variant="default"
            size="xs"
            leftSection={<IconEye size={14} />}
            onClick={() => setShowPreview(true)}
          >
            {t("preview")}
          </Button>
          <Menu>
            <Menu.Target>
              <Button variant="default" size="xs" leftSection={<IconDownload size={14} />}>
                {t("download")}
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item component="a" href={`/api/export?kind=page&id=${page.id}&format=xml`}>
                {t("downloadXml")}
              </Menu.Item>
              <Menu.Item component="a" href={`/api/export?kind=page&id=${page.id}&format=json`}>
                {t("downloadJson")}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
          {mine && !page.deleted && (
            <Button
              color="red"
              variant="light"
              size="xs"
              onClick={() =>
                modals.openConfirmModal({
                  title: t("deleteTitle", { path: page.path }),
                  children: <Text size="sm">{t("deleteBody")}</Text>,
                  labels: { confirm: t("delete"), cancel: t("cancel") },
                  confirmProps: { color: "red" },
                  onConfirm: async () => after(report(await deletePageAction(page.id), t("deleted"))),
                })
              }
            >
              {t("delete")}
            </Button>
          )}
        </Group>
      </Group>

      <FileBar file={file} me={me} versions={versions} onChanged={() => setFrame((n) => n + 1)} />

      {page.deleted ? (
        <Alert color="yellow" title={t("deletedTitle")}>
          {t("deletedBody")}
        </Alert>
      ) : (
        <Flex gap="lg" align="flex-start" direction={{ base: "column", md: "row" }}>
          <Card
            withBorder
            p="sm"
            w={{ base: "100%", md: 220 }}
            pos={{ base: "static", md: "sticky" }}
            top={84}
            style={{ flexShrink: 0 }}
            data-testid="palette"
          >
            <Text fw={700} size="sm" mb={4}>
              {t("available")}
            </Text>
            <Text size="xs" c="dimmed" mb="sm">
              {mine ? t("availableHelp") : t("takeToEdit")}
            </Text>
            <ScrollArea.Autosize mah="calc(100vh - 260px)">
              <Stack gap={6}>
                {types.map((x) => (
                  <PaletteItem
                    key={x.value}
                    label={x.label}
                    mine={mine}
                    testId={`palette-${x.value}`}
                    drag={{ kind: "type", type: x.value }}
                    click={() => setPlacing({ type: x.value, to: { zone: firstZone } })}
                  />
                ))}
                <Divider my={6} />
                <PaletteItem
                  label={t("newRow")}
                  mine={mine}
                  testId="palette-row"
                  icon={<IconLayoutRows size={14} aria-hidden />}
                  drag={{ kind: "newrow" }}
                  click={() => setFresh((f) => [...f, { key: newRowKey(), zone: firstZone, before: null }])}
                />
                <Text size="xs" c="dimmed">
                  {t("newRowHelp")}
                </Text>
              </Stack>
            </ScrollArea.Autosize>
          </Card>

          <Stack gap="md" style={{ flex: 1, minWidth: 0 }} w="100%">
            {zoneList.map((z) => {
              const rows = rowsIn(placements, z.name);
              const named = new Set(rows.map((r) => rowName(r, placements)));
              const freshBefore = (r: Row | undefined) =>
                fresh.filter(
                  (f) =>
                    f.zone === z.name &&
                    (r ? f.before === rowName(r, placements) : !named.has(f.before ?? "")),
                );
              const parts: ReactNode[] = [];
              for (const [k, r] of [...rows, undefined].entries()) {
                for (const f of freshBefore(r)) parts.push(freshRow(f, r, ++number));
                if (r) {
                  parts.push(gap(z.name, r));
                  parts.push(row(r, k, rows, ++number));
                }
              }
              const empty = !rows.length && !freshBefore(undefined).length;
              return (
                <Box key={z.name} data-testid={`zone-${z.name}`}>
                  <Group gap="xs" mb={6}>
                    <Title order={2} fz={16}>
                      {z.label}
                    </Title>
                    <Badge size="xs" variant="outline" color="gray" style={{ textTransform: "none" }}>
                      {z.name}
                    </Badge>
                    {z.full && (
                      <Badge size="xs" variant="light">
                        {t("fullZone")}
                      </Badge>
                    )}
                  </Group>
                  <Stack gap={0}>
                    {parts}
                    {gap(z.name, undefined, empty)}
                  </Stack>
                </Box>
              );
            })}
            {!!stray.length && (
              <Alert color="yellow" title={t("strayTitle")} data-testid="stray">
                <Text size="sm" mb="sm">
                  {t("strayBody")}
                </Text>
                <Stack gap="xs">
                  {stray.map(({ p, i }) => (
                    <Group key={`${p.id}:${i}`} justify="space-between">
                      <Text size="sm">
                        {p.label} · {p.name || p.id} ({p.zone})
                      </Text>
                      <Editable open={mine}>
                        <Select
                          size="xs"
                          placeholder={t("moveTo")}
                          data={zoneList.map((z) => ({ value: z.name, label: z.label }))}
                          onChange={(v) => v && put(moveCard(placements, i, { zone: v }))}
                        />
                      </Editable>
                    </Group>
                  ))}
                </Stack>
              </Alert>
            )}
          </Stack>
        </Flex>
      )}

      <Properties
        opened={properties}
        close={() => setProperties(false)}
        page={page}
        layouts={layouts}
        mine={mine}
        saved={() => after(true)}
      />
      {placing && (
        <PlaceDialog
          t={t}
          pageId={page.id}
          placing={placing}
          zones={zoneList}
          typeLabel={typeLabel(placing.type)}
          library={library.filter((c) => c.type === placing.type)}
          styles={styles[placing.type] ?? []}
          current={placing.replace !== undefined ? placements[placing.replace] : undefined}
          me={me}
          preview={preview}
          close={() => setPlacing(null)}
          done={() => {
            setPlacing(null);
            after(true);
          }}
        />
      )}
      {styling !== null && placements[styling] && (
        <StyleBrowser
          t={t}
          styles={styles[placements[styling].type] ?? []}
          value={placements[styling].style ?? BUILTIN}
          preview={preview}
          close={() => setStyling(null)}
          pick={(v) => {
            const i = styling;
            setStyling(null);
            put(placements.map((p, n) => (n === i ? { ...p, style: v === BUILTIN ? undefined : v } : p)));
          }}
        />
      )}
      <Drawer
        opened={showPreview}
        onClose={() => setShowPreview(false)}
        position="right"
        size="55%"
        title={t("previewDraft")}
      >
        <Stack gap="xs">
          <Anchor href={preview} target="_blank" size="sm">
            {t("openTab")} <IconExternalLink size={12} />
          </Anchor>
          <iframe key={frame} src={preview} title={t("previewTitle")} className="cms-preview-frame" />
        </Stack>
      </Drawer>
    </Stack>
  );
}

/** 元数据: the page's properties, as Bell's Page Properties (General; its title and description per language). */
function Properties({
  opened,
  close,
  page,
  layouts,
  mine,
  saved,
}: {
  opened: boolean;
  close: () => void;
  page: {
    id: string;
    path: string;
    status: "active" | "inactive";
    title: L10n;
    description: L10n;
    layout: string;
    breadcrumb: boolean | null;
    sitemap: boolean;
  };
  layouts: (Option & { description: string })[];
  mine: boolean;
  saved: () => void;
}) {
  const t = useTranslations("page");
  const [s, setS] = useState(page);
  const [busy, setBusy] = useState(false);
  const info = layouts.find((l) => l.value === s.layout);
  const fields = [
    {
      name: "title",
      label: t("titleField"),
      label_en: t("titleField"),
      kind: "text",
      localized: true,
      required: true,
    },
    {
      name: "description",
      label: t("descriptionField"),
      label_en: t("descriptionField"),
      kind: "textarea",
      localized: true,
    },
  ];
  const save = async () => {
    setBusy(true);
    const { path, status, title, description, layout, breadcrumb, sitemap } = s;
    const ok = report(
      await savePageAction(page.id, { path, status, title, description, layout, breadcrumb, sitemap }),
      t("saved"),
    );
    setBusy(false);
    if (ok) {
      close();
      saved();
    }
  };
  return (
    <Modal opened={opened} onClose={close} title={t("propertiesTitle", { path: page.path })} size="xl">
      <Editable open={mine}>
        <Tabs defaultValue="general">
          <Tabs.List>
            <Tabs.Tab value="general">{t("tabGeneral")}</Tabs.Tab>
            <Tabs.Tab value="words">{t("tabWords")}</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="general" pt="md">
            <Stack>
              <TextInput
                label={t("path")}
                description={t("pathHelp")}
                value={s.path}
                onChange={(e) => setS({ ...s, path: e.currentTarget.value })}
                ff="monospace"
              />
              <Switch
                label={t("activeSwitch")}
                checked={s.status === "active"}
                onChange={(e) => setS({ ...s, status: e.currentTarget.checked ? "active" : "inactive" })}
              />
              <Select
                label={t("layout")}
                description={info?.description || t("layoutHelp")}
                data={layouts.map((l) => ({ value: l.value, label: l.label }))}
                value={s.layout}
                onChange={(v) => v && setS({ ...s, layout: v })}
                allowDeselect={false}
                data-testid="layout-select"
              />
              {s.layout !== page.layout && (
                <Text size="xs" c="dimmed">
                  {t("layoutChanged")}
                </Text>
              )}
              <Group grow align="flex-end">
                <Select
                  label={t("breadcrumb")}
                  data={[
                    { value: "layout", label: t("breadcrumbLayout") },
                    { value: "on", label: t("breadcrumbOn") },
                    { value: "off", label: t("breadcrumbOff") },
                  ]}
                  value={s.breadcrumb === null ? "layout" : s.breadcrumb ? "on" : "off"}
                  onChange={(v) => setS({ ...s, breadcrumb: v === "layout" ? null : v === "on" })}
                  allowDeselect={false}
                />
                <Switch
                  mb={8}
                  label={t("sitemap")}
                  checked={s.sitemap}
                  onChange={(e) => setS({ ...s, sitemap: e.currentTarget.checked })}
                />
              </Group>
            </Stack>
          </Tabs.Panel>
          <Tabs.Panel value="words" pt="md">
            <FieldsEditor
              fields={fields}
              value={{ title: s.title, description: s.description }}
              ctx={{ works: [], icons: [] }}
              onChange={(v) => setS({ ...s, title: v.title as L10n, description: v.description as L10n })}
            />
          </Tabs.Panel>
        </Tabs>
        <Group justify="flex-end" mt="lg">
          <Button variant="default" onClick={close}>
            {t("cancel")}
          </Button>
          <Button onClick={save} loading={busy} disabled={!mine}>
            {t("saveSettings")}
          </Button>
        </Group>
      </Editable>
    </Modal>
  );
}

const PER = 10;

/**
 * Component Attributes (Bell's): a component's content, shared (a component already made), new, or a copy of one; its
 * zone when it was clicked in rather than dropped somewhere; its style, browsed.
 */
function PlaceDialog({
  t,
  pageId,
  placing,
  zones,
  typeLabel,
  library,
  styles,
  current,
  me,
  preview,
  close,
  done,
}: {
  t: T;
  pageId: string;
  placing: { type: string; to: Target; replace?: number };
  zones: Zone[];
  typeLabel: string;
  library: Library[];
  styles: StyleInfo[];
  current?: Placed;
  me: string;
  preview: string;
  close: () => void;
  done: () => void;
}) {
  const [source, setSource] = useState<"shared" | "new" | "copy">(library.length ? "shared" : "new");
  const [pick, setPick] = useState<string | null>(current?.id ?? null);
  const [name, setName] = useState("");
  const [zone, setZone] = useState(placing.to.zone);
  /** Clicked in from the palette: a row of its own at the end of the zone chosen here. */
  const anywhere =
    placing.replace === undefined && !placing.to.join && !placing.to.beforeRow && !placing.to.row;
  const [style, setStyle] = useState(current?.style ?? BUILTIN);
  const [browse, setBrowse] = useState(false);
  /** A component's 用在 list is open over this dialog. */
  const [listing, setListing] = useState(false);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const shown = library
    .filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.id.includes(q))
    .sort((a, b) => (b.file?.atTime ?? 0) - (a.file?.atTime ?? 0));
  const pages = Math.max(1, Math.ceil(shown.length / PER));
  const rows = shown.slice((Math.min(page, pages) - 1) * PER, Math.min(page, pages) * PER);
  const ready = source === "new" ? true : !!pick;
  const save = async () => {
    setBusy(true);
    const r = await placeBlockAction(pageId, {
      ...(source === "shared"
        ? { existing: pick! }
        : source === "copy"
          ? { copyOf: pick!, name }
          : { type: placing.type, name }),
      style: style === BUILTIN ? undefined : style,
      to: { ...placing.to, zone },
      replace: placing.replace,
    });
    setBusy(false);
    if (report(r, t("placed"))) done();
  };
  return (
    <Modal
      opened
      onClose={close}
      // Esc closes only the dialog opened over it (浏览, 用在).
      closeOnEscape={!browse && !listing}
      title={t("attributesTitle", { type: typeLabel })}
      size="xl"
      data-testid="place-dialog"
    >
      <Stack>
        <Radio.Group label={t("contentLabel")} value={source} onChange={(v) => setSource(v as typeof source)}>
          <Group mt={6}>
            <Radio
              value="shared"
              label={t("useShared")}
              disabled={!library.length}
              data-testid="source-shared"
            />
            <Radio value="new" label={t("createNew")} data-testid="source-new" />
            <Radio
              value="copy"
              label={t("copyExisting")}
              disabled={!library.length}
              data-testid="source-copy"
            />
          </Group>
        </Radio.Group>
        {source !== "shared" && (
          <TextInput
            label={t("blockName")}
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            data-testid="new-name"
          />
        )}
        {source !== "new" && (
          <Card withBorder p="xs">
            <Group justify="space-between" mb="xs">
              <Text size="sm" fw={600}>
                {source === "shared"
                  ? t("pickShared", { type: typeLabel })
                  : t("pickCopy", { type: typeLabel })}
              </Text>
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
            </Group>
            <Table highlightOnHover verticalSpacing={4} data-testid="library">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("colName")}</Table.Th>
                  <Table.Th>{t("colState")}</Table.Th>
                  <Table.Th>{t("colUses")}</Table.Th>
                  <Table.Th>{t("colModified")}</Table.Th>
                  <Table.Th>{t("colBy")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((c) => (
                  <Table.Tr
                    key={c.id}
                    onClick={() => setPick(c.id)}
                    bg={pick === c.id ? "var(--mantine-primary-color-light)" : undefined}
                    style={{ cursor: "pointer" }}
                    data-testid={`lib-${c.id}`}
                  >
                    <Table.Td>
                      <Text size="sm" fw={pick === c.id ? 700 : undefined}>
                        {c.name}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <StateBadges file={c.file} me={me} size="xs" />
                    </Table.Td>
                    <Table.Td>
                      <UsedOn
                        name={c.name}
                        uses={c.uses}
                        here={pageId}
                        size="xs"
                        zIndex={400}
                        onOpen={setListing}
                      />
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs">{c.file?.at ?? "—"}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs">{c.file?.by ?? "—"}</Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            {pages > 1 && (
              <Group justify="flex-end" mt="xs">
                <Pagination size="sm" total={pages} value={Math.min(page, pages)} onChange={setPage} />
              </Group>
            )}
          </Card>
        )}
        <Group grow align="flex-end">
          {anywhere && (
            <Select
              label={t("zone")}
              data={zones.map((z) => ({ value: z.name, label: `${z.label} (${z.name})` }))}
              value={zone}
              onChange={(v) => v && setZone(v)}
              allowDeselect={false}
            />
          )}
          <Group gap="xs" align="flex-end" wrap="nowrap">
            <TextInput
              label={t("styleLabel")}
              readOnly
              value={styles.find((s) => s.value === style)?.label ?? style}
              style={{ flex: 1 }}
            />
            <Button variant="light" onClick={() => setBrowse(true)} data-testid="browse-styles">
              {t("browse")}
            </Button>
          </Group>
        </Group>
        <Group justify="flex-end">
          <Button variant="default" onClick={close}>
            {t("cancel")}
          </Button>
          <Button onClick={save} loading={busy} disabled={!ready} data-testid="place-save">
            {t("savePlace")}
          </Button>
        </Group>
      </Stack>
      {browse && (
        <StyleBrowser
          t={t}
          styles={styles}
          value={style}
          preview={preview}
          close={() => setBrowse(false)}
          pick={(v) => {
            setStyle(v);
            setBrowse(false);
          }}
        />
      )}
    </Modal>
  );
}

/** Browse (Bell's): a type's styles with how many pages use each, sorted by use or by name; where one is used. */
function StyleBrowser({
  t,
  styles,
  value,
  preview,
  close,
  pick,
}: {
  t: T;
  styles: StyleInfo[];
  value: string;
  preview: string;
  close: () => void;
  pick: (value: string) => void;
}) {
  const [q, setQ] = useState("");
  const [order, setOrder] = useState<"uses" | "name">("uses");
  const [at, setAt] = useState(value);
  const shown = styles
    .filter((s) => !q || s.label.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (order === "uses" ? b.uses - a.uses : a.label.localeCompare(b.label)));
  const chosen = styles.find((s) => s.value === at);
  const base = new URL(preview).origin;
  return (
    <Modal opened onClose={close} title={t("browseTitle")} size="xl" zIndex={400} data-testid="style-browser">
      <Stack>
        <TextInput
          leftSection={<IconSearch size={14} />}
          placeholder={t("search")}
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
        />
        <Flex gap="lg" direction={{ base: "column", sm: "row" }}>
          <ScrollArea.Autosize mah={360} style={{ flex: 1 }}>
            <Stack gap={2}>
              {shown.map((s) => (
                <UnstyledButton
                  key={s.value}
                  onClick={() => setAt(s.value)}
                  onDoubleClick={() => pick(s.value)}
                  px="xs"
                  py={4}
                  style={{ borderRadius: 6 }}
                  bg={at === s.value ? "var(--mantine-primary-color-light)" : undefined}
                  data-testid={`style-${s.value}`}
                >
                  <Text size="sm">
                    {s.label}{" "}
                    <Text span c="green" fw={700}>
                      ({s.uses})
                    </Text>
                  </Text>
                </UnstyledButton>
              ))}
            </Stack>
          </ScrollArea.Autosize>
          <Box style={{ flex: 1 }}>
            <Text size="sm" fw={600} mb={4}>
              {t("usedInPages")}
            </Text>
            {chosen?.pages.length ? (
              <Stack gap={2}>
                {chosen.pages.map((p) => (
                  <Anchor key={p} href={`${base}/zh${p}?view=draft`} target="_blank" size="sm" ff="monospace">
                    {p}
                  </Anchor>
                ))}
              </Stack>
            ) : (
              <Text size="sm" c="dimmed">
                {t("usedNowhere")}
              </Text>
            )}
          </Box>
        </Flex>
        <Group justify="space-between">
          <SegmentedControl
            size="xs"
            value={order}
            onChange={(v) => setOrder(v as "uses" | "name")}
            data={[
              { value: "uses", label: t("sortByUse") },
              { value: "name", label: t("allStyles") },
            ]}
          />
          <Group gap="xs">
            <Button variant="default" onClick={close}>
              {t("cancel")}
            </Button>
            <Button onClick={() => pick(at)} data-testid="style-pick">
              {t("pickStyle")}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
