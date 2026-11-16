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
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import {
  IconArrowBackUp,
  IconArrowRight,
  IconExternalLink,
  IconPlayerStop,
  IconRefresh,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FileTable, keyOf } from "@/components/file-table";
import { confirm } from "@/components/files";
import { report } from "@/components/result";
import type { FileView } from "@/lib/present";
import type { Action } from "@/lib/releases";
import {
  backAction,
  pushPreviewAction,
  pushProductionAction,
  rebuildCmsSiteAction,
  rebuildPreviewAction,
  rollbackProductionAction,
  terminateAction,
} from "../actions";

type Env = { release?: number; at: string; by?: string };
type Run = {
  id: number;
  env: "preview" | "production";
  action: Action;
  release: number;
  status: "running" | "done" | "failed";
  items: number;
  by: string;
  at: string;
  log: string;
};
type Release = {
  id: number;
  author: string;
  note: string;
  at: string;
  went: ("preview" | "production")[];
  manifest: boolean;
  differs?: number;
};

const STATUS_COLOR = { running: "yellow", done: "green", failed: "red" } as const;

/** One step's column: its files to pick from, what can be done to the ones picked. */
function Column({
  title,
  help,
  files,
  me,
  picked,
  setPicked,
  children,
  empty,
}: {
  title: string;
  help: string;
  files: FileView[];
  me: string;
  picked: Set<string>;
  setPicked: (s: Set<string>) => void;
  children: React.ReactNode;
  empty: string;
}) {
  const t = useTranslations("workflow");
  return (
    <Card withBorder h="100%">
      <Stack gap="sm">
        <div>
          <Title order={2} fz={18}>
            {title}
          </Title>
          <Text size="xs" c="dimmed">
            {help}
          </Text>
        </div>
        <FileTable
          files={files}
          me={me}
          picked={picked}
          onPick={setPicked}
          extra={{
            title: t("checkin"),
            cell: (f) =>
              f.checkin ? (
                <Stack gap={0}>
                  <Text size="xs">{f.checkin.message}</Text>
                  <Text size="xs" c="dimmed">
                    #{f.checkin.id} · {f.checkin.author} · {f.checkin.at}
                  </Text>
                </Stack>
              ) : null,
          }}
          empty={empty}
        />
        {children}
      </Stack>
    </Card>
  );
}

