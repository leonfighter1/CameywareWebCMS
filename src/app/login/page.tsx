import { Alert, Button, Card, Center, Group, List, ListItem, Stack, Text, Title } from "@mantine/core";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { LanguageSwitch } from "@/components/shell";
import { siteBase } from "@/lib/hosts";
import { currentUser, host, language } from "@/lib/server";

/**
 * Signing in (C4): through the website's account, where a staff member's 我的账号 has 网站内容管理. No password here:
 * the account, its two-step check and its role stay 禄命秘解's.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  if (await currentUser()) redirect("/");
  const { reason } = await searchParams;
  const lang = await language();
  const t = await getTranslations("login");
  const site = siteBase(await host());
  return (
    <Center mih="100vh" p="md">
      <Card withBorder maw={520} w="100%" padding="xl">
        <Stack>
          <Group justify="space-between" align="flex-start">
            <Title order={1} fz={24}>
              {t("title")}
            </Title>
            <LanguageSwitch lang={lang} />
          </Group>
          {reason && <Alert color="red">{reason}</Alert>}
          <Text>{t("how")}</Text>
          <List type="ordered" spacing="xs">
            <ListItem>{t("step1")}</ListItem>
            <ListItem>{t("step2")}</ListItem>
          </List>
          <Button component="a" href={`${site}/${lang === "en" ? "en" : "zh"}/account/`}>
            {t("go")}
          </Button>
          <Text size="xs" c="dimmed">
            {t("who")}
          </Text>
        </Stack>
      </Card>
    </Center>
  );
}
