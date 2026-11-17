"use client";
/**
 * Into the workflow (S7; the owner, 2026-11-16, after Bell's Publish dialog: 「可以添加到已有的workflow也可以添加到别人的
 * workflow里，默认是自己已有的，也可以新建workflow. 第三个tab是添加到其他人的workflow」; the ticket 「可以不填」): the files
 * chosen and their 依赖 (what goes along: 「你需要更加明了指出是哪个文件需要checkout」; one someone else holds taken over
 * here, or the dialog can't add), then three tabs: 我的任务 (yours at 进行中, the default), 新建任务, 加到其他人的任务.
 * With [split] (Bell's Split selected items to a new Job): the job's files, those moving marked, into a new job. Opened
 * by `jobModal` (files.tsx).
 */
import {
  Alert,
  Box,
  Button,
  Group,
  Radio,
  ScrollArea,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
} from "@mantine/core";
import { IconArrowRight } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
  addToJobAction,
  createJobAction,
  dependenciesAction,
  openJobsAction,
  splitJobAction,
} from "@/app/actions";
import type { Kind } from "@/lib/files";
import type { DependencyView } from "@/lib/present";
import type { Result } from "@/lib/server";
import { DependencyTable } from "./dependencies";
import { keyOf } from "./file-table";
import { takeFiles } from "./files";
import { report } from "./result";

/** A file chosen: its name where the caller has it. */
export type Chosen = { kind: Kind; id: string; label?: string };
type OpenJob = {
  id: number;
  ticket: string;
  name: string;
  author: string;
  files: number;
  at: string;
  mine: boolean;
};
type Tab = "mine" | "new" | "others";

