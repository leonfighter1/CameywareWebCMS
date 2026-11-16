"use client";
/**
 * A page's editor, as Bell's CMS.Net has it (the owner, 2026-11-16, with its screenshots: 「you can drag and drop rows
 * (create new row), and create a new file of component based on the drag and drop, reorder. you can create component and
 * pick avaialbe styles from the files」): the available components at the left, dragged into a zone of the page's layout
 * to make a row; each row a component (its content, its style), dragged to another place or zone; its content chosen as
 * shared, new or a copy, its style browsed with how many pages use each; the page's properties behind 元数据.
 */
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
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
  IconArrowUp,
  IconCode,
  IconDownload,
  IconEdit,
  IconExternalLink,
  IconEye,
  IconFile,
  IconGripVertical,
  IconListDetails,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { type DragEvent, useRef, useState } from "react";
import { FieldsEditor } from "@/components/fields";
import { Editable, FileBar, isMine, StateBadges } from "@/components/files";
import { report } from "@/components/result";
import type { FileView, VersionView } from "@/lib/present";
import type { L10n } from "@/generated/model";
import { deletePageAction, placeBlockAction, savePageAction, setBlocksAction } from "../../actions";

/** The style of a place that names no template: its type's own view. */
const BUILTIN = "builtin";

type Placed = {
  id: string;
  zone: string;
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
type Library = { id: string; type: string; name: string; file?: FileView };
type T = ReturnType<typeof useTranslations<"page">>;

/** What is being dragged: a type from the available components, or a row. */
type Drag = { kind: "type"; type: string } | { kind: "row"; index: number } | null;

/** [list] with the place at [from] put before the place at [before] (the end of [zone] when null), in [zone]. */
function moved(list: Placed[], from: number, zone: string, before: number | null) {
  const item = { ...list[from]!, zone };
  const rest = list.filter((_, n) => n !== from);
  let at: number;
  if (before === null) {
    const last = rest.map((p) => p.zone).lastIndexOf(zone);
    at = last < 0 ? rest.length : last + 1;
  } else at = before > from ? before - 1 : before;
  rest.splice(at, 0, item);
  return rest;
}

export function PageEditor({
  me,
  file,
  versions,
  page,
  placements,
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
  /** The place dialog: a new row of [type] in [zone] at [at], or the content of the row at [replace]. */
  const [placing, setPlacing] = useState<{
    type: string;
    zone: string;
    at?: number;
    replace?: number;
  } | null>(null);
  const [styling, setStyling] = useState<number | null>(null);
  const drag = useRef<Drag>(null);
  const [over, setOver] = useState<string | null>(null);
  const after = (ok: boolean) => {
    if (ok) {
      router.refresh();
      setFrame((n) => n + 1);
    }
  };
  const put = async (next: Placed[]) =>
    after(
      report(
        await setBlocksAction(
          page.id,
          next.map((p) => ({ id: p.id, zone: p.zone, style: p.style })),
        ),
      ),
    );
  const zoneList = zones[page.layout] ?? [];
  const known = new Set(zoneList.map((z) => z.name));
  const firstZone = zoneList.find((z) => z.name === "main")?.name ?? zoneList[0]?.name ?? "main";
  const typeLabel = (type: string) => types.find((x) => x.value === type)?.label ?? type;
  const styleName = (p: Placed) =>
    (styles[p.type] ?? []).find((s) => s.value === (p.style ?? BUILTIN))?.label ??
    p.style ??
    t("builtinStyle");

  /** A place to drop a row or a type: before the place [before], or at the end of [zone]. */
  const slot = (zone: string, before: number | null, empty = false) => {
    const key = `${zone}:${before ?? "end"}`;
    const on = over === key;
    return (
      <Box
        key={`slot-${key}`}
        data-testid={`drop-${zone}-${before ?? "end"}`}
        onDragOver={(e: DragEvent) => {
          if (!mine || !drag.current) return;
          e.preventDefault();
          setOver(key);
        }}
        onDragLeave={() => setOver((o) => (o === key ? null : o))}
        onDrop={(e: DragEvent) => {
          e.preventDefault();
          setOver(null);
          const d = drag.current;
          drag.current = null;
          if (!d) return;
          if (d.kind === "row") put(moved(placements, d.index, zone, before));
          else setPlacing({ type: d.type, zone, at: before ?? undefined });
        }}
        style={{
          height: empty ? 56 : on ? 40 : 10,
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

  /** One row: its component, its content and style, what can be done to it. */
  const row = (p: Placed, i: number, n: number, first: boolean, last: boolean) => (
    <Card key={`${p.id}:${i}`} withBorder p={0} data-testid={`row-${p.id}`}>
      <Group
        justify="space-between"
        wrap="nowrap"
        px="sm"
        py={6}
        bg="var(--mantine-color-default-hover)"
        draggable={mine}
        onDragStart={(e: DragEvent) => {
          drag.current = { kind: "row", index: i };
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => {
          drag.current = null;
          setOver(null);
        }}
        style={{ cursor: mine ? "grab" : undefined }}
      >
        <Group gap="xs" wrap="nowrap">
          {mine && <IconGripVertical size={16} aria-hidden />}
          <Text size="sm" c="dimmed">
            {t("rowNo", { n })}
          </Text>
          <Text fw={600} size="sm" c={p.missing ? "red" : undefined}>
            {p.missing ? t("missingBlock") : p.label}
          </Text>
        </Group>
        <Group gap={2} wrap="nowrap">
          {!p.missing && (
            <Tooltip label={t("editContent")}>
              <ActionIcon
                component={Link}
                href={`/components/${p.id}?page=${page.id}`}
                variant="subtle"
                aria-label={t("editContent")}
              >
                <IconEdit size={16} />
              </ActionIcon>
            </Tooltip>
          )}
          {mine && (
            <>
              <Tooltip label={t("contentSource")}>
                <ActionIcon
                  variant="subtle"
                  aria-label={t("contentSource")}
                  onClick={() => setPlacing({ type: p.type, zone: p.zone, replace: i })}
                >
                  <IconFile size={16} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label={t("styleBrowse")}>
                <ActionIcon variant="subtle" aria-label={t("styleBrowse")} onClick={() => setStyling(i)}>
                  <IconCode size={16} />
                </ActionIcon>
              </Tooltip>
              <ActionIcon
                variant="subtle"
                aria-label={t("up")}
                disabled={first}
                onClick={() => put(moved(placements, i, p.zone, neighbour(i, -1)))}
              >
                <IconArrowUp size={16} />
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                aria-label={t("down")}
                disabled={last}
                onClick={() => put(moved(placements, i, p.zone, neighbour(i, 2)))}
              >
                <IconArrowDown size={16} />
              </ActionIcon>
              <Tooltip label={t("removeBlock")}>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  aria-label={t("removeBlock")}
                  onClick={() => put(placements.filter((_, x) => x !== i))}
                >
                  <IconTrash size={16} />
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
            <Anchor component={Link} href={`/components/${p.id}?page=${page.id}`} size="sm">
              {p.name || p.id}
            </Anchor>
          )}
          <StateBadges file={p.file} me={me} size="xs" />
        </Group>
        <Group gap={6}>
          <Text size="sm" fw={600}>
            {t("styleLabel")}
          </Text>
          {p.style ? (
            <Anchor component={Link} href={`/templates/${p.style}`} size="sm">
              {styleName(p)}
            </Anchor>
          ) : (
            <Anchor component={Link} href={`/templates/builtin/${p.type}`} size="sm">
              {styleName(p)}
            </Anchor>
          )}
        </Group>
      </Stack>
    </Card>
  );
  /**
   * The place [by] places away from [i] in its zone, to move [i] before it: -1 one up; 2 one down (after the next one).
   * None: the end of the zone.
   */
  const neighbour = (i: number, by: number) => {
    const same = placements.map((p, n) => (p.zone === placements[i]!.zone ? n : -1)).filter((n) => n >= 0);
    return same[same.indexOf(i) + by] ?? null;
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
                  <UnstyledButton
                    key={x.value}
                    draggable={mine}
                    disabled={!mine}
                    onDragStart={(e: DragEvent) => {
                      drag.current = { kind: "type", type: x.value };
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onDragEnd={() => {
                      drag.current = null;
                      setOver(null);
                    }}
                    onClick={() => mine && setPlacing({ type: x.value, zone: firstZone })}
                    data-testid={`palette-${x.value}`}
                    style={{
                      border: "1px solid var(--mantine-color-default-border)",
                      borderRadius: 6,
                      padding: "6px 10px",
                      cursor: mine ? "grab" : "default",
                      opacity: mine ? 1 : 0.6,
                    }}
                  >
                    <Group justify="space-between" wrap="nowrap" gap={6}>
                      <Text size="sm" truncate>
                        {x.label}
                      </Text>
                      <IconGripVertical size={14} aria-hidden />
                    </Group>
                  </UnstyledButton>
                ))}
              </Stack>
            </ScrollArea.Autosize>
          </Card>

          <Stack gap="md" style={{ flex: 1, minWidth: 0 }} w="100%">
            {zoneList.map((z) => {
              const here = placements.map((p, i) => ({ p, i })).filter(({ p }) => p.zone === z.name);
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
                    {here.map(({ p, i }, k) => (
                      <Box key={`${p.id}:${i}`}>
                        {slot(z.name, i)}
                        {row(p, i, ++number, k === 0, k === here.length - 1)}
                      </Box>
                    ))}
                    {slot(z.name, null, !here.length)}
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
                          onChange={(v) => v && put(moved(placements, i, v, null))}
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
 * Component Attributes (Bell's): a row's content, shared (a component already made), new, or a copy of one; its zone
 * when it is new; its style, browsed.
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
  placing: { type: string; zone: string; at?: number; replace?: number };
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
  const [zone, setZone] = useState(placing.zone);
  const [style, setStyle] = useState(current?.style ?? BUILTIN);
  const [browse, setBrowse] = useState(false);
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
      zone,
      style: style === BUILTIN ? undefined : style,
      at: placing.at,
      replace: placing.replace,
    });
    setBusy(false);
    if (report(r, t("placed"))) done();
  };
  return (
    <Modal
      opened
      onClose={close}
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
          {placing.replace === undefined && (
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
