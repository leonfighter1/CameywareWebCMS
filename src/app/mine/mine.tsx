"use client";
import { Button, Card, Group, Stack, Text, Title } from "@mantine/core";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileTable, keyOf } from "@/components/file-table";
import { checkInModal, confirm } from "@/components/files";
import { report } from "@/components/result";
import type { FileView } from "@/lib/present";
import { discardAction, putBackAction } from "../actions";

export function Mine({ me, held, inWorkflow }: { me: string; held: FileView[]; inWorkflow: FileView[] }) {
  const t = useTranslations("mine");
  const tf = useTranslations("files");
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const chosen = held.filter((f) => picked.has(keyOf(f))).map((f) => ({ kind: f.kind, id: f.id }));
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
              onClick={() => checkInModal(chosen, tf, () => done(true))}
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
      </Card>
      <Card withBorder>
        <Group justify="space-between" mb="sm">
          <Title order={2} fz={18}>
            {t("inWorkflow", { n: inWorkflow.length })}
          </Title>
          <Button size="xs" variant="default" component={Link} href="/workflow/">
            {tf("toWorkflow")}
          </Button>
        </Group>
        <FileTable
          files={inWorkflow}
          me={me}
          extra={{
            title: t("checkin"),
            cell: (f) => (
              <Text size="xs">
                {f.checkin ? `#${f.checkin.id} · ${f.checkin.at} · ${f.checkin.message}` : ""}
              </Text>
            ),
          }}
          empty={t("noneInWorkflow")}
        />
      </Card>
    </Stack>
  );
}
