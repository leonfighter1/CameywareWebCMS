"use client";
/**
 * The frame of every signed-in page (the owner, 2026-11-16: 「重新布局一下，不要把东西都塞到一起」): the pages as tabs in
 * the top bar, as Bell's CMS.Net has them, so the left of the page is the explorer's tree alone and every page has the
 * window's width. On a phone the tabs are a menu behind the burger.
 */
import {
  AppShell,
  Badge,
  Burger,
  Button,
  Group,
  Menu,
  NavLink,
  ScrollArea,
  SegmentedControl,
  Stack,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconChevronDown,
  IconExternalLink,
  IconFolders,
  IconGitBranch,
  IconLogout,
  IconTransfer,
  IconUserCheck,
  IconUserCircle,
} from "@tabler/icons-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { setLanguageAction, signOutAction } from "@/app/actions";
import type { Lang } from "@/lib/words";

const NAV = [
  { href: "/", key: "explorer", icon: IconFolders },
  { href: "/mine/", key: "mine", icon: IconUserCheck },
  { href: "/workflow/", key: "workflow", icon: IconGitBranch },
  { href: "/transfer/", key: "transfer", icon: IconTransfer },
] as const;

/** The editors the explorer opens: where its tab stays lit. */
const EDITORS = ["/pages/", "/components/", "/templates/", "/bundles/", "/globals/", "/texts/"];

/** 中文 / English: kept in this browser (a cookie the server reads). */
export function LanguageSwitch({ lang }: { lang: Lang }) {
  const router = useRouter();
  return (
    <SegmentedControl
      size="xs"
      value={lang}
      aria-label="Language / 语言"
      onChange={async (v) => {
        await setLanguageAction(v as Lang);
        router.refresh();
      }}
      data={[
        { value: "zh", label: "中文" },
        { value: "en", label: "English" },
      ]}
    />
  );
}

export function Shell({
  user,
  role,
  lang,
  mine,
  workflow,
  preview,
  production,
  children,
}: {
  user: string;
  role: string;
  lang: Lang;
  mine: number;
  workflow: number;
  preview: string;
  production: string;
  children: ReactNode;
}) {
  const t = useTranslations("shell");
  const [opened, { toggle, close }] = useDisclosure();
  const path = usePathname();
  const router = useRouter();
  const on = (href: string) =>
    href === "/"
      ? path === "/" || EDITORS.some((e) => path.startsWith(e))
      : path.startsWith(href.replace(/\/$/, ""));
  const counts: Record<string, number> = { mine, workflow };
  const cmsPreview = `${preview}/${lang === "en" ? "en" : "zh"}/`;
  const signOut = async () => {
    await signOutAction();
    router.replace("/login");
  };
  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 260, breakpoint: "md", collapsed: { mobile: !opened, desktop: true } }}
      padding="lg"
    >
      <AppShell.Header>
        <Group h="100%" px="lg" justify="space-between" wrap="nowrap">
          <Group gap="xl" wrap="nowrap">
            <Group gap="sm" wrap="nowrap">
              <Burger opened={opened} onClick={toggle} hiddenFrom="md" size="sm" aria-label={t("menu")} />
              <Title order={1} fz={18} style={{ whiteSpace: "nowrap" }}>
                {t("title")}
              </Title>
            </Group>
            <Group gap={4} wrap="nowrap" visibleFrom="md" component="nav" aria-label={t("menu")}>
              {NAV.map(({ href, key, icon: Icon }) => (
                <Button
                  key={href}
                  component={Link}
                  href={href}
                  variant={on(href) ? "light" : "subtle"}
                  color={on(href) ? undefined : "gray"}
                  size="sm"
                  leftSection={<Icon size={16} />}
                  rightSection={counts[key] ? <Badge size="xs">{counts[key]}</Badge> : null}
                  aria-current={on(href) ? "page" : undefined}
                  data-testid={`nav-${key}`}
                >
                  {t(`nav.${key}`)}
                </Button>
              ))}
            </Group>
          </Group>
          <Group gap="xs" wrap="nowrap">
            <Button
              component="a"
              href={cmsPreview}
              target="_blank"
              variant="default"
              size="xs"
              visibleFrom="sm"
              rightSection={<IconExternalLink size={14} />}
            >
              {t("cmsPreview")}
            </Button>
            <Button
              component="a"
              href={production}
              target="_blank"
              variant="subtle"
              size="xs"
              visibleFrom="xl"
              rightSection={<IconExternalLink size={14} />}
            >
              {t("production")}
            </Button>
            <Group visibleFrom="sm">
              <LanguageSwitch lang={lang} />
            </Group>
            <Menu position="bottom-end">
              <Menu.Target>
                <Button
                  variant="subtle"
                  color="gray"
                  size="xs"
                  leftSection={<IconUserCircle size={16} />}
                  rightSection={<IconChevronDown size={14} />}
                  data-testid="user-menu"
                >
                  {user}
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>{role}</Menu.Label>
                <Menu.Item
                  component="a"
                  href={production}
                  target="_blank"
                  leftSection={<IconExternalLink size={14} />}
                >
                  {t("production")}
                </Menu.Item>
                <Menu.Item leftSection={<IconLogout size={14} />} onClick={signOut}>
                  {t("signOut")}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="xs">
        <ScrollArea>
          <Stack gap={2}>
            {NAV.map(({ href, key, icon: Icon }) => (
              <NavLink
                key={href}
                component={Link}
                href={href}
                label={t(`nav.${key}`)}
                active={on(href)}
                onClick={close}
                leftSection={<Icon size={18} />}
                rightSection={counts[key] ? <Badge size="sm">{counts[key]}</Badge> : null}
              />
            ))}
            <NavLink
              component="a"
              href={cmsPreview}
              target="_blank"
              label={t("cmsPreview")}
              leftSection={<IconExternalLink size={18} />}
            />
            <NavLink
              component="a"
              href={production}
              target="_blank"
              label={t("production")}
              leftSection={<IconExternalLink size={18} />}
            />
            <Group p="sm">
              <LanguageSwitch lang={lang} />
            </Group>
          </Stack>
        </ScrollArea>
      </AppShell.Navbar>
      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
