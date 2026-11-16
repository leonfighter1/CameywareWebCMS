"use client";
import {
  Alert,
  Anchor,
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
import { createTemplateAction } from "../../../actions";

export function Builtin({
  type,
  typeLabel,
  typeHelp,
  blocks,
  preview,
}: {
  type: string;
  typeLabel: string;
  typeHelp: string;
  blocks: { id: string; name: string; drawn: boolean; onPage: boolean }[];
  preview: string;
}) {
  const t = useTranslations("template");
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const shown = blocks.filter((b) => b.onPage);
  const [block, setBlock] = useState<string | null>(shown[0]?.id ?? null);
  const drawn = blocks.filter((b) => b.drawn);
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
                <IconCode size={20} /> {t("builtinTitle", { type: typeLabel })}
              </Title>
              <Text size="sm" c="dimmed">
                {typeHelp}
              </Text>
            </div>
            <Button
              component={Link}
              href={`/?at=${encodeURIComponent(`views/styles/${type}`)}`}
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
              {t("newFromFields")}
            </Title>
            <Group align="flex-end">
              <TextInput label={t("name")} value={name} onChange={(e) => setName(e.currentTarget.value)} />
              <Button
                leftSection={<IconPlus size={14} />}
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  const r = await createTemplateAction(type, name);
                  setBusy(false);
                  if (report(r, t("created"))) router.push(`/templates/${r.value}`);
                }}
              >
                {t("create")}
              </Button>
            </Group>
          </Card>
          <Card withBorder>
            <Title order={2} fz={16} mb="xs">
              {t("drawnBlocks", { n: drawn.length })}
            </Title>
            <Group gap="xs">
              {drawn.map((b) => (
                <Anchor key={b.id} component={Link} href={`/components/${b.id}`} size="sm">
                  {b.name}
                </Anchor>
              ))}
            </Group>
          </Card>
        </Stack>
      </Grid.Col>
      <Grid.Col span={{ base: 12, xl: 6 }}>
        <Stack gap="xs">
          <Select
            size="xs"
            aria-label={t("previewBlock")}
            data={shown.map((b) => ({ value: b.id, label: b.name }))}
            value={block}
            onChange={setBlock}
            w={240}
          />
          {block ? (
            <iframe
              src={`${preview}/zh/__cms__/?view=draft&block=${encodeURIComponent(block)}&template=builtin`}
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
