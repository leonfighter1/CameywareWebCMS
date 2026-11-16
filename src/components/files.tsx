"use client";
/**
 * A file's state where it is shown (the owner, 2026-11-15: 「每个file有 没有被touch的情况 … 一旦拿取，file/component就进入
 * checkout 状态 … 一旦当文件进入签入(added to workflow)状态，file就被lock住了」): its badges, and on each editor a bar with
 * what can be done to it now (拿取, 接手, 放回, 丢弃) and its versions. The editor's fields are open only while it is yours
 * (`Editable`).
 */
import { Alert, Anchor, Badge, Button, Drawer, Group, Stack, Text, Textarea } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { IconHistory, IconLock } from "@tabler/icons-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useState } from "react";
import { checkInAction, discardAction, putBackAction, restoreVersionAction, takeAction } from "@/app/actions";
import type { FileView, VersionView } from "@/lib/present";
import { report } from "./result";
import { NEW_TAB } from "@/components/links";

/** A badge never cut short in a narrow table cell (Mantine ellipsises its label). */
const WHOLE = { minWidth: "max-content" } as const;

/** Each kind's folder in the explorer. */
const FOLDERS: Record<FileView["kind"], string> = {
  page: "content/pages",
  component: "content/components",
  template: "views/styles",
  layout: "views/layouts",
  global: "content/common/globals",
  bundle: "content/common/bundles",
  code: "views/styles",
};

/** Is [file] [me]'s to change? */
export const isMine = (file: FileView | undefined, me: string) =>
  file?.status === "checked_out" && file.owner === me;

/** Its state and its change, as badges. */
export function StateBadges({ file, me, size = "sm" }: { file?: FileView; me: string; size?: "xs" | "sm" }) {
  const t = useTranslations("files");
  if (!file) return null;
  return (
    <Group gap={4} wrap="wrap">
      {file.status === "available" && (
        <Badge size={size} color="gray" variant="light" style={WHOLE}>
          {t("available")}
        </Badge>
      )}
      {file.status === "checked_out" && (
        <Badge size={size} color={file.owner === me ? "blue" : "orange"} variant="light" style={WHOLE}>
          {file.owner === me ? t("mine") : t("theirs", { owner: file.owner ?? "" })}
        </Badge>
      )}
      {file.status === "in_workflow" && (
        <Badge
          size={size}
          color={file.stage === "preview" ? "teal" : "violet"}
          variant="light"
          leftSection={<IconLock size={10} />}
          style={WHOLE}
        >
          {file.stage === "preview" ? t("atPreview") : t("atCheckedIn")}
        </Badge>
      )}
      {file.change && (
        <Badge size={size} color="yellow" variant="light" style={WHOLE}>
          {t(`change.${file.change}`)}
        </Badge>
      )}
    </Group>
  );
}

/** The fields of an editor: open while the file is yours, read-only otherwise (a disabled fieldset). */
export function Editable({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <fieldset disabled={!open} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
      {children}
    </fieldset>
  );
}

/** 签入 for [items]: a message, then into the workflow. */
export function checkInModal(
  items: { kind: FileView["kind"]; id: string }[],
  t: ReturnType<typeof useTranslations<"files">>,
  done: () => void,
) {
  let message = "";
  modals.openConfirmModal({
    title: t("checkInTitle", { n: items.length }),
    children: (
      <Stack gap="xs">
        <Text size="sm">{t("checkInHelp")}</Text>
        <Textarea
          label={t("message")}
          autosize
          minRows={2}
          data-autofocus
          onChange={(e) => (message = e.currentTarget.value)}
        />
      </Stack>
    ),
    labels: { confirm: t("checkIn"), cancel: t("cancel") },
    onConfirm: async () => {
      if (report(await checkInAction(items, message), t("checkedIn"))) done();
    },
  });
}

