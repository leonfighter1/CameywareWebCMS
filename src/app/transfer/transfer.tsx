"use client";
import { Button, Card, FileButton, Group, List, Stack, Text, Title } from "@mantine/core";
import { IconDownload, IconUpload } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { changedIn, type Plan, PlanView } from "@/components/plan";
import { report } from "@/components/result";
import { importAction } from "../actions";

/**
 * 下载与上传 (the owner, 2026-11-16: 「for download & upload on the navigation, i currently don't know what can it do」):
 * what it is for, said first; the whole site or the UI texts downloaded; any file the CMS gave uploaded back, shown before
 * it is written. A page's own file goes from the content tree's page list (S9).
 */
export function Transfer() {
  const t = useTranslations("transfer");
  const tf = useTranslations("files");
  const router = useRouter();
  const [file, setFile] = useState<{ name: string; text: string }>();
  const [plan, setPlan] = useState<Plan>();
  const [busy, setBusy] = useState(false);
  const read = async (f: File | null) => {
    setPlan(undefined);
    if (!f) return;
    const text = await f.text();
    setFile({ name: f.name, text });
    setBusy(true);
    const r = await importAction(text, false);
    setBusy(false);
    if (report(r)) setPlan(r.value);
  };
  const changed = plan ? changedIn(plan) : [];
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
      <Card withBorder data-testid="transfer-what">
        <Title order={2} fz={18} mb="xs">
          {t("whatTitle")}
        </Title>
        <List size="sm" spacing={6}>
          <List.Item>{t("what.site")}</List.Item>
          <List.Item>{t("what.texts")}</List.Item>
          <List.Item>{t("what.one")}</List.Item>
          <List.Item>{t("what.upload")}</List.Item>
          <List.Item>{t("what.safe")}</List.Item>
        </List>
      </Card>
      <Card withBorder>
        <Title order={2} fz={18} mb="xs">
          {t("download")}
        </Title>
        <Text size="sm" c="dimmed" mb="sm">
          {t("downloadHelp")}
        </Text>
        <Group>
          {(["site", "texts"] as const).map((kind) =>
            (["json", "xml"] as const).map((format) => (
              <Button
                key={kind + format}
                component="a"
                href={`/api/export?kind=${kind}&format=${format}`}
                variant="default"
                leftSection={<IconDownload size={16} />}
              >
                {t(kind === "site" ? "wholeSite" : "texts")} ({format.toUpperCase()})
              </Button>
            )),
          )}
        </Group>
      </Card>
      <Card withBorder>
        <Title order={2} fz={18} mb="xs">
          {t("upload")}
        </Title>
        <Text size="sm" c="dimmed" mb="sm">
          {t("uploadHelp")}
        </Text>
        <FileButton onChange={read} accept=".json,.xml,application/json,application/xml,text/xml">
          {(props) => (
            <Button {...props} leftSection={<IconUpload size={16} />} loading={busy}>
              {t("choose")}
            </Button>
          )}
        </FileButton>
        {file && (
          <Text size="sm" mt="xs">
            {file.name}
          </Text>
        )}
        {plan && (
          <Stack mt="md">
            <PlanView plan={plan} />
            <Group>
              <Button
                disabled={!changed.length}
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  const r = await importAction(file!.text, true);
                  setBusy(false);
                  if (report(r, t("applied"))) {
                    setPlan(undefined);
                    setFile(undefined);
                    router.refresh();
                  }
                }}
              >
                {t("apply", { n: changed.length })}
              </Button>
              <Button variant="default" onClick={() => setPlan(undefined)}>
                {tf("cancel")}
              </Button>
            </Group>
          </Stack>
        )}
      </Card>
    </Stack>
  );
}
