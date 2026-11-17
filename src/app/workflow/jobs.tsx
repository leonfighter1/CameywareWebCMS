"use client";
/**
 * The 工作流 page as Bell's Workflow Job Manager (S7): the job picked, its steps and what can be done at its step now
 * (by its author, or 管理员 and up; approving and publishing by 管理员 and up alone); the jobs to pick from; the job's
 * files, by category and kind, to remove, split off or export; its history; and the deployment running now.
 */
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Code,
  Group,
  Loader,
  Modal,
  Pagination,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Stepper,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconArrowBackUp,
  IconArrowRight,
  IconCalendarTime,
  IconCheck,
  IconDownload,
  IconExternalLink,
  IconPlayerStop,
  IconRefresh,
  IconSearch,
  IconSend,
  IconX,
} from "@tabler/icons-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { type CmsSite, CmsSiteBadge } from "@/components/cms-site";
import { FileTable, keyOf } from "@/components/file-table";
import { confirm, jobModal } from "@/components/files";
import { JobTable, StepBadge } from "@/components/job-table";
import { NEW_TAB } from "@/components/links";
import { report } from "@/components/result";
import type { Kind } from "@/lib/files";
import type { JobEvent, Step } from "@/lib/jobs";
import type { FileView, JobView } from "@/lib/present";
import type { Action } from "@/lib/releases";
import type { Result } from "@/lib/server";
import {
  approveJobAction,
  cancelScheduleAction,
  jobBackAction,
  jobPreviewAction,
  publishJobAction,
  rebuildCmsSiteAction,
  rebuildPreviewAction,
  rejectJobAction,
  removeFromJobAction,
  submitJobAction,
  terminateJobAction,
} from "../actions";
import { STATUS_COLOR } from "../deployments/list";

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
type JobRun = {
  id: number;
  env: "preview" | "production";
  action: string;
  status: Run["status"];
  at: string;
};

/** The steps a job goes along (已定时 sits with 已批准; 已终止 leaves the line). */
const LINE: Step[] = ["progress", "preview", "submitted", "approved", "done"];
const AT: Record<Step, number> = {
  progress: 0,
  preview: 1,
  submitted: 2,
  approved: 3,
  scheduled: 3,
  done: 5,
  terminated: 0,
};
/** The explorer's two categories, Bell's Content Category: the content and the views. */
const CATEGORIES: { key: "content" | "views"; kinds: Kind[] }[] = [
  { key: "content", kinds: ["page", "component", "global", "bundle"] },
  { key: "views", kinds: ["template", "layout", "code"] },
];

/** How many questions were asked: each one's dialog its own name. */
let asked = 0;

/** Asked for a line of words (a note, a reason), then [run]: closed when it went through. */
function Ask({
  label,
  required,
  confirmLabel,
  color,
  run,
  close,
}: {
  label: string;
  required?: boolean;
  confirmLabel: string;
  color?: string;
  run: (text: string) => Promise<boolean>;
  close: () => void;
}) {
  const t = useTranslations("jobs");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Stack gap="sm">
      <Textarea
        label={label}
        required={required}
        autosize
        minRows={2}
        data-autofocus
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        data-testid="ask-text"
      />
      <Group justify="flex-end">
        <Button variant="default" onClick={close}>
          {t("cancel")}
        </Button>
        <Button
          color={color}
          loading={busy}
          disabled={required && !text.trim()}
          data-testid="ask-ok"
          onClick={async () => {
            setBusy(true);
            const ok = await run(text);
            setBusy(false);
            if (ok) close();
          }}
        >
          {confirmLabel}
        </Button>
      </Group>
    </Stack>
  );
}