/** Asked first, then [run]: a step that can't be undone by a click. */
export function confirm(o: {
  title: string;
  body: string;
  label: string;
  cancel: string;
  danger?: boolean;
  run: () => Promise<unknown>;
}) {
  modals.openConfirmModal({
    title: o.title,
    children: <Text size="sm">{o.body}</Text>,
    labels: { confirm: o.label, cancel: o.cancel },
    confirmProps: o.danger ? { color: "red" } : undefined,
    onConfirm: () => void o.run(),
  });
}

/**
 * A file's versions, newest first: production's and the workflow's marked; one restored as your draft; with [download],
 * each one's own file (a built-in template's code).
 */
function Versions({
  file,
  me,
  versions,
  download,
}: {
  file: FileView;
  me: string;
  versions: VersionView[];
  download?: (version: number) => string;
}) {
  const t = useTranslations("files");
  const router = useRouter();
  // ?versions=1 (the explorer's 版本记录) opens them at once.
  const [opened, { open, close }] = useDisclosure(useSearchParams().get("versions") === "1");
  const mine = isMine(file, me);
  return (
    <>
      <Button size="xs" variant="default" leftSection={<IconHistory size={14} />} onClick={open}>
        {t("versions", { n: versions.length })}
      </Button>
      <Drawer
        opened={opened}
        onClose={close}
        position="right"
        size="md"
        title={t("versionsOf", { name: file.label })}
      >
        <Stack gap="sm">
          {!mine && (
            <Text size="sm" c="dimmed">
              {t("restoreNeedsMine")}
            </Text>
          )}
          {versions.map((v) => (
            <Stack
              key={v.id}
              gap={4}
              p="xs"
              style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: 8 }}
            >
              <Group justify="space-between" gap="xs">
                <Text size="sm" fw={600}>
                  {t("versionNo", { id: v.id })}
                </Text>
                <Group gap={4}>
                  {v.production && (
                    <Badge size="xs" color="green" variant="light">
                      {t("onProduction")}
                    </Badge>
                  )}
                  {v.workflow && (
                    <Badge size="xs" color={v.workflow === "preview" ? "teal" : "violet"} variant="light">
                      {v.workflow === "preview" ? t("atPreview") : t("atCheckedIn")}
                    </Badge>
                  )}
                  {v.current && (
                    <Badge size="xs" color="blue" variant="light">
                      {t("current")}
                    </Badge>
                  )}
                  {v.deleted && (
                    <Badge size="xs" color="red" variant="light">
                      {t("change.deleted")}
                    </Badge>
                  )}
                </Group>
              </Group>
              <Text size="xs" c="dimmed">
                {v.at} · {v.author} · {t("checkinNo", { id: v.checkin_id })}
              </Text>
              <Text size="sm">{v.message}</Text>
              {!!v.published.length && (
                <Text size="xs" c="dimmed">
                  {t("publishedIn", { list: v.published.map((p) => `#${p}`).join(", ") })}
                </Text>
              )}
              {download && (
                <Anchor href={download(v.id)} size="xs" data-testid={`version-download-${v.id}`}>
                  {t("downloadVersion")}
                </Anchor>
              )}
              {mine && !v.current && (
                <Group justify="flex-end">
                  <Button
                    size="compact-xs"
                    variant="light"
                    onClick={() =>
                      confirm({
                        title: t("restoreTitle", { id: v.id }),
                        body: t("restoreBody"),
                        label: t("restore"),
                        cancel: t("cancel"),
                        run: async () => {
                          const r = await restoreVersionAction(file.kind, file.id, v.id);
                          if (report(r, t("restored"))) {
                            if (r.value?.length)
                              report({ ok: false, error: t("restoredMissing"), details: r.value });
                            close();
                            router.refresh();
                          }
                        },
                      })
                    }
                  >
                    {t("restore")}
                  </Button>
                </Group>
              )}
            </Stack>
          ))}
          {!versions.length && (
            <Text size="sm" c="dimmed">
              {t("noVersions")}
            </Text>
          )}
        </Stack>
      </Drawer>
    </>
  );
}

