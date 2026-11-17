"use client";
/** Workflow jobs in a list (S7): 我的文件's and the 工作流 page's; a job's step as a badge. */
import { Anchor, Badge, Table, Text } from "@mantine/core";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { Step } from "@/lib/jobs";
import type { JobView } from "@/lib/present";
import { NEW_TAB } from "./links";

/** Each step's colour: where it stands, ended in grey. */
export const STEP_COLOR: Record<Step, string> = {
  progress: "violet",
  preview: "teal",
  submitted: "orange",
  approved: "green",
  scheduled: "cyan",
  done: "gray",
  terminated: "red",
};

export function StepBadge({ step, size = "sm" }: { step: Step; size?: "xs" | "sm" }) {
  const t = useTranslations("jobs");
  return (
    <Badge size={size} color={STEP_COLOR[step]} variant="light" style={{ minWidth: "max-content" }}>
      {t(`steps.${step}`)}
    </Badge>
  );
}

export function JobTable({
  jobs,
  picked,
  onPick,
  empty,
}: {
  jobs: JobView[];
  /** The job shown below the list (the 工作流 page); without [onPick] each name opens it in a new tab. */
  picked?: number;
  onPick?: (id: number) => void;
  empty: string;
}) {
  const t = useTranslations("jobs");
  if (!jobs.length)
    return (
      <Text size="sm" c="dimmed">
        {empty}
      </Text>
    );
  return (
    <Table.ScrollContainer minWidth={720}>
      <Table verticalSpacing={6} highlightOnHover data-testid="job-table">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>#</Table.Th>
            <Table.Th>{t("ticket")}</Table.Th>
            <Table.Th>{t("name")}</Table.Th>
            <Table.Th>{t("step")}</Table.Th>
            <Table.Th>{t("files")}</Table.Th>
            <Table.Th>{t("author")}</Table.Th>
            <Table.Th>{t("approver")}</Table.Th>
            <Table.Th>{t("modified")}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {jobs.map((j) => (
            <Table.Tr
              key={j.id}
              data-testid={`job-${j.id}`}
              onClick={onPick && (() => onPick(j.id))}
              bg={picked === j.id ? "var(--mantine-primary-color-light)" : undefined}
              style={onPick ? { cursor: "pointer" } : undefined}
            >
              <Table.Td>
                <Text size="sm">{j.id}</Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm" ff="monospace">
                  {j.ticket || "—"}
                </Text>
              </Table.Td>
              <Table.Td>
                {onPick ? (
                  <Text size="sm" fw={picked === j.id ? 700 : undefined}>
                    {j.name}
                  </Text>
                ) : (
                  <Anchor component={Link} {...NEW_TAB} href={`/workflow/?job=${j.id}`} size="sm">
                    {j.name}
                  </Anchor>
                )}
              </Table.Td>
              <Table.Td>
                <StepBadge step={j.step} size="xs" />
                {j.step === "scheduled" && (
                  <Text size="xs" c="dimmed">
                    {j.scheduled}
                  </Text>
                )}
              </Table.Td>
              <Table.Td>
                <Text size="sm">{j.files}</Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm">{j.author}</Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm">{j.approver ?? "—"}</Text>
              </Table.Td>
              <Table.Td>
                <Text size="xs">{j.at}</Text>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