export function Board({
  me,
  canPublish,
  checkedIn,
  onPreview,
  envs,
  releases,
  runs,
  links,
}: {
  me: string;
  canPublish: boolean;
  checkedIn: FileView[];
  onPreview: FileView[];
  envs: { preview: Env; production: Env };
  releases: Release[];
  runs: Run[];
  links: { cms: string; preview: string; production: string };
}) {
  const t = useTranslations("workflow");
  const tf = useTranslations("files");
  const router = useRouter();
  const [first, setFirst] = useState<Set<string>>(new Set());
  const [second, setSecond] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [prodNote, setProdNote] = useState("");
  const running = runs.some((r) => r.status === "running");
  const runningOn = (env: Run["env"]) => runs.some((r) => r.status === "running" && r.env === env);
  // While a deployment runs, its log and its end come in by themselves.
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [running, router]);
  const pick = (files: FileView[], set: Set<string>) =>
    files.filter((f) => set.has(keyOf(f))).map((f) => ({ kind: f.kind, id: f.id }));
  const a = pick(checkedIn, first);
  const b = pick(onPreview, second);
  const done = (ok: boolean) => {
    if (!ok) return;
    setFirst(new Set());
    setSecond(new Set());
    router.refresh();
  };
  const envLine = (e: Env) =>
    e.release ? t("releaseLine", { id: e.release, by: e.by ?? "", at: e.at }) : t("none");
  return (
    <Stack gap="lg">
      <div>
        <Title order={1} fz={22}>
          {t("title")}
        </Title>
        <Text size="sm" c="dimmed">
          {t("lead")}
        </Text>
      </div>

      <SimpleGrid cols={{ base: 1, md: 3 }}>
        <Card withBorder>
          <Text fw={600}>{t("cmsPreview")}</Text>
          <Text size="sm" c="dimmed">
            {t("cmsPreviewHelp")}
          </Text>
          <Anchor href={links.cms} target="_blank" size="sm">
            {t("open")} <IconExternalLink size={12} />
          </Anchor>
        </Card>
        <Card withBorder>
          <Text fw={600}>{t("preview")}</Text>
          <Text size="sm">{envLine(envs.preview)}</Text>
          <Group gap="sm">
            <Anchor href={links.preview} target="_blank" size="sm">
              {t("open")} <IconExternalLink size={12} />
            </Anchor>
            <Anchor
              component="button"
              size="sm"
              disabled={runningOn("preview")}
              onClick={async () => done(report(await rebuildPreviewAction(), t("rebuildStarted")))}
            >
              <IconRefresh size={12} /> {t("rebuildPreview")}
            </Anchor>
          </Group>
        </Card>
        <Card withBorder>
          <Text fw={600}>{t("production")}</Text>
          <Text size="sm">{envLine(envs.production)}</Text>
          <Anchor href={links.production} target="_blank" size="sm">
            {t("open")} <IconExternalLink size={12} />
          </Anchor>
        </Card>
      </SimpleGrid>

      <Grid gap="lg">
        <Grid.Col span={{ base: 12, lg: 6 }}>
          <Column
            title={t("stageCheckedIn", { n: checkedIn.length })}
            help={t("stageCheckedInHelp")}
            files={checkedIn}
            me={me}
            picked={first}
            setPicked={setFirst}
            empty={t("emptyCheckedIn")}
          >
            <TextInput
              size="xs"
              label={t("note")}
              value={note}
              onChange={(e) => setNote(e.currentTarget.value)}
            />
            <Group gap="xs">
              <Button
                size="xs"
                rightSection={<IconArrowRight size={14} />}
                disabled={!a.length || runningOn("preview")}
                onClick={async () => {
                  const r = await pushPreviewAction(a, note);
                  if (report(r, t("previewStarted", { n: r.ok ? (r.value?.items ?? a.length) : 0 }))) {
                    setNote("");
                    done(true);
                  }
                }}
              >
                {t("toPreview", { n: a.length })}
              </Button>
              <Button
                size="xs"
                variant="light"
                color="red"
                leftSection={<IconPlayerStop size={14} />}
                disabled={!a.length}
                onClick={() =>
                  confirm({
                    title: t("terminateTitle", { n: a.length }),
                    body: t("terminateBody"),
                    label: t("terminate"),
                    cancel: tf("cancel"),
                    danger: true,
                    run: async () => done(report(await terminateAction(a), t("terminated"))),
                  })
                }
              >
                {t("terminate")}
              </Button>
            </Group>
          </Column>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 6 }}>
          <Column
            title={t("stagePreview", { n: onPreview.length })}
            help={t("stagePreviewHelp")}
            files={onPreview}
            me={me}
            picked={second}
            setPicked={setSecond}
            empty={t("emptyPreview")}
          >
            {canPublish && (
              <TextInput
                size="xs"
                label={t("note")}
                value={prodNote}
                onChange={(e) => setProdNote(e.currentTarget.value)}
              />
            )}
            <Group gap="xs">
              {canPublish ? (
                <Button
                  size="xs"
                  color="green"
                  rightSection={<IconArrowRight size={14} />}
                  disabled={!b.length || runningOn("production")}
                  onClick={() =>
                    confirm({
                      title: t("toProductionTitle", { n: b.length }),
                      body: t("toProductionBody"),
                      label: t("toProductionShort"),
                      cancel: tf("cancel"),
                      run: async () => {
                        const r = await pushProductionAction(b, prodNote);
                        if (report(r, t("productionStarted"))) {
                          setProdNote("");
                          done(true);
                        }
                      },
                    })
                  }
                >
                  {t("toProduction", { n: b.length })}
                </Button>
              ) : null}
              <Button
                size="xs"
                variant="light"
                leftSection={<IconArrowBackUp size={14} />}
                disabled={!b.length || runningOn("preview")}
                onClick={() =>
                  confirm({
                    title: t("backTitle", { n: b.length }),
                    body: t("backBody"),
                    label: t("back"),
                    cancel: tf("cancel"),
                    run: async () => done(report(await backAction(b), t("backStarted"))),
                  })
                }
              >
                {t("back")}
              </Button>
            </Group>
            {!canPublish && (
              <Alert color="gray" p="xs">
                <Text size="xs">{t("onlyAdmins")}</Text>
              </Alert>
            )}
          </Column>
        </Grid.Col>
      </Grid>

      <Card withBorder>
        <Group justify="space-between" mb="sm">
          <Title order={2} fz={18}>
            {t("deployments")}
          </Title>
          <Button
            size="xs"
            variant="default"
            leftSection={<IconRefresh size={14} />}
            onClick={async () =>
              report(await rebuildCmsSiteAction(), t("cmsRebuildStarted")) && router.refresh()
            }
          >
            {t("rebuildCms")}
          </Button>
        </Group>
        <Stack gap="xs">
          {runs.map((r) => (
            <details key={r.id} open={r.status === "running"}>
              <summary style={{ cursor: "pointer" }}>
                <Group gap="xs" display="inline-flex">
                  <Badge color={STATUS_COLOR[r.status]}>{t(`status.${r.status}`)}</Badge>
                  <Text size="sm" span>
                    {t("runLine", {
                      env: t(r.env === "preview" ? "preview" : "production"),
                      action: t(`actions.${r.action}`),
                      id: r.release,
                      n: r.items,
                      by: r.by,
                      at: r.at,
                    })}
                  </Text>
                </Group>
              </summary>
              <Code block mt="xs" style={{ maxHeight: 320, overflow: "auto", whiteSpace: "pre-wrap" }}>
                {r.log || t("noOutput")}
              </Code>
            </details>
          ))}
          {!runs.length && <Text c="dimmed">{t("noRuns")}</Text>}
        </Stack>
      </Card>

      <Card withBorder>
        <Title order={2} fz={18}>
          {t("releases")}
        </Title>
        <Text size="xs" c="dimmed" mb="sm">
          {t("releasesHelp")}
        </Text>
        <Table.ScrollContainer minWidth={640}>
          <Table verticalSpacing="xs">
            <Table.Tbody>
              {releases.map((r) => (
                <Table.Tr key={r.id}>
                  <Table.Td>
                    <Text fw={600}>#{r.id}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">
                      {r.at} · {r.author}
                      {r.note ? ` · ${r.note}` : ""}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      {envs.preview.release === r.id && <Badge variant="light">{t("preview")}</Badge>}
                      {envs.production.release === r.id && (
                        <Badge color="green" variant="light">
                          {t("production")}
                        </Badge>
                      )}
                      {r.went.includes("production") && envs.production.release !== r.id && (
                        <Badge color="gray" variant="outline">
                          {t("wasProduction")}
                        </Badge>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} justify="flex-end">
                      {canPublish &&
                        r.manifest &&
                        r.went.includes("production") &&
                        envs.production.release !== r.id && (
                          <Button
                            size="compact-xs"
                            variant="subtle"
                            color="red"
                            disabled={runningOn("production")}
                            onClick={() =>
                              confirm({
                                title: t("rollbackTitle", { id: r.id }),
                                body: t("rollbackBody", { n: r.differs ?? 0 }),
                                label: t("rollback"),
                                cancel: tf("cancel"),
                                danger: true,
                                run: async () =>
                                  done(report(await rollbackProductionAction(r.id), t("rollbackStarted"))),
                              })
                            }
                          >
                            {t("rollback")}
                          </Button>
                        )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>
    </Stack>
  );
}