/**
 * The bar above an editor: the file's state, what can be done to it now, its versions. [onChanged] runs after a step
 * changed the file (the editor reloads its fields: a discard or a restore changed them).
 */
export function FileBar({
  file,
  me,
  versions,
  onChanged,
  download,
}: {
  file: FileView;
  me: string;
  versions: VersionView[];
  onChanged?: () => void;
  /** Each version's own file to download (a built-in template's code). */
  download?: (version: number) => string;
}) {
  const t = useTranslations("files");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const item = [{ kind: file.kind, id: file.id }];
  const after = (ok: boolean) => {
    if (!ok) return;
    router.refresh();
    onChanged?.();
  };
  const step = async (run: () => Promise<boolean>) => {
    setBusy(true);
    after(await run());
    setBusy(false);
  };
  const mine = isMine(file, me);
  const color =
    file.status === "in_workflow"
      ? "violet"
      : mine
        ? "blue"
        : file.status === "checked_out"
          ? "orange"
          : "gray";
  const say =
    file.status === "available"
      ? t("barAvailable")
      : file.status === "in_workflow"
        ? t("barLocked", {
            owner: file.owner ?? "",
            stage: file.stage === "preview" ? t("atPreview") : t("atCheckedIn"),
          })
        : mine
          ? t("barMine", { since: file.since })
          : t("barTheirs", { owner: file.owner ?? "", since: file.since });
  return (
    <Alert color={color} variant="light" p="sm" data-testid="file-bar" data-status={file.status}>
      <Group justify="space-between" gap="sm">
        <Stack gap={4}>
          <StateBadges file={file} me={me} />
          <Text size="sm">{say}</Text>
        </Stack>
        <Group gap="xs">
          {file.status === "available" && (
            <Button
              size="xs"
              loading={busy}
              onClick={() => step(async () => report(await takeAction(item), t("taken")))}
            >
              {t("take")}
            </Button>
          )}
          {file.status === "checked_out" && !mine && (
            <Button
              size="xs"
              color="orange"
              loading={busy}
              onClick={() =>
                confirm({
                  title: t("takeOverTitle"),
                  body: t("takeOverBody", { owner: file.owner ?? "" }),
                  label: t("takeOver"),
                  cancel: t("cancel"),
                  run: () => step(async () => report(await takeAction(item, true), t("taken"))),
                })
              }
            >
              {t("takeOver")}
            </Button>
          )}
          {mine && (
            <>
              <Button size="xs" onClick={() => checkInModal(item, t, () => after(true))}>
                {t("checkIn")}
              </Button>
              <Button
                size="xs"
                variant="default"
                loading={busy}
                onClick={() => step(async () => report(await putBackAction(item), t("putBackDone")))}
              >
                {t("putBack")}
              </Button>
              <Button
                size="xs"
                variant="light"
                color="red"
                onClick={() =>
                  confirm({
                    title: t("discardTitle", { n: 1 }),
                    body: t("discardBody"),
                    label: t("discard"),
                    cancel: t("cancel"),
                    danger: true,
                    run: () =>
                      step(async () => {
                        const ok = report(await discardAction(item), t("discarded"));
                        // A file never published is gone: back to its folder in the explorer.
                        if (ok && file.change === "new")
                          router.push(`/?at=${encodeURIComponent(FOLDERS[file.kind])}`);
                        return ok && file.change !== "new";
                      }),
                  })
                }
              >
                {t("discard")}
              </Button>
            </>
          )}
          {file.status === "in_workflow" && (
            <Button size="xs" variant="default" component={Link} {...NEW_TAB} href="/workflow/">
              {t("toWorkflow")}
            </Button>
          )}
          <Versions file={file} me={me} versions={versions} download={download} />
        </Group>
      </Group>
    </Alert>
  );
}
