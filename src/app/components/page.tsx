import {
  Anchor,
  Badge,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Table,
  TableScrollContainer,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  Title,
} from "@mantine/core";
import Link from "next/link";
import { Frame } from "@/components/frame";
import { TYPES } from "@/lib/catalog";
import { database } from "@/lib/server";
import { changes, listComponents, listPages } from "@/lib/store";

/** The blocks by type (the owner: 「还可以查看不同的component， 比如herobanner」): each with the pages it is on. */
export default async function ComponentsPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  const pg = await database();
  const [comps, pages, pending] = await Promise.all([listComponents(pg, type), listPages(pg), changes(pg)]);
  const state = new Set(pending.filter((c) => c.kind === "component").map((c) => c.id));
  const on = (id: string) => pages.filter((p) => !p.deleted && p.blocks.includes(id)).map((p) => p.path);
  const def = type ? TYPES[type] : undefined;
  return (
    <Frame>
      <Stack gap="lg">
        <Title order={1} fz={22}>
          {def ? `区块：${def.label}` : "区块（按类型）"}
        </Title>
        {def && <Text c="dimmed">{def.description}</Text>}
        {!type && (
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
            {Object.entries(TYPES).map(([t, d]) => (
              <Card key={t} withBorder component={Link} href={`/components/?type=${t}`}>
                <Text fw={600}>{d.label}</Text>
                <Text size="sm" c="dimmed">
                  {d.description}
                </Text>
              </Card>
            ))}
          </SimpleGrid>
        )}
        <Card withBorder>
          <TableScrollContainer minWidth={640}>
            <Table verticalSpacing="xs" highlightOnHover>
              <TableThead>
                <TableTr>
                  <TableTh>区块</TableTh>
                  <TableTh>类型</TableTh>
                  <TableTh>用在</TableTh>
                </TableTr>
              </TableThead>
              <TableTbody>
                {comps
                  .filter((c) => !c.deleted)
                  .map((c) => (
                    <TableTr key={c.id}>
                      <TableTd>
                        <Group gap={6}>
                          <Anchor component={Link} href={`/components/${c.id}`} size="sm">
                            {c.name || c.id}
                          </Anchor>
                          {state.has(c.id) && (
                            <Badge size="xs" color="yellow" variant="light">
                              未签入
                            </Badge>
                          )}
                        </Group>
                      </TableTd>
                      <TableTd>
                        <Text size="sm">{TYPES[c.type]?.label ?? c.type}</Text>
                      </TableTd>
                      <TableTd>
                        <Text size="sm" ff="monospace">
                          {on(c.id).join("  ") || "（没用在页面上）"}
                        </Text>
                      </TableTd>
                    </TableTr>
                  ))}
              </TableTbody>
            </Table>
          </TableScrollContainer>
        </Card>
      </Stack>
    </Frame>
  );
}
