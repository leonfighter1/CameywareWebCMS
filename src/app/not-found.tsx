import { Button, Group, Stack, Text, Title } from "@mantine/core";
import { getTranslations } from "next-intl/server";
import { Frame } from "@/components/frame";

/**
 * A file or page that isn't there (the owner, 2026-11-16, after a new template deleted and discarded showed a bare 404):
 * said in the CMS's frame, with the way back to the content tree and to 我的文件.
 */
export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <Frame>
      <Stack gap="md" maw={640} py="xl">
        <Title order={1} fz={22}>
          {t("title")}
        </Title>
        <Text c="dimmed">{t("body")}</Text>
        <Group gap="sm">
          <Button component="a" href="/">
            {t("explorer")}
          </Button>
          <Button component="a" href="/mine/" variant="default">
            {t("mine")}
          </Button>
        </Group>
      </Stack>
    </Frame>
  );
}
