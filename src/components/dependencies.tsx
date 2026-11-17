"use client";
/**
 * 依赖 (the owner, 2026-11-16: 「可以用 dependency(依赖)去指代, 比如放到下面， 自动打勾」, 「也可以不打勾，万一别人临时需要
 * 呢？ 默认自动打勾 和checkout」): the new files pages need, each with the files it comes from (来自) and its folder in the
 * explorer (位置; 「用户不知道去哪里找」). With [tick] (我的文件) ticked means yours: unticking puts it back for anyone to
 * take, ticking takes it (接手, asked first, when someone else has it). Without (加入工作流): what happens to each as the
 * pages go in.
 */
import { Anchor, Badge, Checkbox, Group, Stack, Table, Text } from "@mantine/core";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { putBackAction } from "@/app/actions";
import type { DependencyView } from "@/lib/present";
import { keyOf } from "./file-table";
import { confirm, takeFiles } from "./files";
import { NEW_TAB } from "./links";
import { report } from "./result";

const COLOR = { mine: "blue", free: "gray", others: "orange", workflow: "violet", gone: "red" } as const;

export function DependencyTable({
  deps,
  tick,
  onChanged,
}: {
  deps: DependencyView[];
  tick?: boolean;
  /** After a tick changed one (the page refreshes as well). */
  onChanged?: () => void;
}) {
  const tf = useTranslations("files");
  const tj = useTranslations("jobs");
  const te = useTranslations("explorer");
  const router = useRouter();
  // The one being changed: shown changed and closed until the list comes back refreshed (a second click on the old state
  // put back a file already put back).
  const [changing, setChanging] = useState<{ key: string; of: DependencyView[] } | null>(null);
  const busy = changing?.of === deps ? changing.key : null;
  const step = async (d: DependencyView, run: () => Promise<boolean>) => {
    setChanging({ key: keyOf(d), of: deps });
    if (!(await run())) return setChanging(null);
    router.refresh();
    onChanged?.();
  };
  const toggle = (d: DependencyView) => {
    const item = [{ kind: d.kind, id: d.id }];
    if (d.state === "mine") void step(d, async () => report(await putBackAction(item), tf("putBackDone")));
    else if (d.state === "free") void step(d, () => takeFiles(item, tf));
    else if (d.state === "others")
      confirm({
        title: tf("takeOverTitle"),
        body: tf("takeOverBody", { owner: d.owner ?? "" }),
        label: tf("takeOver"),
        cancel: tf("cancel"),
        run: () => step(d, () => takeFiles(item, tf, true)),
      });
  };
  const trail = (d: DependencyView) =>
    [
      ...(d.kind === "component"
        ? [te("tree.content"), te("tree.components")]
        : [te("tree.views"), te(d.kind === "template" ? "tree.styles" : "tree.layouts")]),
      ...(d.type ? [d.type] : []),
    ].join(" › ");
  const kind = (d: DependencyView) => (
    <Badge size="xs" variant="outline" color="gray" style={{ minWidth: "max-content" }}>
      {tf(`kinds.${d.kind}`)}
    </Badge>
  );
  const where = (d: DependencyView) => (
    <Anchor
      component={Link}
      {...NEW_TAB}
      href={`/?at=${encodeURIComponent(d.at)}`}
      size="xs"
      style={{ whiteSpace: "nowrap" }}
    >
      {trail(d)}
    </Anchor>
  );
  const from = (d: DependencyView) =>
    d.from.map((f) => (
      <Anchor key={f.href} component={Link} {...NEW_TAB} href={f.href} size="xs" mr={6}>
        {f.label}
      </Anchor>
    ));
  // 加入工作流's narrow dialog: two lines a file, what happens to it at the right.
  if (!tick)
    return (
      <Stack gap={8} data-testid="deps">
        {deps.map((d) => (
          <Group
            key={keyOf(d)}
            justify="space-between"
            align="flex-start"
            wrap="nowrap"
            gap="sm"
            data-testid={`dep-${keyOf(d)}`}
            data-state={d.state}
          >
            <Stack gap={2} style={{ minWidth: 0 }}>
              <Group gap={6} wrap="nowrap" align="flex-start">
                {kind(d)}
                <Anchor
                  component={Link}
                  {...NEW_TAB}
                  href={d.href}
                  size="sm"
                  style={{ wordBreak: "break-all" }}
                >
                  {d.label}
                </Anchor>
              </Group>
              <Text size="xs" c="dimmed" component="div">
                {tf("depFrom")} {from(d)}· {tf("depWhere")} {where(d)}
              </Text>
            </Stack>
            <Text
              size="xs"
              c={COLOR[d.state] === "gray" ? "dimmed" : COLOR[d.state]}
              style={{ flexShrink: 0 }}
            >
              {tj(`depGoes.${d.state}`, { owner: d.owner ?? "" })}
            </Text>
          </Group>
        ))}
      </Stack>
    );
  return (
    <Table.ScrollContainer minWidth={640}>
      <Table verticalSpacing={6} highlightOnHover data-testid="deps">
        <Table.Thead>
          <Table.Tr>
            <Table.Th w={36} />
            <Table.Th style={{ whiteSpace: "nowrap" }}>{tf("kind")}</Table.Th>
            <Table.Th>{tf("name")}</Table.Th>
            <Table.Th>{tf("depFrom")}</Table.Th>
            <Table.Th>{tf("depWhere")}</Table.Th>
            <Table.Th>{tf("state")}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {deps.map((d) => (
            <Table.Tr key={keyOf(d)} data-testid={`dep-${keyOf(d)}`} data-state={d.state}>
              <Table.Td>
                <Checkbox
                  aria-label={tf("depTake", { name: d.label })}
                  checked={busy === keyOf(d) ? d.state !== "mine" : d.state === "mine"}
                  disabled={d.state === "workflow" || d.state === "gone" || busy === keyOf(d)}
                  onChange={() => toggle(d)}
                  data-testid={`dep-tick-${d.id}`}
                />
              </Table.Td>
              <Table.Td style={{ whiteSpace: "nowrap" }}>{kind(d)}</Table.Td>
              <Table.Td>
                <Anchor component={Link} {...NEW_TAB} href={d.href} size="sm">
                  {d.label}
                </Anchor>
              </Table.Td>
              <Table.Td>{from(d)}</Table.Td>
              <Table.Td>{where(d)}</Table.Td>
              <Table.Td>
                <Badge size="xs" color={COLOR[d.state]} variant="light" style={{ minWidth: "max-content" }}>
                  {tf(`depState.${d.state}`, { owner: d.owner ?? "" })}
                </Badge>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
