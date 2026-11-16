import { Alert, Button, Card, Center, List, ListItem, Stack, Text, Title } from "@mantine/core";
import { redirect } from "next/navigation";
import { siteBase } from "@/lib/hosts";
import { currentUser, host } from "@/lib/server";

/**
 * Signing in (C4): through the website's account, where a staff member's 我的账号 has 网站内容管理. No password here:
 * the account, its two-step check and its role stay 禄命秘解's.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  if (await currentUser()) redirect("/");
  const { reason } = await searchParams;
  const site = siteBase(await host());
  return (
    <Center mih="100vh" p="md">
      <Card withBorder maw={520} w="100%" padding="xl">
        <Stack>
          <Title order={1} fz={24}>
            Cameyware 网站内容管理
          </Title>
          {reason && <Alert color="red">{reason}</Alert>}
          <Text>用公司的员工账号登录：</Text>
          <List type="ordered" spacing="xs">
            <ListItem>在官网登录你的账号（网站编辑、管理员或超级管理员）。</ListItem>
            <ListItem>打开“我的账号”，在“网站内容管理”里点“进入 CMS”。</ListItem>
          </List>
          <Button component="a" href={`${site}/zh/account/`}>
            去官网的“我的账号”
          </Button>
          <Text size="xs" c="dimmed">
            谁能进入、是什么角色，在禄命秘解管理后台的“人员与权限”里设置。
          </Text>
        </Stack>
      </Card>
    </Center>
  );
}
