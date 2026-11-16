"use client";
import { Badge, Button, Card, Group, Table, Text, Title } from "@mantine/core";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { confirm } from "@/components/files";
import { report } from "@/components/result";
import { rollbackProductionAction } from "../actions";

export type ReleaseRow = {
  id: number;
  author: string;
  note: string;
  at: string;
  went: ("preview" | "production")[];
  manifest: boolean;
  differs?: number;
};

/**
 * 所有版本: every release, where it went, and (管理员 and up) production back to one it showed before (W4). On the
 * history page since S6 (the owner: 「workflow只针对可查找的workflow进度，为了页面干净」).
 */
export function Releases({
  releases,
  preview,
  production,
  canPublish,
  busy,
}: {
  releases: ReleaseRow[];
  /** The release each site shows. */
  preview?: number;
  production?: number;
  canPublish: boolean;
  /** A deployment to production is running. */
  busy: boolean;
}) {
  const t = useTranslations("workflow");
  const tf = useTranslations("files");
  const router = useRouter();
  return (
    <Card withBorder>
      <Title order={2} fz={18}>
        {t("releases")}
      </Title>
      <Text size="xs" c="dimmed" mb="sm">
        {t("releasesHelp")}
      </Text>
      <Table.ScrollContainer minWidth={640}>
        <Table verticalSpacing="xs">
          <Table.Tbody>
            {releases.map((r) => (
              <Table.Tr key={r.id}>
                <Table.Td>
                  <Text fw={600}>#{r.id}</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">
                    {r.at} · {r.author}
                    {r.note ? ` · ${r.note}` : ""}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Group gap={4}>
                    {preview === r.id && <Badge variant="light">{t("preview")}</Badge>}
                    {production === r.id && (
                      <Badge color="green" variant="light">
                        {t("production")}
                      </Badge>
                    )}
                    {r.went.includes("production") && production !== r.id && (
                      <Badge color="gray" variant="outline">
                        {t("wasProduction")}
                      </Badge>
                    )}
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Group gap={4} justify="flex-end">
                    {canPublish && r.manifest && r.went.includes("production") && production !== r.id && (
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        color="red"
                        disabled={busy}
                        onClick={() =>
                          confirm({
                            title: t("rollbackTitle", { id: r.id }),
                            body: t("rollbackBody", { n: r.differs ?? 0 }),
                            label: t("rollback"),
                            cancel: tf("cancel"),
                            danger: true,
                            run: async () => {
                              if (report(await rollbackProductionAction(r.id), t("rollbackStarted")))
                                router.refresh();
                            },
                          })
                        }
                      >
                        {t("rollback")}
                      </Button>
                    )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Card>
  );
}
