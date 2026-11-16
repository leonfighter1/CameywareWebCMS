"use client";
import {
  AppShell,
  Badge,
  Burger,
  Button,
  Group,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconCloudUpload,
  IconExternalLink,
  IconFolders,
  IconLanguage,
  IconLayoutGrid,
  IconLogout,
  IconRocket,
  IconTransfer,
  IconWorld,
} from "@tabler/icons-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/actions";

const NAV = [
  { href: "/", label: "中心页：页面", icon: IconFolders },
  { href: "/components/", label: "区块（按类型）", icon: IconLayoutGrid },
  { href: "/globals/company/", label: "全局资料", icon: IconWorld, match: "/globals/" },
  { href: "/texts/", label: "界面文字", icon: IconLanguage },
  { href: "/checkin/", label: "签入", icon: IconCloudUpload },
  { href: "/deploy/", label: "发布：预览站和正式站", icon: IconRocket },
  { href: "/transfer/", label: "下载与上传", icon: IconTransfer },
];

export function Shell({
  user,
  role,
  pending,
  preview,
  production,
  children,
}: {
  user: string;
  role: string;
  pending: number;
  preview: string;
  production: string;
  children: ReactNode;
}) {
  const [opened, { toggle }] = useDisclosure();
  const path = usePathname();
  const router = useRouter();
  const on = (href: string, match?: string) =>
    href === "/"
      ? path === "/" || path.startsWith("/pages/")
      : path.startsWith(match ?? href.replace(/\/$/, ""));
  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 240, breakpoint: "sm", collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="菜单" />
            <Title order={1} fz={18}>
              Cameyware 网站内容管理
            </Title>
          </Group>
          <Group gap="xs" wrap="nowrap">
            <Button
              component="a"
              href={`${preview}/zh/`}
              target="_blank"
              variant="default"
              size="xs"
              rightSection={<IconExternalLink size={14} />}
            >
              CMS 预览
            </Button>
            <Button
              component="a"
              href={production}
              target="_blank"
              variant="subtle"
              size="xs"
              visibleFrom="md"
              rightSection={<IconExternalLink size={14} />}
            >
              正式站
            </Button>
            <Text size="sm" visibleFrom="sm">
              {user} · {role}
            </Text>
            <Button
              variant="subtle"
              size="xs"
              leftSection={<IconLogout size={14} />}
              onClick={async () => {
                await signOutAction();
                router.replace("/login");
              }}
            >
              退出
            </Button>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="xs">
        <ScrollArea>
          <Stack gap={2}>
            {NAV.map(({ href, label, icon: Icon, match }) => (
              <NavLink
                key={href}
                component={Link}
                href={href}
                label={label}
                active={on(href, match)}
                leftSection={<Icon size={18} />}
                rightSection={href === "/checkin/" && pending ? <Badge size="sm">{pending}</Badge> : null}
              />
            ))}
          </Stack>
        </ScrollArea>
      </AppShell.Navbar>
      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
