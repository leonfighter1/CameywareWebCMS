"use client";
import { Alert, Anchor, Button, Card, Grid, Group, Menu, Stack, Text, TextInput, Title } from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconArrowBack, IconDownload, IconExternalLink } from "@tabler/icons-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { type Context, FieldsEditor } from "@/components/fields";
import { Editable, FileBar, isMine } from "@/components/files";
import { report } from "@/components/result";
import type { Field } from "@/lib/catalog";
import type { FileView, VersionView } from "@/lib/present";
import { deleteComponentAction, saveComponentAction } from "../../actions";
import { NEW_TAB } from "@/components/links";

/**
 * A block's editor: its content alone (its name and fields); where it stands, in which zone and style, is each page's
 * (the page editor), listed here.
 */
export function ComponentEditor({
  me,
  file,
  versions,
  component,
  typeLabel,
  typeHelp,
  fields,
  ctx,
  pages,
  preview,
  back,
}: {
  me: string;
  file: FileView;
  versions: VersionView[];
  component: { id: string; type: string; name: string; data: Record<string, unknown>; deleted: boolean };
  typeLabel: string;
  typeHelp: string;
  fields: Field[];
  ctx: Context;
  /** The pages it stands on: each place's zone and style. */
  pages: { id: string; path: string; zone: string; style: string }[];
  preview?: string;
  back?: string;
}) {
  const t = useTranslations("component");
  const router = useRouter();
  const mine = isMine(file, me);
  const [name, setName] = useState(component.name);
  const [data, setData] = useState(component.data);
  const [busy, setBusy] = useState(false);
  const [frame, setFrame] = useState(0);
  const save = async () => {
    setBusy(true);
    const ok = report(await saveComponentAction(component.id, name, data), t("saved"));
    setBusy(false);
    if (ok) {
      router.refresh();
      setFrame((n) => n + 1);
    }
  };
  return (
    <Grid gap="lg">
      <Grid.Col span={{ base: 12, xl: 6 }}>
        <Stack gap="lg">
          <Group justify="space-between">
            <div>
              <Title order={1} fz={22}>
                {typeLabel}
              </Title>
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
                  {t("back")}
                </Button>
              )}
              <Menu>
                <Menu.Target>
                  <Button variant="default" size="xs" leftSection={<IconDownload size={14} />}>
                    {t("download")}
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
          <FileBar file={file} me={me} versions={versions} onChanged={() => setFrame((n) => n + 1)} />
          {component.deleted ? (
            <Alert color="yellow" title={t("deletedTitle")}>
              {t("deletedBody")}
            </Alert>
          ) : (
            <Card withBorder>
              <Editable open={mine}>
                <Stack>
                  <TextInput
                    label={t("name")}
                    value={name}
                    onChange={(e) => setName(e.currentTarget.value)}
                  />
                  <FieldsEditor fields={fields} value={data} onChange={setData} ctx={ctx} />
                  <Group justify="space-between">
                    <Group gap="xs">
                      {!pages.length && (
                        <Button
                          color="red"
                          variant="light"
                          onClick={() =>
                            modals.openConfirmModal({
                              title: t("deleteTitle"),
                              children: <Text size="sm">{t("deleteBody")}</Text>,
                              labels: { confirm: t("delete"), cancel: t("cancel") },
                              confirmProps: { color: "red" },
                              onConfirm: async () =>
                                report(await deleteComponentAction(component.id), t("deleted")) &&
                                router.refresh(),
                            })
                          }
                        >
                          {t("delete")}
                        </Button>
                      )}
                    </Group>
                    <Button onClick={save} loading={busy}>
                      {t("save")}
                    </Button>
                  </Group>
                </Stack>
              </Editable>
            </Card>
          )}
          <Card withBorder>
            <Title order={2} fz={16} mb="xs">
              {t("usedOn")}
            </Title>
            {pages.length ? (
              <Stack gap={4}>
                {pages.map((p, i) => (
                  <Group key={`${p.id}:${i}`} gap="xs">
                    <Anchor component={Link} {...NEW_TAB} href={`/pages/${p.id}`} ff="monospace" size="sm">
                      {p.path}
                    </Anchor>
                    <Text size="xs" c="dimmed">
                      {t("placedAs", { zone: p.zone, style: p.style })}
                    </Text>
                  </Group>
                ))}
              </Stack>
            ) : (
              <Text size="sm" c="dimmed">
                {t("unused")}
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
                {t("previewDraft")}
              </Text>
              <Anchor href={preview} target="_blank" size="sm">
                {t("openTab")} <IconExternalLink size={12} />
              </Anchor>
            </Group>
            <iframe key={frame} src={preview} title={t("previewTitle")} className="cms-preview-frame" />
          </>
        ) : (
          <Text c="dimmed">{t("noPreview")}</Text>
        )}
      </Grid.Col>
    </Grid>
  );
}