/** 发布: now, or at a time (the owner: 「可以设置也可以跳过」); a note for the release. */
function PublishForm({ job, close, done }: { job: number; close: () => void; done: () => void }) {
  const t = useTranslations("jobs");
  const tw = useTranslations("workflow");
  const [when, setWhen] = useState<"now" | "later">("now");
  const [at, setAt] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const time = at ? new Date(at) : undefined;
  return (
    <Stack gap="sm">
      <SegmentedControl
        value={when}
        onChange={(v) => setWhen(v as "now" | "later")}
        data={[
          { value: "now", label: t("publishNow") },
          { value: "later", label: t("publishLater") },
        ]}
        data-testid="publish-when"
      />
      {when === "later" ? (
        <TextInput
          type="datetime-local"
          label={t("publishAt")}
          description={t("publishAtHelp")}
          value={at}
          onChange={(e) => setAt(e.currentTarget.value)}
          data-testid="publish-at"
        />
      ) : (
        <Text size="sm">{tw("toProductionBody")}</Text>
      )}
      <TextInput label={tw("note")} value={note} onChange={(e) => setNote(e.currentTarget.value)} />
      <Group justify="flex-end">
        <Button variant="default" onClick={close}>
          {t("cancel")}
        </Button>
        <Button
          color="green"
          loading={busy}
          disabled={when === "later" && !(time && !Number.isNaN(time.getTime()))}
          data-testid="publish-ok"
          onClick={async () => {
            setBusy(true);
            const r = await publishJobAction(job, when === "later" ? time!.toISOString() : null, note);
            setBusy(false);
            if (report(r, when === "later" ? t("scheduledDone") : tw("productionStarted"))) {
              close();
              done();
            }
          }}
        >
          {when === "later" ? t("schedule") : t("publish")}
        </Button>
      </Group>
    </Stack>
  );
}

