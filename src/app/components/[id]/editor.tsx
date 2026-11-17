"use client";
import { Alert, Button, Card, Group, Menu, Stack, Text, TextInput, Title } from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconArrowBack, IconDownload } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { type Context, FieldsEditor } from "@/components/fields";
import { Editable, FileBar, isMine } from "@/components/files";
import { PreviewButton } from "@/components/preview";
import { report } from "@/components/result";
import { UsedOn } from "@/components/used-on";
import type { Field } from "@/lib/catalog";
import type { FileView, PageUse, VersionView } from "@/lib/present";
import { deleteComponentAction, saveComponentAction } from "../../actions";

/**
 * A block's editor: its content alone (its name and fields); where it stands, in which zone and style, is each page's
 * (the page editor), listed behind 用在 N 个页面. 保存 and 预览 at the top too; the preview opens in a tab of its own.
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
  uses,
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
  /** The pages it stands on, each place's zone and style: behind 用在 N 个页面. */
  uses: PageUse[];
  /** Its draft on the preview: on the page it was opened from, or the first it stands on; none when on no page. */
  preview?: string;
  back?: string;
}) {
  const t = useTranslations("component");
  const router = useRouter();
  const mine = isMine(file, me);
  const [name, setName] = useState(component.name);
  const [data, setData] = useState(component.data);
  const [busy, setBusy] = useState(false);
  const changed = name !== component.name || JSON.stringify(data) !== JSON.stringify(component.data);
  const save = async () => {
    setBusy(true);
    const ok = report(await saveComponentAction(component.id, name, data), t("saved"));
    setBusy(false);
    if (ok) router.refresh();
    return ok;
  };
  const saveButton = (size?: "xs") => (
    <Button onClick={save} loading={busy} disabled={!mine} size={size}>
      {t("save")}
    </Button>
  );
  return (
    <Stack gap="lg" maw={1100}>
      <Group justify="space-between">
        <div>
          <Title order={1} fz={22}>
            {typeLabel}
          </Title>
          <Text size="sm" c="dimmed">
            {typeHelp}
          </Text>
          <UsedOn name={component.name || component.id} uses={uses} />
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
          {!component.deleted && (
            <>
              <PreviewButton href={preview} save={mine && changed ? save : undefined} none={t("noPreview")} />
              {saveButton("xs")}
            </>
          )}
        </Group>
      </Group>
      <FileBar file={file} me={me} versions={versions} />
      {component.deleted ? (
        <Alert color="yellow" title={t("deletedTitle")}>
          {t("deletedBody")}
        </Alert>
      ) : (
        <Card withBorder>
          <Editable open={mine}>
            <Stack>
              <TextInput label={t("name")} value={name} onChange={(e) => setName(e.currentTarget.value)} />
              <FieldsEditor fields={fields} value={data} onChange={setData} ctx={ctx} />
              <Group justify="space-between">
                <Group gap="xs">
                  {!uses.length && (
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
                {saveButton()}
              </Group>
            </Stack>
          </Editable>
        </Card>
      )}
    </Stack>
  );
}
