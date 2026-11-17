"use client";
import {
  Accordion,
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
import { useState } from "react";
import { Editable, FileBar, isMine } from "@/components/files";
import { report } from "@/components/result";
import type { FieldRef, FileView, VersionView } from "@/lib/present";
import { ELEMENTS } from "@/generated/template";
import { checkTemplateAction, deleteTemplateAction, saveTemplateAction } from "../../actions";
import { NEW_TAB } from "@/components/links";

const LOCALES = [
  { value: "zh", label: "简" },
  { value: "zh-hant", label: "繁" },
  { value: "en", label: "EN" },
  { value: "fr", label: "FR" },
];

/** The ways of writing a template, each with its code (the words are the messages' syntax.*). */
const SYNTAX = [
  ["field", '{title}    <Anchor href="{href}">{label}</Anchor>'],
  ["count", '<Each in="cards"><Text>{#}. {title}</Text></Each>'],
  ["text", "{@nav.signIn}"],
  ["each", '<Each in="buttons">\n  <Button href="{href}" variant="{style}">{label}</Button>\n</Each>'],
  ["if", '<If field="note">…</If>   <If not="note">…</If>   <If field="style" is="number">…</If>'],
  ["works", '<Works><Text>{name}</Text></Works>   <Work slug="{work}">{tagline}</Work>'],
  ["braces", "{{ }}"],
  ["safe", ""],
] as const;

/** How a field is written into a template, by its kind. */
function usage(f: FieldRef): string {
  switch (f.kind) {
    case "list":
      return `<Each in="${f.name}">…</Each>`;
    case "html":
      return `<Html value="${f.name}" />`;
    case "link":
      return `href="{${f.name}}"`;
    case "image":
      return `src="{${f.name}}"`;
    case "icon":
      return `<Icon name="{${f.name}}" />`;
    case "work":
      return `<Work slug="{${f.name}}">{name}</Work>`;
    case "boolean":
      return `<If field="${f.name}">…</If>`;
    case "select":
      return `<If field="${f.name}" is="${f.options?.[0] ?? ""}">…</If>`;
    default:
      return `{${f.name}}`;
  }
}

function FieldsReference({ fields, depth = 0 }: { fields: FieldRef[]; depth?: number }) {
  return (
    <Stack gap={4} pl={depth ? "md" : 0}>
      {fields.map((f) => (
        <div key={f.name}>
          <Group gap={6} wrap="wrap">
            <Code>{usage(f)}</Code>
            <Text size="xs" c="dimmed">
              {f.label} · {f.kind}
              {f.options ? ` · ${f.options.join(" / ")}` : ""}
            </Text>
          </Group>
          {f.fields && <FieldsReference fields={f.fields} depth={depth + 1} />}
        </div>
      ))}
    </Stack>
  );
}

export function TemplateEditor({
  me,
  file,
  versions,
  template,
  typeLabel,
  fields,
  blocks,
  preview,
}: {
  me: string;
  file: FileView;
  versions: VersionView[];
  template: { id: string; type: string; name: string; markup: string; deleted: boolean };
  typeLabel: string;
  fields: FieldRef[];
  blocks: { id: string; name: string; drawn: boolean; onPage: boolean }[];
  preview: string;
}) {
  const t = useTranslations("template");
  const tf = useTranslations("files");
  const router = useRouter();
  const mine = isMine(file, me);
  const [name, setName] = useState(template.name);
  const [markup, setMarkup] = useState(template.markup);
  const [problems, setProblems] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [frame, setFrame] = useState(0);
  const shown = blocks.filter((b) => b.onPage);
  const [block, setBlock] = useState<string | null>((shown.find((b) => b.drawn) ?? shown[0])?.id ?? null);
  const [locale, setLocale] = useState("zh");
  const drawn = blocks.filter((b) => b.drawn);
  const folder = `/?at=${encodeURIComponent(`views/styles/${template.type}`)}`;
  const check = async () => {
    const r = await checkTemplateAction(template.type, markup);
    if (r.ok) setProblems(r.value ?? []);
    else report(r, "");
  };
  const save = async () => {
    setBusy(true);
    const r = await saveTemplateAction(template.id, name, markup);
    setBusy(false);
    if (!r.ok) setProblems(r.details.length ? r.details : [r.error]);
    if (report(r, t("saved"))) {
      setProblems([]);
      router.refresh();
      setFrame((n) => n + 1);
    }
  };
  const src = block
    ? `${preview}/${locale}/__cms__/?view=draft&block=${encodeURIComponent(block)}&template=${encodeURIComponent(template.id)}`
    : undefined;
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
                {template.name}
              </Title>
              <Text size="sm" c="dimmed">
                {t("lead", { type: typeLabel })}
              </Text>
            </div>
            <Group gap="xs">
              <Button
                component={Link}
                href={folder}
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
                  <Menu.Item component="a" href={`/api/export?kind=template&id=${template.id}&format=json`}>
                    JSON
                  </Menu.Item>
                  <Menu.Item component="a" href={`/api/export?kind=template&id=${template.id}&format=xml`}>
                    XML
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>
          </Group>
          <FileBar file={file} me={me} versions={versions} onChanged={() => setFrame((n) => n + 1)} />
          {template.deleted ? (
            <Alert color="yellow" title={t("deletedTitle")}>
              {t("deletedBody")}
            </Alert>
          ) : (
            <Card withBorder>
              <Editable open={mine}>
                <Stack>
                  <TextInput
                    label={t("name")}
                    description={tf("nameRule")}
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
                    minRows={14}
                    maxRows={40}
                    spellCheck={false}
                    styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)", fontSize: 13 } }}
                    data-testid="markup"
                  />
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
                      {!drawn.length && (
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
                                report(await deleteTemplateAction(template.id), t("deleted")) &&
                                router.refresh(),
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
              {t("drawnBlocks", { n: drawn.length })}
            </Title>
            {drawn.length ? (
              <Group gap="xs">
                {drawn.map((b) => (
                  <Anchor key={b.id} component={Link} {...NEW_TAB} href={`/components/${b.id}`} size="sm">
                    {b.name}
                  </Anchor>
                ))}
              </Group>
            ) : (
              <Text size="sm" c="dimmed">
                {t("noBlocks")}
              </Text>
            )}
          </Card>
          <Card withBorder>
            <Title order={2} fz={16} mb="xs">
              {t("reference")}
            </Title>
            <Accordion variant="contained" multiple defaultValue={["fields"]}>
              <Accordion.Item value="fields">
                <Accordion.Control>{t("fieldsTitle", { type: typeLabel })}</Accordion.Control>
                <Accordion.Panel>
                  <FieldsReference fields={fields} />
                </Accordion.Panel>
              </Accordion.Item>
              <Accordion.Item value="syntax">
                <Accordion.Control>{t("syntaxTitle")}</Accordion.Control>
                <Accordion.Panel>
                  <Stack gap={8}>
                    {SYNTAX.map(([k, code]) => (
                      <div key={k}>
                        {code && <Code block>{code}</Code>}
                        <Text size="sm">{t(`syntax.${k}`)}</Text>
                      </div>
                    ))}
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
              <Accordion.Item value="elements">
                <Accordion.Control>
                  {t("elementsTitle", { n: Object.keys(ELEMENTS).length })}
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack gap={6}>
                    {Object.entries(ELEMENTS).map(([tag, def]) => (
                      <div key={tag}>
                        <Group gap={6}>
                          <Code>{`<${tag}${def.leaf ? " />" : ">"}`}</Code>
                          {def.needs && (
                            <Badge size="xs" variant="light">
                              {t("needs", { list: def.needs.join(", ") })}
                            </Badge>
                          )}
                          {def.inside && (
                            <Badge size="xs" variant="light" color="gray">
                              {t("inside", { parent: `<${def.inside}>` })}
                            </Badge>
                          )}
                        </Group>
                        <Text size="xs" c="dimmed">
                          {Object.keys(def.attrs).join(" ") || t("noAttrs")}
                        </Text>
                      </div>
                    ))}
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          </Card>
        </Stack>
      </Grid.Col>
      <Grid.Col span={{ base: 12, xl: 6 }}>
        <Stack gap="xs">
          <Group justify="space-between" gap="xs">
            <Select
              size="xs"
              aria-label={t("previewBlock")}
              placeholder={t("previewBlock")}
              data={shown.map((b) => ({ value: b.id, label: b.name }))}
              value={block}
              onChange={setBlock}
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
          {src ? (
            <iframe
              key={`${frame}:${src}`}
              src={src}
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
