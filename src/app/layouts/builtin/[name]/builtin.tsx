"use client";
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Grid,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconArrowBack, IconCode, IconPlus } from "@tabler/icons-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { report } from "@/components/result";
import { createLayoutAction } from "../../../actions";
import { NEW_TAB } from "@/components/links";

export function BuiltinLayout({
  name,
  label,
  description,
  zones,
  pages,
  preview,
}: {
  name: string;
  label: string;
  description: string;
  zones: { name: string; label: string; full: boolean }[];
  pages: { id: string; path: string; inIt: boolean }[];
  preview: string;
}) {
  const t = useTranslations("layout");
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const inIt = pages.filter((p) => p.inIt);
  const [page, setPage] = useState<string | null>((inIt[0] ?? pages[0])?.path ?? null);
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
                <IconCode size={20} /> {t("builtinTitle", { name: label })}
              </Title>
              <Text size="sm" c="dimmed">
                {description}
              </Text>
            </div>
            <Button
              component={Link}
              href={`/?at=${encodeURIComponent("views/layouts")}`}
              variant="default"
              size="xs"
              leftSection={<IconArrowBack size={14} />}
            >
              {t("toFolder")}
            </Button>
          </Group>
          <Alert color="gray" variant="light">
            {t("builtinBody")}
          </Alert>
          <Card withBorder>
            <Title order={2} fz={16} mb="xs">
              {t("zonesTitle")}
            </Title>
            <Stack gap={6}>
              {zones.map((z) => (
                <Group key={z.name} gap="xs">
                  <Text size="sm" fw={600}>
                    {z.label}
                  </Text>
                  <Badge size="xs" variant="outline" color="gray" style={{ textTransform: "none" }}>
                    {z.name}
                  </Badge>
                  {z.full && (
                    <Badge size="xs" variant="light">
                      {t("fullZone")}
                    </Badge>
                  )}
                </Group>
              ))}
            </Stack>
          </Card>
          <Card withBorder>
            <Title order={2} fz={16} mb="xs">
              {t("newFromBuiltin")}
            </Title>
            <Group align="flex-end">
              <TextInput
                label={t("name")}
                value={newName}
                onChange={(e) => setNewName(e.currentTarget.value)}
              />
              <Button
                leftSection={<IconPlus size={14} />}
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  const r = await createLayoutAction(newName, name);
                  setBusy(false);
                  if (report(r, t("created"))) router.push(`/layouts/${r.value}`);
                }}
              >
                {t("create")}
              </Button>
            </Group>
          </Card>
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
        </Stack>
      </Grid.Col>
      <Grid.Col span={{ base: 12, xl: 6 }}>
        <Stack gap="xs">
          <Select
            size="xs"
            aria-label={t("previewPage")}
            data={pages.map((p) => ({ value: p.path, label: p.path }))}
            value={page}
            onChange={setPage}
            w={240}
          />
          {page && (
            <iframe
              src={`${preview}/zh${page}?view=draft&layout=${name}`}
              title={t("previewTitle")}
              className="cms-preview-frame"
            />
          )}
        </Stack>
      </Grid.Col>
    </Grid>
  );
}
