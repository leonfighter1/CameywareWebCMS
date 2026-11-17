"use client";
/**
 * The bell at the top right (S7; the owner: no mail, 「只需要相关人员登陆时右上角有一个小铃铛的notification 提醒用户workflow
 * approve」): the jobs waiting for approval (管理员 and up), and what others did to your jobs (yours, or approved by you)
 * since you last opened it. Asked again each minute; opened, its news are seen.
 */
import {
  ActionIcon,
  Badge,
  Divider,
  Group,
  Indicator,
  Popover,
  ScrollArea,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { IconBell } from "@tabler/icons-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { bellAction, seenAction } from "@/app/actions";
import type { Bell as BellData } from "@/lib/jobs";

const EVERY = 60_000;

export function Bell({ initial }: { initial: BellData }) {
  const t = useTranslations("bell");
  const tj = useTranslations("jobs");
  const [data, setData] = useState(initial);
  const [opened, setOpened] = useState(false);
  // A page drawn again brings the bell as it is now.
  const [from, setFrom] = useState(initial);
  if (from !== initial) {
    setFrom(initial);
    setData(initial);
  }
  useEffect(() => {
    const timer = setInterval(async () => {
      const r = await bellAction();
      if (r.ok && r.value) setData(r.value);
    }, EVERY);
    return () => clearInterval(timer);
  }, []);
  const count = data.approvals.length + data.unread;
  const open = (on: boolean) => {
    setOpened(on);
    if (on && data.unread) void seenAction();
    // Closed: what was new is seen now.
    if (!on && data.unread)
      setData((d) => ({ ...d, unread: 0, news: d.news.map((n) => ({ ...n, unread: false })) }));
  };
  const who = (by: string) => (by === "scheduler" ? tj("scheduler") : by);
  return (
    <Popover width={380} position="bottom-end" shadow="md" opened={opened} onChange={open}>
      <Popover.Target>
        {/* How many: the approvals waiting and the news not seen (the owner: 「需要提醒用户有多少个notifications」). */}
        <Indicator
          label={count > 99 ? "99+" : count}
          size={18}
          disabled={!count}
          offset={5}
          color="red"
          data-testid="bell-count"
          data-count={count}
        >
          <ActionIcon
            variant="subtle"
            color="gray"
            size="lg"
            aria-label={t("label", { n: count })}
            onClick={() => open(!opened)}
            data-testid="bell"
          >
            <IconBell size={20} />
          </ActionIcon>
        </Indicator>
      </Popover.Target>
      <Popover.Dropdown p="xs" data-testid="bell-list">
        <ScrollArea.Autosize mah={460}>
          <Stack gap="xs">
            <Text size="sm" fw={700} px={6} pt={4} data-testid="bell-summary">
              {t("summary", { n: count })}
            </Text>
            {!!data.approvals.length && (
              <>
                <Text size="xs" fw={700} c="dimmed" px={6}>
                  {t("approvals", { n: data.approvals.length })}
                </Text>
                {data.approvals.map((a) => (
                  <UnstyledButton
                    key={a.id}
                    component={Link}
                    href={`/workflow/?job=${a.id}`}
                    onClick={() => open(false)}
                    px={6}
                    py={4}
                    style={{ borderRadius: 6 }}
                    data-testid={`bell-approval-${a.id}`}
                  >
                    <Group gap={6} wrap="nowrap">
                      <Badge size="xs" color="orange" variant="light" style={{ minWidth: "max-content" }}>
                        {tj("steps.submitted")}
                      </Badge>
                      <Text size="sm" truncate>
                        #{a.id} {a.ticket ? `${a.ticket} · ` : ""}
                        {a.name}
                      </Text>
                    </Group>
                    <Text size="xs" c="dimmed">
                      {t("submittedBy", { author: a.author, at: a.at })}
                    </Text>
                  </UnstyledButton>
                ))}
                <Divider />
              </>
            )}
            <Text size="xs" fw={700} c="dimmed" px={6}>
              {t("news")}
            </Text>
            {data.news.map((n) => (
              <UnstyledButton
                key={n.id}
                component={Link}
                href={`/workflow/?job=${n.job_id}`}
                onClick={() => open(false)}
                px={6}
                py={4}
                bg={n.unread ? "var(--mantine-primary-color-light)" : undefined}
                style={{ borderRadius: 6 }}
                data-testid={`bell-news-${n.id}`}
              >
                <Text size="sm" fw={n.unread ? 600 : undefined}>
                  #{n.job_id} {n.name}
                </Text>
                <Text size="xs">
                  {tj(`events.${n.action}`, { by: who(n.by), note: n.note })}
                  {n.note && ["rejected", "approved", "submitted"].includes(n.action) ? `：${n.note}` : ""}
                </Text>
                <Text size="xs" c="dimmed">
                  {n.at}
                </Text>
              </UnstyledButton>
            ))}
            {!data.news.length && (
              <Text size="sm" c="dimmed" px={6} pb={4}>
                {t("nothing")}
              </Text>
            )}
          </Stack>
        </ScrollArea.Autosize>
      </Popover.Dropdown>
    </Popover>
  );
}