/** Jobs at 进行中 to put the files into: one picked. */
function JobPick({
  jobs,
  pick,
  onPick,
  empty,
}: {
  jobs: OpenJob[];
  pick: number | null;
  onPick: (id: number) => void;
  empty: string;
}) {
  const t = useTranslations("jobs");
  if (!jobs.length)
    return (
      <Text size="sm" c="dimmed" py="sm">
        {empty}
      </Text>
    );
  return (
    <ScrollArea.Autosize mah={260}>
      <Table highlightOnHover verticalSpacing={6} data-testid="job-pick-table">
        <Table.Thead>
          <Table.Tr>
            <Table.Th w={36} />
            <Table.Th>{t("ticket")}</Table.Th>
            <Table.Th>{t("name")}</Table.Th>
            <Table.Th>{t("author")}</Table.Th>
            <Table.Th>{t("modified")}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {jobs.map((j) => (
            <Table.Tr
              key={j.id}
              onClick={() => onPick(j.id)}
              style={{ cursor: "pointer" }}
              bg={pick === j.id ? "var(--mantine-primary-color-light)" : undefined}
              data-testid={`job-pick-${j.id}`}
            >
              <Table.Td>
                <Radio
                  checked={pick === j.id}
                  onChange={() => onPick(j.id)}
                  aria-label={`#${j.id} ${j.name}`}
                />
              </Table.Td>
              <Table.Td>
                <Text size="sm" ff="monospace">
                  {j.ticket || "—"}
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm">
                  #{j.id} {j.name}
                </Text>
                <Text size="xs" c="dimmed">
                  {t("filesCount", { n: j.files })}
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm">{j.author}</Text>
              </Table.Td>
              <Table.Td>
                <Text size="xs">{j.at}</Text>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </ScrollArea.Autosize>
  );
}

export function JobForm({
  items,
  split,
  close,
  done,
}: {
  items: Chosen[];
  /** Split off from this job: its ticket offered again, its files shown with those moving marked. */
  split?: { job: number; ticket: string; files: Chosen[] };
  close: () => void;
  /** After it went in: the job's number. */
  done: (job?: number) => void;
}) {
  const t = useTranslations("jobs");
  const tf = useTranslations("files");
  const [tab, setTab] = useState<Tab>("mine");
  const [ticket, setTicket] = useState(split?.ticket ?? "");
  const [name, setName] = useState("");
  const [jobs, setJobs] = useState<OpenJob[] | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [deps, setDeps] = useState<DependencyView[]>([]);
  const loadDeps = () =>
    dependenciesAction(items.map(({ kind, id }) => ({ kind, id }))).then(
      (r) => r.ok && setDeps(r.value ?? []),
    );
  useEffect(() => {
    if (split) return;
    void loadDeps();
    void openJobsAction().then((r) => {
      const all = r.ok ? (r.value ?? []) : [];
      setJobs(all);
      // None of yours yet: a new one.
      if (!all.some((j) => j.mine)) setTab("new");
    });
    // Once, as it opens: its files don't change while it is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [split]);
  const mine = (jobs ?? []).filter((j) => j.mine);
  const others = (jobs ?? []).filter((j) => !j.mine);
  const making = !!split || tab === "new";
  const theirs = deps.filter((d) => d.state === "others");
  const blocked = deps.some((d) => d.state === "others" || d.state === "gone");
  const ready =
    !blocked &&
    (making ? !!name.trim() : pick !== null && (tab === "mine" ? mine : others).some((j) => j.id === pick));
  const submit = async () => {
    setBusy(true);
    const r: Result<number | void> = split
      ? await splitJobAction(split.job, items, ticket, name)
      : making
        ? await createJobAction(items, ticket, name)
        : await addToJobAction(pick!, items);
    setBusy(false);
    const id = r.ok && typeof r.value === "number" ? r.value : (pick ?? undefined);
    if (
      report(
        r,
        split
          ? t("splitDone", { id: id ?? 0 })
          : making
            ? t("created", { id: id ?? 0 })
            : t("added", { id: id ?? 0 }),
      )
    ) {
      close();
      done(id);
    }
  };
  const moving = new Set(items.map(keyOf));
  const names = (
    <Stack gap={4}>
      <Text size="sm" fw={600}>
        {split ? t("jobFiles", { n: split.files.length }) : t("chosen", { n: items.length })}
      </Text>
      <ScrollArea.Autosize mah={160}>
        <Box component="ol" m={0} pl="lg" data-testid="job-chosen">
          {(split ? split.files : items).map((f) => (
            <Text
              component="li"
              key={keyOf(f)}
              size="sm"
              fw={split && moving.has(keyOf(f)) ? 700 : undefined}
              c={split && !moving.has(keyOf(f)) ? "dimmed" : undefined}
            >
              {tf(`kinds.${f.kind}`)} · {f.label ?? f.id}
              {split && moving.has(keyOf(f)) && <IconArrowRight size={12} style={{ marginLeft: 6 }} />}
            </Text>
          ))}
        </Box>
      </ScrollArea.Autosize>
      {split ? (
        <Text size="xs" c="dimmed">
          {t("splitHelp", { n: items.length })}
        </Text>
      ) : (
        <Text size="xs" c="dimmed">
          {t("joinHelp", { n: items.length })}
        </Text>
      )}
    </Stack>
  );
  const fields = (
    <Stack gap="xs">
      <TextInput
        label={t("ticket")}
        description={t("ticketHelp")}
        value={ticket}
        onChange={(e) => setTicket(e.currentTarget.value)}
        data-testid="job-ticket"
      />
      <TextInput
        label={t("name")}
        required
        data-autofocus
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
        onKeyDown={(e) => e.key === "Enter" && ready && void submit()}
        data-testid="job-name"
      />
    </Stack>
  );
  const along = !split && !!deps.length && (
    <Stack gap={4} data-testid="job-deps">
      <Text size="sm" fw={600}>
        {t("deps", { n: deps.length })}
      </Text>
      {blocked && (
        <Alert color="orange" p="xs" data-testid="job-deps-blocked">
          <Group justify="space-between" gap="xs" wrap="nowrap">
            <Text size="sm">{t("depsBlocked")}</Text>
            {!!theirs.length && (
              <Button
                size="xs"
                color="orange"
                loading={busy}
                data-testid="job-deps-take"
                onClick={async () => {
                  setBusy(true);
                  if (await takeFiles(theirs, tf, true)) await loadDeps();
                  setBusy(false);
                }}
              >
                {t("takeOverAll", { n: theirs.length })}
              </Button>
            )}
          </Group>
        </Alert>
      )}
      <ScrollArea.Autosize mah={200}>
        <DependencyTable deps={deps} />
      </ScrollArea.Autosize>
    </Stack>
  );
  return (
    <Stack gap="md">
      {names}
      {along}
      {split ? (
        fields
      ) : (
        <Tabs value={tab} onChange={(v) => v && setTab(v as Tab)} keepMounted={false}>
          <Tabs.List>
            <Tabs.Tab value="mine" data-testid="tab-mine">
              {t("tabMine", { n: mine.length })}
            </Tabs.Tab>
            <Tabs.Tab value="new" data-testid="tab-new">
              {t("newJob")}
            </Tabs.Tab>
            <Tabs.Tab value="others" data-testid="tab-others">
              {t("tabOthers", { n: others.length })}
            </Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="mine" pt="sm">
            <JobPick jobs={mine} pick={pick} onPick={setPick} empty={jobs ? t("noneMine") : t("loading")} />
          </Tabs.Panel>
          <Tabs.Panel value="new" pt="sm">
            {fields}
          </Tabs.Panel>
          <Tabs.Panel value="others" pt="sm">
            <Text size="xs" c="dimmed" mb={4}>
              {t("othersHelp")}
            </Text>
            <JobPick
              jobs={others}
              pick={pick}
              onPick={setPick}
              empty={jobs ? t("noneOthers") : t("loading")}
            />
          </Tabs.Panel>
        </Tabs>
      )}
      <Group justify="flex-end">
        <Button variant="default" onClick={close}>
          {t("cancel")}
        </Button>
        <Button loading={busy} disabled={!ready} onClick={submit} data-testid="job-save">
          {split ? t("moveToNew") : making ? t("create") : t("add")}
        </Button>
      </Group>
    </Stack>
  );
}
