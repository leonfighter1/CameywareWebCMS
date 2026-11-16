"use client";
import {
  ActionIcon,
  Alert,
  Anchor,
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
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FieldsEditor } from "@/components/fields";
import { Editable, FileBar, isMine, StateBadges } from "@/components/files";
import { report } from "@/components/result";
import type { FileView, VersionView } from "@/lib/present";
import type { L10n } from "@/generated/model";
import { addBlockAction, deletePageAction, savePageAction, setBlocksAction } from "../../actions";

export function PageEditor({
  me,
  file,
  versions,
  page,
  blocks,
  existing,
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
    width: "normal" | "narrow";
    spacing: "compact" | "roomy";
    title: L10n;
    description: L10n;
    deleted: boolean;
  };
  blocks: { id: string; type: string; label: string; name: string; missing: boolean; file?: FileView }[];
  existing: { value: string; label: string }[];
  types: { value: string; label: string }[];
  preview: string;
}) {
  const t = useTranslations("page");
  const router = useRouter();
  const mine = isMine(file, me);
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
      report(await savePageAction(page.id, { path, status, width, spacing, title, description }), t("saved")),
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
  const textFields = [
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

  return (
    <Grid gap="lg">
      <Grid.Col span={{ base: 12, xl: 6 }}>
        <Stack gap="lg">
          <Group justify="space-between">
            <Title order={1} fz={22} ff="monospace">
              {page.path}
            </Title>
            <Group gap="xs">
              <Menu>
                <Menu.Target>
                  <Button variant="default" size="xs" leftSection={<IconDownload size={14} />}>
                    {t("download")}
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item component="a" href={`/api/export?kind=page&id=${page.id}&format=json`}>
                    {t("downloadJson")}
                  </Menu.Item>
                  <Menu.Item component="a" href={`/api/export?kind=page&id=${page.id}&format=xml`}>
                    {t("downloadXml")}
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
            <>
              <Card withBorder>
                <Editable open={mine}>
                  <Stack>
                    <Title order={2} fz={18}>
                      {t("settings")}
                    </Title>
                    <TextInput
                      label={t("path")}
                      description={t("pathHelp")}
                      value={settings.path}
                      onChange={(e) => setSettings({ ...settings, path: e.currentTarget.value })}
                      ff="monospace"
                    />
                    <Switch
                      label={t("activeSwitch")}
                      checked={settings.status === "active"}
                      onChange={(e) =>
                        setSettings({ ...settings, status: e.currentTarget.checked ? "active" : "inactive" })
                      }
                    />
                    <Group grow>
                      <Select
                        label={t("width")}
                        data={[
                          { value: "normal", label: t("widthNormal") },
                          { value: "narrow", label: t("widthNarrow") },
                        ]}
                        value={settings.width}
                        onChange={(v) => setSettings({ ...settings, width: (v ?? "normal") as "normal" })}
                      />
                      <Select
                        label={t("spacing")}
                        data={[
                          { value: "compact", label: t("spacingCompact") },
                          { value: "roomy", label: t("spacingRoomy") },
                        ]}
                        value={settings.spacing}
                        onChange={(v) => setSettings({ ...settings, spacing: (v ?? "compact") as "compact" })}
                      />
                    </Group>
                    <FieldsEditor
                      fields={textFields}
                      value={{ title: settings.title, description: settings.description }}
                      ctx={{ works: [], icons: [] }}
                      onChange={(v) =>
                        setSettings({
                          ...settings,
                          title: v.title as L10n,
                          description: v.description as L10n,
                        })
                      }
                    />
                    <Group justify="flex-end">
                      <Button onClick={save} loading={busy}>
                        {t("saveSettings")}
                      </Button>
                    </Group>
                  </Stack>
                </Editable>
              </Card>

              <Card withBorder>
                <Title order={2} fz={18} mb="sm">
                  {t("blocks")}
                </Title>
                <Stack gap="xs">
                  {blocks.map((b, i) => (
                    <Card key={b.id} withBorder padding="xs" data-testid={`block-${b.id}`}>
                      <Group justify="space-between" wrap="nowrap">
                        <div>
                          <Group gap={6}>
                            <Text fw={600} size="sm" c={b.missing ? "red" : undefined}>
                              {b.missing ? t("missingBlock") : b.label}
                            </Text>
                            <StateBadges file={b.file} me={me} size="xs" />
                          </Group>
                          <Text size="xs" c="dimmed">
                            {b.name || b.id}
                          </Text>
                        </div>
                        <Group gap={4} wrap="nowrap">
                          {!b.missing && (
                            <Button
                              component={Link}
                              href={`/components/${b.id}?page=${page.id}`}
                              size="compact-xs"
                              variant="light"
                              leftSection={<IconEdit size={14} />}
                            >
                              {t("edit")}
                            </Button>
                          )}
                          <Editable open={mine}>
                            <Group gap={4} wrap="nowrap">
                              <ActionIcon
                                variant="subtle"
                                aria-label={t("up")}
                                disabled={i === 0}
                                onClick={() => move(i, -1)}
                              >
                                <IconArrowUp size={16} />
                              </ActionIcon>
                              <ActionIcon
                                variant="subtle"
                                aria-label={t("down")}
                                disabled={i === blocks.length - 1}
                                onClick={() => move(i, 1)}
                              >
                                <IconArrowDown size={16} />
                              </ActionIcon>
                              <ActionIcon
                                variant="subtle"
                                color="red"
                                aria-label={t("removeBlock")}
                                onClick={() => order(ids.filter((x) => x !== b.id))}
                              >
                                <IconX size={16} />
                              </ActionIcon>
                            </Group>
                          </Editable>
                        </Group>
                      </Group>
                    </Card>
                  ))}
                  {!blocks.length && <Text c="dimmed">{t("noBlocks")}</Text>}
                </Stack>
                <Editable open={mine}>
                  <Stack mt="md" gap="xs">
                    <Group align="flex-end" grow>
                      <Select
                        label={t("addNew")}
                        placeholder={t("pickType")}
                        data={types}
                        value={newType}
                        onChange={setNewType}
                        searchable
                      />
                      <TextInput
                        label={t("blockName")}
                        value={newName}
                        onChange={(e) => setNewName(e.currentTarget.value)}
                      />
                      <Button
                        disabled={!newType}
                        onClick={async () => {
                          const r = await addBlockAction(page.id, { type: newType!, name: newName });
                          if (report(r, t("added"))) {
                            setNewName("");
                            after(true);
                          }
                        }}
                      >
                        {t("addToEnd")}
                      </Button>
                    </Group>
                    {!!existing.length && (
                      <Group align="flex-end" grow>
                        <Select
                          label={t("addExisting")}
                          data={existing}
                          value={pick}
                          onChange={setPick}
                          searchable
                        />
                        <Button
                          variant="light"
                          disabled={!pick}
                          onClick={async () => {
                            if (
                              report(await addBlockAction(page.id, { existing: pick! }), t("addedExisting"))
                            ) {
                              setPick(null);
                              after(true);
                            }
                          }}
                        >
                          {t("addToEnd")}
                        </Button>
                      </Group>
                    )}
                  </Stack>
                </Editable>
              </Card>
            </>
          )}
        </Stack>
      </Grid.Col>
      <Grid.Col span={{ base: 12, xl: 6 }}>
        <Group justify="space-between" mb="xs">
          <Text size="sm" c="dimmed">
            {t("previewDraft")}
          </Text>
          <Anchor href={preview} target="_blank" size="sm">
            {t("openTab")} <IconExternalLink size={12} />
          </Anchor>
        </Group>
        <iframe key={frame} src={preview} title={t("previewTitle")} className="cms-preview-frame" />
      </Grid.Col>
    </Grid>
  );
}
