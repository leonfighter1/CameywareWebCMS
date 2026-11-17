"use client";
import { Button, Card, Group, Stack, Text, Title } from "@mantine/core";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileTable, keyOf } from "@/components/file-table";
import { DependencyTable } from "@/components/dependencies";
import { confirm, jobModal } from "@/components/files";
import { JobTable } from "@/components/job-table";
import { NEW_TAB } from "@/components/links";
import { report } from "@/components/result";
import type { DependencyView, FileView, JobView } from "@/lib/present";
import { discardAction, putBackAction } from "../actions";

export function Mine({
  me,
  held,
  deps,
  jobs,
}: {
  me: string;
  held: FileView[];
  deps: DependencyView[];
  jobs: JobView[];
}) {
  const t = useTranslations("mine");
  const tf = useTranslations("files");
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const chosen = held
    .filter((f) => picked.has(keyOf(f)))
    .map((f) => ({ kind: f.kind, id: f.id, label: f.label }));
  const done = (ok: boolean) => {
    if (!ok) return;
    setPicked(new Set());
    router.refresh();
  };
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
      <Card withBorder>
        <Group justify="space-between" mb="sm">
          <Title order={2} fz={18}>
            {t("held", { n: held.length })}
          </Title>
          <Group gap="xs">
            <Button
              size="xs"
              disabled={!chosen.length}
              onClick={() => jobModal(chosen, tf, () => done(true))}
              data-testid="to-job"
            >
              {t("checkIn", { n: chosen.length })}
            </Button>
            <Button
              size="xs"
              variant="default"
              disabled={!chosen.length}
              onClick={async () => done(report(await putBackAction(chosen), tf("putBackDone")))}
            >
              {tf("putBack")}
            </Button>
            <Button
              size="xs"
              variant="light"
              color="red"
              disabled={!chosen.length}
              onClick={() =>
                confirm({
                  title: tf("discardTitle", { n: chosen.length }),
                  body: tf("discardBody"),
                  label: tf("discard"),
                  cancel: tf("cancel"),
                  danger: true,
                  run: async () => done(report(await discardAction(chosen), tf("discarded"))),
                })
              }
            >
              {tf("discard")}
            </Button>
          </Group>
        </Group>
        <Text size="xs" c="dimmed" mb="sm">
          {t("help")}
        </Text>
        <FileTable
          files={held}
          me={me}
          picked={picked}
          onPick={setPicked}
          extra={{ title: t("since"), cell: (f) => <Text size="xs">{f.since}</Text> }}
          empty={t("noneHeld")}
        />
        {!!deps.length && (
          <Stack gap={4} mt="lg" data-testid="mine-deps">
            <Title order={3} fz={16}>
              {tf("depTitle", { n: deps.length })}
            </Title>
            <Text size="xs" c="dimmed">
              {tf("depHelp")}
            </Text>
            <DependencyTable deps={deps} tick />
          </Stack>
        )}
      </Card>
      <Card withBorder>
        <Group justify="space-between" mb="sm">
          <Title order={2} fz={18}>
            {t("jobs", { n: jobs.length })}
          </Title>
          <Button size="xs" variant="default" component={Link} {...NEW_TAB} href="/workflow/">
            {tf("toWorkflow")}
          </Button>
        </Group>
        <JobTable jobs={jobs} empty={t("noJobs")} />
      </Card>
    </Stack>
  );
}
