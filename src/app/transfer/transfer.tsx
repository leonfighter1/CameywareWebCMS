"use client";
import {
  Alert,
  Badge,
  Button,
  Card,
  FileButton,
  Group,
  List,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { IconDownload, IconUpload } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { report } from "@/components/result";
import type { Kind } from "@/lib/files";
import { importAction } from "../actions";

type Plan = {
  items: {
    kind: Kind;
    id: string;
    label: string;
    action: "create" | "update" | "unchanged";
    take?: boolean;
  }[];
  notes: string[];
};

const ACTION_COLOR = { create: "blue", update: "yellow", unchanged: "gray" } as const;

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
  const changed = plan?.items.filter((i) => i.action !== "unchanged") ?? [];
  const count = (a: string) => plan?.items.filter((i) => i.action === a).length ?? 0;
  return (
    <Stack gap="lg">
      <Title order={1} fz={22}>
        {t("title")}
      </Title>
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
            {!!plan.notes.length && (
              <Alert color="blue">
                <List size="sm">
                  {plan.notes.map((n) => (
                    <List.Item key={n}>{n}</List.Item>
                  ))}
                </List>
              </Alert>
            )}
            <Text size="sm">
              {t("summary", { create: count("create"), update: count("update"), same: count("unchanged") })}
            </Text>
            {!!changed.length && (
              <Table verticalSpacing={4}>
                <Table.Tbody>
                  {changed.slice(0, 300).map((i) => (
                    <Table.Tr key={`${i.kind}:${i.id}`}>
                      <Table.Td w={90}>{tf(`kinds.${i.kind}`)}</Table.Td>
                      <Table.Td>
                        <Text size="sm">{i.label}</Text>
                      </Table.Td>
                      <Table.Td w={200}>
                        <Group gap={4}>
                          <Badge color={ACTION_COLOR[i.action]} variant="light">
                            {t(`actions.${i.action}`)}
                          </Badge>
                          {i.take && (
                            <Badge color="blue" variant="outline">
                              {t("willTake")}
                            </Badge>
                          )}
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
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
