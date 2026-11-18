"use client";
import { Button, Card, Group, Menu, SegmentedControl, Stack, Text, Title } from "@mantine/core";
import { IconArrowBack, IconDownload } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { type Context, FieldsEditor } from "@/components/fields";
import { Editable, FileBar, isMine } from "@/components/files";
import { PreviewButton } from "@/components/preview";
import { report } from "@/components/result";
import type { Field } from "@/lib/catalog";
import type { FileView, VersionView } from "@/lib/present";
import { saveGlobalAction } from "../../actions";

export function GlobalEditor({
  me,
  file,
  versions,
  name,
  label,
  description,
  fields,
  all,
  data,
  ctx,
  back,
  preview,
}: {
  me: string;
  file: FileView;
  versions: VersionView[];
  name: string;
  label: string;
  description: string;
  fields: Field[];
  all: { key: string; label: string }[];
  data: Record<string, unknown>;
  ctx: Context;
  back?: string;
  /** Its draft on the preview: the page the Edit came from, or the home page. */
  preview: string;
}) {
  const t = useTranslations("global");
  const router = useRouter();
  const [value, setValue] = useState(data);
  const [busy, setBusy] = useState(false);
  const mine = isMine(file, me);
  const save = async () => {
    setBusy(true);
    const ok = report(await saveGlobalAction(name, value), t("saved"));
    setBusy(false);
    if (ok) router.refresh();
    return ok;
  };
  const saveButton = (size?: "xs") => (
    <Button loading={busy} onClick={save} disabled={!mine} size={size}>
      {t("save")}
    </Button>
  );
  return (
    <Stack gap="lg">
      <SegmentedControl
        value={name}
        onChange={(k) => router.push(`/globals/${k}/`)}
        data={all.map((g) => ({ value: g.key, label: g.label }))}
        style={{ alignSelf: "flex-start" }}
      />
      <Group justify="space-between">
        <div>
          <Title order={1} fz={22}>
            {label}
          </Title>
          <Text size="sm" c="dimmed">
            {description}
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
              <Menu.Item component="a" href={`/api/export?kind=global&id=${name}&format=json`}>
                JSON
              </Menu.Item>
              <Menu.Item component="a" href={`/api/export?kind=global&id=${name}&format=xml`}>
                XML
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
          <PreviewButton
            href={preview}
            save={mine && JSON.stringify(value) !== JSON.stringify(data) ? save : undefined}
          />
          {saveButton("xs")}
        </Group>
      </Group>
      <FileBar file={file} me={me} versions={versions} />
      <Card withBorder>
        <Editable open={mine}>
          <Stack>
            <FieldsEditor fields={fields} value={value} onChange={setValue} ctx={ctx} />
            <Group justify="flex-end">{saveButton()}</Group>
          </Stack>
        </Editable>
      </Card>
    </Stack>
  );
}
