"use client";
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Code,
  Grid,
  Group,
  List,
  Menu,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconArrowBack, IconDownload, IconExternalLink } from "@tabler/icons-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Editable, FileBar, isMine } from "@/components/files";
import { report } from "@/components/result";
import type { FileView, VersionView } from "@/lib/present";
import { zonesOfMarkup } from "@/generated/layouts";
import { checkLayoutAction, deleteLayoutAction, saveLayoutAction } from "../../actions";
import { NEW_TAB } from "@/components/links";

const LOCALES = [
  { value: "zh", label: "简" },
  { value: "zh-hant", label: "繁" },
  { value: "en", label: "EN" },
  { value: "fr", label: "FR" },
];

/** The ways of writing a layout, each with its code (the words are the messages' layout.syntax.*). */
const SYNTAX = [
  ["zone", '<Zone name="main" />'],
  ["page", '<Title order="1">{title}</Title>   <Text>{description}</Text>'],
  [
    "grid",
    '<Grid gap="xl">\n  <Col span="12 md:8"><Zone name="main" /></Col>\n  <Col span="12 md:4"><Zone name="aside" /></Col>\n</Grid>',
  ],
  ["shell", ""],
] as const;

export function LayoutEditor({
  me,
  file,
  versions,
  layout,
  pages,
  preview,
}: {
  me: string;
  file: FileView;
  versions: VersionView[];
  layout: { id: string; name: string; markup: string; deleted: boolean };
  pages: { id: string; path: string; inIt: boolean }[];
  preview: string;
}) {
  const t = useTranslations("layout");
  const router = useRouter();
  const mine = isMine(file, me);
  const [name, setName] = useState(layout.name);
  const [markup, setMarkup] = useState(layout.markup);
  const [problems, setProblems] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [frame, setFrame] = useState(0);
  const [page, setPage] = useState<string | null>((pages.find((p) => p.inIt) ?? pages[0])?.path ?? null);
  const [locale, setLocale] = useState("zh");
  const zones = useMemo(() => zonesOfMarkup(markup), [markup]);
  const inIt = pages.filter((p) => p.inIt);
  const check = async () => {
    const r = await checkLayoutAction(markup);
    if (r.ok) setProblems(r.value ?? []);
    else report(r, "");
  };
  const save = async () => {
    setBusy(true);
    const r = await saveLayoutAction(layout.id, name, markup);
    setBusy(false);
    if (!r.ok) setProblems(r.details.length ? r.details : [r.error]);
    if (report(r, t("saved"))) {
      setProblems([]);
      router.refresh();
      setFrame((n) => n + 1);
    }
  };
  const src = page
    ? `${preview}/${locale}${page}?view=draft&layout=${encodeURIComponent(layout.id)}`
    : undefined;
  return (
    <Grid gap="lg">
      <Grid.Col span={{ base: 12, xl: 6 }}>
        <Stack gap="lg">
          <Group justify="space-between" align="flex-start">
            <div>
              <Text size="xs" c="dimmed" ff="monospace">
                /{t("path")}
              </Text>
              <Title order={1} fz={22}>
                {layout.name}
              </Title>
              <Text size="sm" c="dimmed">
                {t("lead")}
              </Text>
            </div>
            <Group gap="xs">
              <Button
                component={Link}
                href={`/?at=${encodeURIComponent("views/layouts")}`}
                variant="default"
                size="xs"
                leftSection={<IconArrowBack size={14} />}
              >
                {t("toFolder")}
              </Button>
              <Menu>
                <Menu.Target>
                  <Button variant="default" size="xs" leftSection={<IconDownload size={14} />}>
                    {t("download")}
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item component="a" href={`/api/export?kind=layout&id=${layout.id}&format=json`}>
                    JSON
                  </Menu.Item>
                  <Menu.Item component="a" href={`/api/export?kind=layout&id=${layout.id}&format=xml`}>
                    XML
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>
          </Group>
          <FileBar file={file} me={me} versions={versions} onChanged={() => setFrame((n) => n + 1)} />
          {layout.deleted ? (
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
                  <Textarea
                    label={t("markup")}
                    description={t("markupHelp")}
                    value={markup}
                    onChange={(e) => {
                      setMarkup(e.currentTarget.value);
                      setProblems(null);
                    }}
                    autosize
                    minRows={12}
                    maxRows={40}
                    spellCheck={false}
                    styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)", fontSize: 13 } }}
                    data-testid="markup"
                  />
                  <Group gap={6}>
                    <Text size="xs" c="dimmed">
                      {t("zones")}
                    </Text>
                    {zones.map((z) => (
                      <Badge key={z} size="sm" variant="light" style={{ textTransform: "none" }}>
                        {z}
                      </Badge>
                    ))}
                  </Group>
                  {problems && (
                    <Alert
                      color={problems.length ? "red" : "green"}
                      variant="light"
                      title={problems.length ? t("problems", { n: problems.length }) : t("noProblems")}
                      data-testid="problems"
                    >
                      {!!problems.length && (
                        <List size="sm" spacing={2}>
                          {problems.map((p, i) => (
                            <List.Item key={i}>{p}</List.Item>
                          ))}
                        </List>
                      )}
                    </Alert>
                  )}
                  <Group justify="space-between">
                    <Group gap="xs">
                      {!inIt.length && (
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
                                report(await deleteLayoutAction(layout.id), t("deleted")) && router.refresh(),
                            })
                          }
                        >
                          {t("delete")}
                        </Button>
                      )}
                    </Group>
                    <Group gap="xs">
                      <Button variant="default" onClick={check}>
                        {t("check")}
                      </Button>
                      <Button onClick={save} loading={busy}>
                        {t("save")}
                      </Button>
                    </Group>
                  </Group>
                </Stack>
              </Editable>
            </Card>
          )}
          <Card withBorder>
            <Title order={2} fz={16} mb="xs">
              {t("pagesIn", { n: inIt.length })}
            </Title>
            {inIt.length ? (
              <Group gap="xs">
                {inIt.map((p) => (
                  <Anchor
                    key={p.id}
                    component={Link}
                    {...NEW_TAB}
                    href={`/pages/${p.id}`}
                    size="sm"
                    ff="monospace"
                  >
                    {p.path}
                  </Anchor>
                ))}
              </Group>
            ) : (
              <Text size="sm" c="dimmed">
                {t("noPages")}
              </Text>
            )}
          </Card>
          <Card withBorder>
            <Title order={2} fz={16} mb="xs">
              {t("syntaxTitle")}
            </Title>
            <Stack gap={8}>
              {SYNTAX.map(([k, code]) => (
                <div key={k}>
                  {code && <Code block>{code}</Code>}
                  <Text size="sm">{t(`syntax.${k}`)}</Text>
                </div>
              ))}
            </Stack>
          </Card>
        </Stack>
      </Grid.Col>
      <Grid.Col span={{ base: 12, xl: 6 }}>
        <Stack gap="xs">
          <Group justify="space-between" gap="xs">
            <Select
              size="xs"
              aria-label={t("previewPage")}
              placeholder={t("previewPage")}
              data={pages.map((p) => ({ value: p.path, label: p.path }))}
              value={page}
              onChange={setPage}
              w={240}
            />
            <SegmentedControl size="xs" data={LOCALES} value={locale} onChange={setLocale} />
            {src && (
              <Anchor href={src} target="_blank" size="sm">
                {t("openTab")} <IconExternalLink size={12} />
              </Anchor>
            )}
          </Group>
          <Text size="xs" c="dimmed">
            {t("previewHelp")}
          </Text>
          {src && (
            <iframe
              key={`${frame}:${src}`}
              src={src}
              title={t("previewTitle")}
              className="cms-preview-frame"
            />
          )}
        </Stack>
      </Grid.Col>
    </Grid>
  );
}
