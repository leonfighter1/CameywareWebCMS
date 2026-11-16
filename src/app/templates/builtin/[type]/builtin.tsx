"use client";
import {
  Alert,
  Anchor,
  Button,
  Card,
  Code,
  FileButton,
  Grid,
  Group,
  ScrollArea,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconArrowBack, IconCode, IconDownload, IconPlus, IconUpload } from "@tabler/icons-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileBar, isMine } from "@/components/files";
import { report } from "@/components/result";
import type { FileView, VersionView } from "@/lib/present";
import { createTemplateAction, uploadCodeAction } from "../../../actions";
import { NEW_TAB } from "@/components/links";

export function Builtin({
  type,
  typeLabel,
  typeHelp,
  blocks,
  preview,
  me,
  canCode,
  path,
  source,
  file,
  versions,
  standing,
}: {
  type: string;
  typeLabel: string;
  typeHelp: string;
  blocks: { id: string; name: string; drawn: boolean; onPage: boolean }[];
  preview: string;
  me: string;
  /** 超级管理员: may take and replace the code (S6). */
  canCode: boolean;
  /** The file in the website's repository. */
  path: string;
  /** Its working copy; none while the website's main has no such file. */
  source?: string;
  file?: FileView;
  versions: VersionView[];
  /** The website's main changed it since the CMS took it in, or hasn't the CMS's last push yet. */
  standing?: "changed" | "behind";
}) {
  const t = useTranslations("template");
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const shown = blocks.filter((b) => b.onPage);
  const [block, setBlock] = useState<string | null>(shown[0]?.id ?? null);
  const drawn = blocks.filter((b) => b.drawn);
  const fileName = `${type}.tsx`;
  // An upload takes a file nobody has; one that is another's or in the workflow can't be replaced.
  const canUpload = canCode && !!file && (file.status === "available" || isMine(file, me)) && !file.busy;
  const upload = async (f: File | null) => {
    if (!f) return;
    setUploading(true);
    const r = await uploadCodeAction(type, f.name, await f.text());
    setUploading(false);
    if (report(r, t("codeUploaded"))) router.refresh();
  };
  return (
    <Grid gap="lg">
      <Grid.Col span={{ base: 12, xl: 6 }}>
        <Stack gap="lg">
          <Group justify="space-between" align="flex-start">
            <div>
              <Text size="xs" c="dimmed" ff="monospace">
                /{t("path")}/{typeLabel}
              </Text>
              <Title order={1} fz={22}>
                <IconCode size={20} /> {t("builtinTitle", { type: typeLabel })}
              </Title>
              <Text size="sm" c="dimmed">
                {typeHelp}
              </Text>
            </div>
            <Button
              component={Link}
              href={`/?at=${encodeURIComponent(`views/styles/${type}`)}`}
              variant="default"
              size="xs"
              leftSection={<IconArrowBack size={14} />}
            >
              {t("toFolder")}
            </Button>
          </Group>
          {file && (
            <FileBar
              file={file}
              me={me}
              versions={versions}
              download={(v) => `/api/code?id=${encodeURIComponent(type)}&version=${v}`}
            />
          )}
          <Alert color="gray" variant="light">
            {t("builtinBody", { file: path })}
          </Alert>
          {standing && (
            <Alert
              color={standing === "changed" ? "orange" : "blue"}
              variant="light"
              data-testid="code-standing"
            >
              {t(`standing.${standing}`)}
            </Alert>
          )}
          <Card withBorder data-testid="code-card">
            <Group justify="space-between" mb="xs">
              <Title order={2} fz={16}>
                {t("code")} · <Code>{fileName}</Code>
              </Title>
              {source !== undefined && (
                <Group gap="xs">
                  <Button
                    component="a"
                    href={`/api/code?id=${encodeURIComponent(type)}`}
                    size="xs"
                    variant="default"
                    leftSection={<IconDownload size={14} />}
                  >
                    {t("codeDownload")}
                  </Button>
                  <FileButton onChange={upload} accept=".tsx">
                    {(props) => (
                      <Button
                        {...props}
                        size="xs"
                        loading={uploading}
                        disabled={!canUpload}
                        leftSection={<IconUpload size={14} />}
                        data-testid="code-upload"
                      >
                        {t("codeUpload")}
                      </Button>
                    )}
                  </FileButton>
                </Group>
              )}
            </Group>
            {source === undefined ? (
              <Text size="sm" c="dimmed">
                {t("codeNoFile", { file: path })}
              </Text>
            ) : (
              <Stack gap="xs">
                <Text size="xs" c="dimmed">
                  {canCode ? t("codeHelp", { file: fileName }) : t("codeOnlySuper")}
                </Text>
                <ScrollArea.Autosize mah={480} type="auto">
                  <Code block data-testid="code-source">
                    {source}
                  </Code>
                </ScrollArea.Autosize>
              </Stack>
            )}
          </Card>
          <Card withBorder>
            <Title order={2} fz={16} mb="xs">
              {t("newFromFields")}
            </Title>
            <Group align="flex-end">
              <TextInput label={t("name")} value={name} onChange={(e) => setName(e.currentTarget.value)} />
              <Button
                leftSection={<IconPlus size={14} />}
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  const r = await createTemplateAction(type, name);
                  setBusy(false);
                  if (report(r, t("created"))) router.push(`/templates/${r.value}`);
                }}
              >
                {t("create")}
              </Button>
            </Group>
          </Card>
          <Card withBorder>
            <Title order={2} fz={16} mb="xs">
              {t("drawnBlocks", { n: drawn.length })}
            </Title>
            <Group gap="xs">
              {drawn.map((b) => (
                <Anchor key={b.id} component={Link} {...NEW_TAB} href={`/components/${b.id}`} size="sm">
                  {b.name}
                </Anchor>
              ))}
            </Group>
          </Card>
        </Stack>
      </Grid.Col>
      <Grid.Col span={{ base: 12, xl: 6 }}>
        <Stack gap="xs">
          <Select
            size="xs"
            aria-label={t("previewBlock")}
            data={shown.map((b) => ({ value: b.id, label: b.name }))}
            value={block}
            onChange={setBlock}
            w={240}
          />
          {block ? (
            <iframe
              src={`${preview}/zh/__cms__/?view=draft&block=${encodeURIComponent(block)}&template=builtin`}
              title={t("previewTitle")}
              className="cms-preview-frame"
            />
          ) : (
            <Text c="dimmed">{t("noPreview")}</Text>
          )}
        </Stack>
      </Grid.Col>
    </Grid>
  );
}
