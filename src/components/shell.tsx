"use client";
import {
  AppShell,
  Badge,
  Burger,
  Button,
  Group,
  NavLink,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconExternalLink,
  IconFolders,
  IconGitBranch,
  IconLanguage,
  IconLayoutGrid,
  IconLogout,
  IconTransfer,
  IconUserCheck,
  IconWorld,
} from "@tabler/icons-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { setLanguageAction, signOutAction } from "@/app/actions";
import type { Lang } from "@/lib/words";

const NAV = [
  { href: "/", key: "central", icon: IconFolders },
  { href: "/components/", key: "components", icon: IconLayoutGrid },
  { href: "/globals/company/", key: "globals", icon: IconWorld, match: "/globals/" },
  { href: "/texts/", key: "texts", icon: IconLanguage },
  { href: "/mine/", key: "mine", icon: IconUserCheck },
  { href: "/workflow/", key: "workflow", icon: IconGitBranch },
  { href: "/transfer/", key: "transfer", icon: IconTransfer },
] as const;

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
  const [opened, { toggle }] = useDisclosure();
  const path = usePathname();
  const router = useRouter();
  const on = (href: string, match?: string) =>
    href === "/"
      ? path === "/" || path.startsWith("/pages/")
      : path.startsWith(match ?? href.replace(/\/$/, ""));
  const counts: Record<string, number> = { mine, workflow };
  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 240, breakpoint: "sm", collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label={t("menu")} />
            <Title order={1} fz={18}>
              {t("title")}
            </Title>
          </Group>
          <Group gap="xs" wrap="nowrap">
            <Button
              component="a"
              href={`${preview}/${lang === "en" ? "en" : "zh"}/`}
              target="_blank"
              variant="default"
              size="xs"
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
              visibleFrom="md"
              rightSection={<IconExternalLink size={14} />}
            >
              {t("production")}
            </Button>
            <LanguageSwitch lang={lang} />
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
              {t("signOut")}
            </Button>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="xs">
        <ScrollArea>
          <Stack gap={2}>
            {NAV.map(({ href, key, icon: Icon, ...rest }) => (
              <NavLink
                key={href}
                component={Link}
                href={href}
                label={t(`nav.${key}`)}
                active={on(href, "match" in rest ? rest.match : undefined)}
                leftSection={<Icon size={18} />}
                rightSection={counts[key] ? <Badge size="sm">{counts[key]}</Badge> : null}
                data-testid={`nav-${key}`}
              />
            ))}
          </Stack>
        </ScrollArea>
      </AppShell.Navbar>
      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
