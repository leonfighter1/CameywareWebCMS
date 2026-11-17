"use client";
/**
 * Where a block is used (the owner, 2026-11-16: 「for shared content file, it can be referenced by different pages, so
 * you can create a link that triggers a pop up, that popup will list all pages that contains the content file」): a
 * link that says how many pages show it, opening the list of them: each page's address (its editor, in a new tab),
 * title and state, every place it has there (zone and style), and its draft in the preview.
 */
import { Anchor, Badge, Group, Modal, ScrollArea, Stack, Table, Text, TextInput } from "@mantine/core";
import { IconEye, IconSearch } from "@tabler/icons-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { PageUse } from "@/lib/present";
import { NEW_TAB } from "./links";

/** From this many pages on, the list has a search. */
const SEARCH_FROM = 8;

export function UsedOn({
  name,
  uses,
  here,
  label,
  size = "sm",
  zIndex,
  onOpen,
}: {
  /** The block's name, in the list's title. */
  name: string;
  uses: PageUse[];
  /** The page being edited, marked 此页 in the list. */
  here?: string;
  /** The link's words; 用在 N 个页面 by default. */
  label?: string;
  size?: "xs" | "sm";
  /** Above the dialog it is opened from. */
  zIndex?: number;
  /**
   * Told when the list opens and closes: the dialog it is opened from takes no Esc meanwhile (Mantine's every open
   * dialog closes on Esc, the one under it too).
   */
  onOpen?: (open: boolean) => void;
}) {
  const t = useTranslations("uses");
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  if (!uses.length)
    return (
      <Text size={size} c="dimmed">
        {t("none")}
      </Text>
    );
  const find = q.trim().toLowerCase();
  const shown = find
    ? uses.filter((u) => u.path.toLowerCase().includes(find) || u.title.toLowerCase().includes(find))
    : uses;
  const show = (on: boolean) => {
    setOpen(on);
    onOpen?.(on);
  };
  return (
    <>
      {/* Its clicks stay its own: in a row that is picked by a click (用共用的) they pick nothing, the list's neither
          (React passes them on through the portal). */}
      <Anchor
        component="button"
        type="button"
        size={size}
        onClick={(e) => {
          e.stopPropagation();
          show(true);
        }}
        data-testid="used-on"
      >
        {label ?? t("link", { n: uses.length })}
      </Anchor>
      <Modal
        opened={open}
        onClose={() => show(false)}
        onClick={(e) => e.stopPropagation()}
        title={t("title", { name, n: uses.length })}
        size="lg"
        zIndex={zIndex}
        data-testid="used-on-list"
      >
        <Stack>
          {uses.length >= SEARCH_FROM && (
            <TextInput
              leftSection={<IconSearch size={14} />}
              placeholder={t("search")}
              value={q}
              onChange={(e) => setQ(e.currentTarget.value)}
            />
          )}
          <ScrollArea.Autosize mah={440}>
            <Table verticalSpacing={6} data-testid="used-on-table">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("page")}</Table.Th>
                  <Table.Th>{t("places")}</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {shown.map((u) => (
                  <Table.Tr key={u.id} data-testid={`use-${u.id}`}>
                    <Table.Td>
                      <Group gap={6}>
                        <Anchor
                          component={Link}
                          {...NEW_TAB}
                          href={`/pages/${u.id}`}
                          ff="monospace"
                          size="sm"
                        >
                          {u.path}
                        </Anchor>
                        {u.id === here && (
                          <Badge size="xs" variant="light">
                            {t("here")}
                          </Badge>
                        )}
                        {!u.active && (
                          <Badge size="xs" variant="outline" color="gray">
                            {t("inactive")}
                          </Badge>
                        )}
                      </Group>
                      {u.title && (
                        <Text size="xs" c="dimmed">
                          {u.title}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Stack gap={0}>
                        {u.places.map((p, i) => (
                          <Text key={i} size="xs">
                            {t("place", { zone: p.zone, style: p.style })}
                          </Text>
                        ))}
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <Anchor href={u.draft} {...NEW_TAB} size="xs" style={{ whiteSpace: "nowrap" }}>
                        <IconEye size={12} /> {t("draft")}
                      </Anchor>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            {!shown.length && (
              <Text size="sm" c="dimmed" ta="center" py="sm">
                {t("noMatch")}
              </Text>
            )}
          </ScrollArea.Autosize>
          <Text size="xs" c="dimmed">
            {t("help")}
          </Text>
        </Stack>
      </Modal>
    </>
  );
}
