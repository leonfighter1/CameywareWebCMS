"use client";
/**
 * What an upload would change, shown before it is written (下载与上传, and a page's own upload in the explorer, S9): its
 * notes, how many files it makes, changes or leaves, and each one changed with what happens to it.
 */
import { Alert, Badge, Group, List, Stack, Table, Text } from "@mantine/core";
import { useTranslations } from "next-intl";
import type { Kind } from "@/lib/files";

export type Plan = {
  items: {
    kind: Kind;
    id: string;
    label: string;
    action: "create" | "update" | "unchanged";
    /** Nobody's now: taken for you when it is written. */
    take?: boolean;
  }[];
  notes: string[];
};

const ACTION_COLOR = { create: "blue", update: "yellow", unchanged: "gray" } as const;

/** The plan's files that change. */
export const changedIn = (plan: Plan) => plan.items.filter((i) => i.action !== "unchanged");

export function PlanView({ plan }: { plan: Plan }) {
  const t = useTranslations("transfer");
  const tf = useTranslations("files");
  const changed = changedIn(plan);
  const count = (a: string) => plan.items.filter((i) => i.action === a).length;
  return (
    <Stack data-testid="upload-plan">
      {!!plan.notes.length && (
        <Alert color="blue">
          <List size="sm">
            {plan.notes.map((n) => (
              <List.Item key={n}>{n}</List.Item>
            ))}
          </List>
        </Alert>
      )}
      <Text size="sm">
        {t("summary", { create: count("create"), update: count("update"), same: count("unchanged") })}
      </Text>
      {!!changed.length && (
        <Table verticalSpacing={4}>
          <Table.Tbody>
            {changed.slice(0, 300).map((i) => (
              <Table.Tr key={`${i.kind}:${i.id}`}>
                <Table.Td w={90}>{tf(`kinds.${i.kind}`)}</Table.Td>
                <Table.Td>
                  <Text size="sm">{i.label}</Text>
                </Table.Td>
                <Table.Td w={200}>
                  <Group gap={4}>
                    <Badge color={ACTION_COLOR[i.action]} variant="light">
                      {t(`actions.${i.action}`)}
                    </Badge>
                    {i.take && (
                      <Badge color="blue" variant="outline">
                        {t("willTake")}
                      </Badge>
                    )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
