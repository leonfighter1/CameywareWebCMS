import {
  Anchor,
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
import { getTranslations } from "next-intl/server";
import { StateBadges } from "@/components/files";
import { Frame } from "@/components/frame";
import { TYPES } from "@/lib/catalog";
import { descriptionIn, labelIn } from "@/lib/labels";
import { fileViews } from "@/lib/present";
import { database, language, requireUser } from "@/lib/server";
import { listComponents, listPages } from "@/lib/store";
import { files } from "@/lib/workflow";

/** The blocks by type (the owner: 「还可以查看不同的component， 比如herobanner」): each with its state and its pages. */
export default async function ComponentsPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  const user = await requireUser();
  const lang = await language();
  const t = await getTranslations("components");
  const pg = await database();
  const [comps, pages, all] = await Promise.all([listComponents(pg, type), listPages(pg), files(pg)]);
  const views = fileViews(all, lang);
  const on = (id: string) => pages.filter((p) => !p.deleted && p.blocks.includes(id)).map((p) => p.path);
  const def = type ? TYPES[type] : undefined;
  return (
    <Frame>
      <Stack gap="lg">
        <Title order={1} fz={22}>
          {def ? t("ofType", { label: labelIn(def, lang) }) : t("title")}
        </Title>
        {def && <Text c="dimmed">{descriptionIn(def, lang)}</Text>}
        {!type && (
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
            {Object.entries(TYPES).map(([k, d]) => (
              <Card key={k} withBorder component="a" href={`/components/?type=${k}`}>
                <Text fw={600}>{labelIn(d, lang)}</Text>
                <Text size="sm" c="dimmed">
                  {descriptionIn(d, lang)}
                </Text>
              </Card>
            ))}
          </SimpleGrid>
        )}
        <Card withBorder>
          <TableScrollContainer minWidth={720}>
            <Table verticalSpacing="xs" highlightOnHover>
              <TableThead>
                <TableTr>
                  <TableTh>{t("block")}</TableTh>
                  <TableTh>{t("type")}</TableTh>
                  <TableTh>{t("file")}</TableTh>
                  <TableTh>{t("usedOn")}</TableTh>
                </TableTr>
              </TableThead>
              <TableTbody>
                {comps
                  .filter((c) => !c.deleted)
                  .map((c) => (
                    <TableTr key={c.id}>
                      <TableTd>
                        <Group gap={6}>
                          <Anchor href={`/components/${c.id}`} size="sm">
                            {c.name || c.id}
                          </Anchor>
                        </Group>
                      </TableTd>
                      <TableTd>
                        <Text size="sm">{TYPES[c.type] ? labelIn(TYPES[c.type]!, lang) : c.type}</Text>
                      </TableTd>
                      <TableTd>
                        <StateBadges file={views[`component:${c.id}`]} me={user.login} size="xs" />
                      </TableTd>
                      <TableTd>
                        <Text size="sm" ff="monospace">
                          {on(c.id).join("  ") || t("unused")}
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