export function JobManager({
  me,
  canPublish,
  job,
  files,
  events,
  jobRuns,
  list,
  filters,
  envs,
  runs,
  total,
  cmsSite,
  links,
}: {
  me: string;
  canPublish: boolean;
  job?: JobView;
  files: FileView[];
  events: JobEvent[];
  jobRuns: JobRun[];
  list: { rows: JobView[]; total: number; page: number; per: number };
  filters: { scope: "mine" | "all"; step: string; q: string };
  envs: { preview: Env; production: Env };
  /** The deployments running now; none running: the last one. */
  runs: Run[];
  /** Every deployment's count (the history page has them all). */
  total: number;
  cmsSite: CmsSite;
  links: { cms: string; preview: string; production: string };
}) {
  const t = useTranslations("jobs");
  const tw = useTranslations("workflow");
  const tf = useTranslations("files");
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState(filters.q);
  const running = runs.some((r) => r.status === "running");
  const runningOn = (env: Run["env"]) => runs.some((r) => r.status === "running" && r.env === env);
  const jobRunning = jobRuns.some((r) => r.status === "running");
  // While a deployment runs, its log, its end and the job's step come in by themselves.
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [running, router]);
  /** The job's deployment running now: the lightbox over the page (the owner: 「light box … stop user's change」). */
  const building = jobRuns.find((r) => r.status === "running");
  const buildingLog = building ? (runs.find((r) => r.id === building.id)?.log ?? "") : "";
  // Once it ends: said in a word, done or failed.
  const watched = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (building) {
      watched.current = building.id;
      return;
    }
    const id = watched.current;
    if (id === undefined) return;
    watched.current = undefined;
    const ended = jobRuns.find((r) => r.id === id);
    if (ended?.status === "done") notifications.show({ color: "green", message: t("buildDone") });
    else if (ended?.status === "failed")
      notifications.show({
        color: "red",
        title: t("buildFailed"),
        message: t("buildFailedHelp"),
        autoClose: 12_000,
      });
  }, [building, jobRuns, t]);
  /** The page with [change] in its address (a filter, a page, the job picked). */
  const go = (change: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(change))
      if (v) next.set(k, v);
      else next.delete(k);
    router.push(`${path}?${next.toString()}`);
  };
  const after = (ok: boolean) => {
    if (!ok) return;
    setPicked(new Set());
    router.refresh();
  };
  const ask = (title: string, o: Omit<Parameters<typeof Ask>[0], "close">) => {
    // Named first: the form closes its own dialog.
    const modalId = `ask-${++asked}`;
    modals.open({ modalId, title, children: <Ask {...o} close={() => modals.close(modalId)} /> });
  };
  const step = async (r: Promise<Result<unknown>>, said: string) => after(report(await r, said));
  const chosen = files
    .filter((f) => picked.has(keyOf(f)))
    .map((f) => ({ kind: f.kind, id: f.id, label: f.label }));
  const envLine = (e: Env) =>
    e.release ? tw("releaseLine", { id: e.release, by: e.by ?? "", at: e.at }) : tw("none");
  const mayMove = !!job && (job.author === me || canPublish);

  /** What can be done to the job at its step, by whom. */
  const buttons = () => {
    if (!job || !mayMove) return null;
    const id = job.id;
    const back = (
      <Button
        size="xs"
        variant="light"
        leftSection={<IconArrowBackUp size={14} />}
        disabled={jobRunning || runningOn("preview")}
        onClick={() =>
          confirm({
            title: t("backTitle", { id }),
            body: t("backBody"),
            label: t("back"),
            cancel: t("cancel"),
            run: () => step(jobBackAction(id), t("backStarted")),
          })
        }
        data-testid="job-back"
      >
        {t("back")}
      </Button>
    );
    const reject = canPublish && (
      <Button
        size="xs"
        variant="light"
        color="red"
        leftSection={<IconX size={14} />}
        onClick={() =>
          ask(t("rejectTitle", { id }), {
            label: t("rejectReason"),
            required: true,
            confirmLabel: t("reject"),
            color: "red",
            run: async (reason) => {
              const ok = report(await rejectJobAction(id, reason), t("rejected"));
              after(ok);
              return ok;
            },
          })
        }
        data-testid="job-reject"
      >
        {t("reject")}
      </Button>
    );
    switch (job.step) {
      case "progress":
        return (
          <>
            <Button
              size="xs"
              rightSection={<IconArrowRight size={14} />}
              disabled={jobRunning || runningOn("preview") || !files.length}
              onClick={() =>
                ask(t("previewTitle", { id }), {
                  label: tw("note"),
                  confirmLabel: t("toPreview"),
                  run: async (note) => {
                    const r = await jobPreviewAction(id, note);
                    const ok = report(r, tw("previewStarted", { n: r.ok ? (r.value?.items ?? 0) : 0 }));
                    after(ok);
                    return ok;
                  },
                })
              }
              data-testid="job-preview"
            >
              {t("toPreview")}
            </Button>
            <Button
              size="xs"
              variant="light"
              color="red"
              leftSection={<IconPlayerStop size={14} />}
              disabled={jobRunning}
              onClick={() =>
                confirm({
                  title: t("terminateTitle", { id }),
                  body: t("terminateBody"),
                  label: t("terminate"),
                  cancel: t("cancel"),
                  danger: true,
                  run: () => step(terminateJobAction(id), t("terminated")),
                })
              }
              data-testid="job-terminate"
            >
              {t("terminate")}
            </Button>
          </>
        );
      case "preview":
        return (
          <>
            <Button
              size="xs"
              leftSection={<IconSend size={14} />}
              disabled={jobRunning}
              onClick={() =>
                ask(t("submitTitle", { id }), {
                  label: t("submitNote"),
                  confirmLabel: t("submit"),
                  run: async (note) => {
                    const ok = report(await submitJobAction(id, note), t("submitted"));
                    after(ok);
                    return ok;
                  },
                })
              }
              data-testid="job-submit"
            >
              {t("submit")}
            </Button>
            {back}
          </>
        );
      case "submitted":
        return (
          <>
            {canPublish && (
              <Button
                size="xs"
                color="green"
                leftSection={<IconCheck size={14} />}
                onClick={() =>
                  ask(t("approveTitle", { id }), {
                    label: t("approveNote"),
                    confirmLabel: t("approve"),
                    color: "green",
                    run: async (note) => {
                      const ok = report(await approveJobAction(id, note), t("approved"));
                      after(ok);
                      return ok;
                    },
                  })
                }
                data-testid="job-approve"
              >
                {t("approve")}
              </Button>
            )}
            {reject}
            {back}
          </>
        );
      case "approved":
        return (
          <>
            {canPublish && (
              <Button
                size="xs"
                color="green"
                rightSection={<IconArrowRight size={14} />}
                disabled={jobRunning || runningOn("production")}
                onClick={() => {
                  const mid = `publish-${id}`;
                  modals.open({
                    modalId: mid,
                    title: t("publishTitle", { id }),
                    children: (
                      <PublishForm job={id} close={() => modals.close(mid)} done={() => after(true)} />
                    ),
                  });
                }}
                data-testid="job-publish"
              >
                {t("publish")}
              </Button>
            )}
            {reject}
            {back}
          </>
        );
      case "scheduled":
        return canPublish ? (
          <>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconCalendarTime size={14} />}
              onClick={() =>
                confirm({
                  title: t("unscheduleTitle", { id }),
                  body: t("unscheduleBody"),
                  label: t("unschedule"),
                  cancel: t("cancel"),
                  run: () => step(cancelScheduleAction(id), t("unscheduled")),
                })
              }
              data-testid="job-unschedule"
            >
              {t("unschedule")}
            </Button>
            {reject}
          </>
        ) : null;
      default:
        return null;
    }
  };

  return (
    <Stack gap="lg">
      <Modal
        opened={!!building}
        onClose={() => {}}
        withCloseButton={false}
        closeOnClickOutside={false}
        closeOnEscape={false}
        centered
        size="lg"
        title={
          building &&
          t(building.env === "preview" ? "buildingPreview" : "buildingProduction", { id: job?.id ?? 0 })
        }
        data-testid="job-building"
      >
        <Stack gap="sm">
          <Group gap="sm" wrap="nowrap">
            <Loader size="sm" />
            <Text size="sm">{t("buildingBody")}</Text>
          </Group>
          <Code block style={{ maxHeight: 280, overflow: "auto", whiteSpace: "pre-wrap" }}>
            {buildingLog.slice(-4000) || tw("noOutput")}
          </Code>
          {building && (
            <Anchor component={Link} {...NEW_TAB} href={`/deployments/${building.id}`} size="sm">
              {tw("log")}
            </Anchor>
          )}
        </Stack>
      </Modal>
      <div>
        <Title order={1} fz={22}>
          {tw("title")}
        </Title>
        <Text size="sm" c="dimmed">
          {t("lead")}
        </Text>
      </div>

      <SimpleGrid cols={{ base: 1, md: 3 }}>
        <Card withBorder data-testid="cms-site">
          <Group gap="xs">
            <Text fw={600}>{tw("cmsPreview")}</Text>
            <CmsSiteBadge site={cmsSite} />
          </Group>
          <Text size="sm" c="dimmed">
            {tw("cmsPreviewHelp")}
          </Text>
          <Group gap="sm">
            <Anchor href={links.cms} target="_blank" size="sm">
              {tw("open")} <IconExternalLink size={12} />
            </Anchor>
            {/* Its own site, not preview: only after the website's code changed (the owner took it for preview's). */}
            <Anchor
              component="button"
              size="sm"
              disabled={cmsSite.building}
              onClick={async () =>
                report(await rebuildCmsSiteAction(), tw("cmsRebuildStarted")) && router.refresh()
              }
            >
              <IconRefresh size={12} /> {tw("rebuildCms")}
            </Anchor>
          </Group>
        </Card>
        <Card withBorder>
          <Text fw={600}>{tw("preview")}</Text>
          <Text size="sm">{envLine(envs.preview)}</Text>
          <Group gap="sm">
            <Anchor href={links.preview} target="_blank" size="sm">
              {tw("open")} <IconExternalLink size={12} />
            </Anchor>
            <Anchor
              component="button"
              size="sm"
              disabled={runningOn("preview")}
              onClick={async () => after(report(await rebuildPreviewAction(), tw("rebuildStarted")))}
            >
              <IconRefresh size={12} /> {tw("rebuildPreview")}
            </Anchor>
          </Group>
        </Card>
        <Card withBorder>
          <Text fw={600}>{tw("production")}</Text>
          <Text size="sm">{envLine(envs.production)}</Text>
          <Anchor href={links.production} target="_blank" size="sm">
            {tw("open")} <IconExternalLink size={12} />
          </Anchor>
        </Card>
      </SimpleGrid>

      <Card withBorder data-testid="job-card">
        {job ? (
          <Stack gap="md">
            <Group justify="space-between" align="flex-start">
              <div>
                <Group gap="xs">
                  <Title order={2} fz={18} data-testid="job-title">
                    #{job.id} {job.ticket ? `${job.ticket} · ` : ""}
                    {job.name}
                  </Title>
                  <StepBadge step={job.step} />
                </Group>
                <Text size="xs" c="dimmed">
                  {t("meta", { author: job.author, at: job.created, approver: job.approver ?? "—" })}
                  {job.step === "scheduled" && ` · ${t("scheduledAt", { at: job.scheduled })}`}
                </Text>
              </div>
              <Group gap="xs">{buttons()}</Group>
            </Group>
            {job.step === "terminated" ? (
              <Alert color="red" p="xs">
                <Text size="sm">{t("terminatedNote")}</Text>
              </Alert>
            ) : (
              <Stepper active={AT[job.step]} size="xs" allowNextStepsSelect={false}>
                {LINE.map((s) => (
                  <Stepper.Step
                    key={s}
                    label={t(`steps.${s}`)}
                    description={
                      s === "approved" && job.step === "scheduled"
                        ? t("scheduledAt", { at: job.scheduled })
                        : undefined
                    }
                  />
                ))}
              </Stepper>
            )}
            {mayMove ? (
              job.step === "submitted" &&
              !canPublish && (
                <Text size="xs" c="dimmed">
                  {t("waitsForApproval")}
                </Text>
              )
            ) : (
              <Text size="xs" c="dimmed">
                {t("notYours", { author: job.author })}
              </Text>
            )}
            {jobRunning && (
              <Text size="xs" c="dimmed">
                {t("deploying")}
              </Text>
            )}
          </Stack>
        ) : (
          <Text c="dimmed">{t("noJob")}</Text>
        )}
      </Card>

      <Card withBorder>
        <Group justify="space-between" mb="sm" wrap="wrap">
          <Title order={2} fz={18}>
            {t("list", { n: list.total })}
          </Title>
          <Group gap="xs" wrap="wrap">
            <SegmentedControl
              size="xs"
              value={filters.scope}
              onChange={(v) =>
                go({ scope: v === "all" ? "all" : undefined, page: undefined, job: undefined })
              }
              data={[
                { value: "mine", label: t("mine") },
                { value: "all", label: t("all") },
              ]}
              data-testid="job-scope"
            />
            <Select
              size="xs"
              w={150}
              value={filters.step}
              onChange={(v) =>
                go({ step: v && v !== "open" ? v : undefined, page: undefined, job: undefined })
              }
              allowDeselect={false}
              data={[
                { value: "open", label: t("open") },
                { value: "all", label: t("allSteps") },
                ...(
                  [
                    "progress",
                    "preview",
                    "submitted",
                    "approved",
                    "scheduled",
                    "done",
                    "terminated",
                  ] as Step[]
                ).map((s) => ({ value: s, label: t(`steps.${s}`) })),
              ]}
              data-testid="job-step"
            />
            <form
              onSubmit={(e) => {
                e.preventDefault();
                go({ q: q.trim() || undefined, page: undefined, job: undefined });
              }}
            >
              <TextInput
                size="xs"
                w={220}
                leftSection={<IconSearch size={14} />}
                placeholder={t("search")}
                value={q}
                onChange={(e) => setQ(e.currentTarget.value)}
                data-testid="job-search"
              />
            </form>
          </Group>
        </Group>
        <JobTable
          jobs={list.rows}
          picked={job?.id}
          onPick={(id) => go({ job: String(id) })}
          empty={t("noneHere")}
        />
        {list.total > list.per && (
          <Group justify="flex-end" mt="sm">
            <Pagination
              size="sm"
              total={Math.ceil(list.total / list.per)}
              value={list.page}
              onChange={(p) => go({ page: p > 1 ? String(p) : undefined })}
            />
          </Group>
        )}
      </Card>

      {job && (
        <Card withBorder data-testid="job-files">
          <Group justify="space-between" mb="sm" wrap="wrap">
            <Title order={2} fz={18}>
              {t("filesOf", { n: files.length })}
            </Title>
            <Group gap="xs">
              {mayMove && (job.step === "progress" || job.step === "preview") && (
                <Button
                  size="xs"
                  variant="light"
                  color="red"
                  disabled={!chosen.length || jobRunning || (job.step === "preview" && runningOn("preview"))}
                  onClick={() =>
                    confirm({
                      title: t("removeTitle", { n: chosen.length }),
                      body: job.step === "preview" ? t("removeBodyPreview") : t("removeBody"),
                      label: t("remove"),
                      cancel: t("cancel"),
                      run: () =>
                        step(
                          removeFromJobAction(job.id, chosen),
                          job.step === "preview" ? t("removeStarted") : t("removed"),
                        ),
                    })
                  }
                  data-testid="job-remove"
                >
                  {t("removeN", { n: chosen.length })}
                </Button>
              )}
              {mayMove && (job.step === "progress" || job.step === "preview") && (
                <Button
                  size="xs"
                  variant="light"
                  disabled={!chosen.length || jobRunning}
                  onClick={() =>
                    jobModal(
                      chosen,
                      tf,
                      (id) => {
                        setPicked(new Set());
                        if (id) go({ job: String(id) });
                        router.refresh();
                      },
                      {
                        job: job.id,
                        ticket: job.ticket,
                        files: files.map((f) => ({ kind: f.kind, id: f.id, label: f.label })),
                      },
                    )
                  }
                  data-testid="job-split"
                >
                  {t("splitN", { n: chosen.length })}
                </Button>
              )}
              <Button
                size="xs"
                variant="default"
                component="a"
                href={`/api/jobs/${job.id}/export`}
                leftSection={<IconDownload size={14} />}
              >
                {t("export")}
              </Button>
            </Group>
          </Group>
          <Stack gap="md">
            {/* The owner pushed a new page still 停用 and found nothing on preview: say so where the job is. */}
            {files.some((f) => f.inactive) && (
              <Alert color="orange" p="xs" data-testid="job-inactive">
                <Text size="sm">
                  {t("inactiveNote", {
                    list: files
                      .filter((f) => f.inactive)
                      .map((f) => f.label)
                      .join("、"),
                  })}
                </Text>
              </Alert>
            )}
            {CATEGORIES.map((c) => {
              const of = files.filter((f) => c.kinds.includes(f.kind));
              if (!of.length) return null;
              return (
                <div key={c.key}>
                  <Text size="sm" fw={600} mb={4}>
                    {t(`categories.${c.key}`)}
                  </Text>
                  <FileTable
                    files={of}
                    me={me}
                    picked={mayMove && ["progress", "preview"].includes(job.step) ? picked : undefined}
                    onPick={setPicked}
                    extra={{
                      title: t("modifiedBy"),
                      cell: (f) => (
                        <Text size="xs">
                          {f.by} · {f.at}
                        </Text>
                      ),
                    }}
                    empty=""
                  />
                </div>
              );
            })}
            {!files.length && (
              <Text size="sm" c="dimmed">
                {t("noFiles")}
              </Text>
            )}
          </Stack>
        </Card>
      )}

      {job && (
        <Card withBorder data-testid="job-history">
          <Title order={2} fz={18} mb="sm">
            {t("history")}
          </Title>
          <Stack gap={6}>
            {events.map((e) => (
              <Group key={e.id} gap="xs" wrap="nowrap" align="flex-start">
                <Text size="xs" c="dimmed" w={150} style={{ flexShrink: 0 }}>
                  {e.at}
                </Text>
                <Text size="sm">
                  {t(`events.${e.action}`, {
                    by: e.by === "scheduler" ? t("scheduler") : e.by,
                    note: e.note,
                  })}
                  {e.note &&
                  !["split", "splitFrom", "gave", "failed", "scheduled", "added", "removed"].includes(
                    e.action,
                  )
                    ? `：${e.note}`
                    : ""}
                </Text>
              </Group>
            ))}
            {!!jobRuns.length && (
              <Group gap="xs" mt="xs">
                <Text size="xs" c="dimmed">
                  {t("deploymentsOf")}
                </Text>
                {jobRuns.map((d) => (
                  <Anchor key={d.id} component={Link} {...NEW_TAB} href={`/deployments/${d.id}`} size="xs">
                    <Badge size="xs" variant="light" color={STATUS_COLOR[d.status]}>
                      #{d.id} {tw(d.env === "preview" ? "preview" : "production")}
                    </Badge>
                  </Anchor>
                ))}
              </Group>
            )}
          </Stack>
        </Card>
      )}

      <Card withBorder data-testid="current-deployment">
        <Group gap="sm" align="baseline" mb="sm">
          <Title order={2} fz={18}>
            {tw("currentDeployment")}
          </Title>
          <Anchor component={Link} {...NEW_TAB} href="/deployments/" size="sm">
            {tw("allDeployments", { n: total })} <IconExternalLink size={12} />
          </Anchor>
        </Group>
        <Stack gap="xs">
          {!running && !!runs.length && (
            <Text size="xs" c="dimmed">
              {tw("lastDeployment")}
            </Text>
          )}
          {runs.map((r) => (
            <Stack key={r.id} gap={4}>
              <Group gap="xs">
                <Badge color={STATUS_COLOR[r.status]}>{tw(`status.${r.status}`)}</Badge>
                <Text size="sm" span>
                  {tw("runLine", {
                    env: tw(r.env === "preview" ? "preview" : "production"),
                    action: tw(`actions.${r.action}`),
                    id: r.release,
                    n: r.items,
                    by: r.by,
                    at: r.at,
                  })}
                </Text>
                <Anchor component={Link} {...NEW_TAB} href={`/deployments/${r.id}`} size="sm">
                  {tw("log")}
                </Anchor>
              </Group>
              {/* The progress of one running now; a finished one's log is on its own page. */}
              {r.status === "running" && (
                <Code block style={{ maxHeight: 320, overflow: "auto", whiteSpace: "pre-wrap" }}>
                  {r.log || tw("noOutput")}
                </Code>
              )}
            </Stack>
          ))}
          {!runs.length && <Text c="dimmed">{tw("noRuns")}</Text>}
        </Stack>
      </Card>
    </Stack>
  );
}
