"use client";
/**
 * The form of a block, a global or a page's texts, from the catalog's fields (cms/types.json): a text in the four
 * languages side by side (繁體 made from 简体 on a click), a list as cards to add, move and remove, a choice as a select.
 * It only edits the value it is given; saving is the page's (with the server's check).
 */
import {
  ActionIcon,
  Button,
  Card,
  Group,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { IconArrowDown, IconArrowUp, IconLanguage, IconPlus, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { toTraditionalAction } from "@/app/actions";
import type { Field } from "@/lib/catalog";
import { type L10n, LOCALES } from "@/generated/model";
import { report } from "./result";

export const LOCALE_LABELS: Record<(typeof LOCALES)[number], string> = {
  zh: "简体",
  "zh-hant": "繁體",
  en: "English",
  fr: "Français",
};

/** What a form needs beyond the catalog: the works (for a work field) and the icons. */
export type Context = { works: { value: string; label: string }[]; icons: string[] };

type Value = Record<string, unknown>;

export function FieldsEditor({
  fields,
  value,
  onChange,
  ctx,
}: {
  fields: Field[];
  value: Value;
  onChange: (v: Value) => void;
  ctx: Context;
}) {
  return (
    <Stack gap="md">
      {fields.map((f) => (
        <FieldInput
          key={f.name}
          field={f}
          value={value[f.name]}
          ctx={ctx}
          onChange={(v) => onChange({ ...value, [f.name]: v })}
        />
      ))}
    </Stack>
  );
}

const multiline = (kind: string) => kind === "textarea" || kind === "html" || kind === "code";

function SingleInput({
  field,
  label,
  value,
  onChange,
}: {
  field: Field;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  if (multiline(field.kind))
    return (
      <Textarea
        label={label}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        autosize
        minRows={field.kind === "code" ? 8 : field.kind === "html" ? 5 : 2}
        maxRows={30}
        className={field.kind === "textarea" ? undefined : "cms-code"}
        spellCheck={field.kind === "textarea"}
      />
    );
  return (
    <TextInput
      label={label}
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      placeholder={
        field.kind === "link"
          ? "/works/… 或 https://…"
          : field.kind === "image"
            ? "/art/… 或 https://…"
            : undefined
      }
    />
  );
}

/** A text in the four languages: 简体 first, its 繁體 a click away. */
function L10nInput({ field, value, onChange }: { field: Field; value: L10n; onChange: (v: L10n) => void }) {
  const [busy, setBusy] = useState(false);
  const fromSimplified = async () => {
    if (!value.zh) return;
    setBusy(true);
    const r = await toTraditionalAction(value.zh);
    setBusy(false);
    if (report(r) && typeof r.value === "string") onChange({ ...value, "zh-hant": r.value });
  };
  return (
    <Stack gap={6}>
      <Group justify="space-between" gap="xs">
        <Text size="sm" fw={600}>
          {field.label}
          {field.required && <span style={{ color: "var(--mantine-color-red-6)" }}> *</span>}
        </Text>
        <Tooltip label="用 OpenCC 把简体转成台湾用法的繁體，再按 App 的用词改几处；保存前请读一遍">
          <Button
            size="compact-xs"
            variant="subtle"
            leftSection={<IconLanguage size={14} />}
            onClick={fromSimplified}
            loading={busy}
          >
            用简体生成繁體
          </Button>
        </Tooltip>
      </Group>
      {field.hint && (
        <Text size="xs" c="dimmed">
          {field.hint}
        </Text>
      )}
      {/* Two languages a row: a line of each stays readable beside the preview. */}
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xs">
        {LOCALES.map((l) => (
          <SingleInput
            key={l}
            field={field}
            label={LOCALE_LABELS[l]}
            value={value[l] ?? ""}
            onChange={(v) => onChange({ ...value, [l]: v })}
          />
        ))}
      </SimpleGrid>
    </Stack>
  );
}

function ListInput({
  field,
  value,
  onChange,
  ctx,
}: {
  field: Field;
  value: Value[];
  onChange: (v: Value[]) => void;
  ctx: Context;
}) {
  const sub = field.fields ?? [];
  const move = (i: number, by: number) => {
    const next = [...value];
    const [item] = next.splice(i, 1);
    next.splice(i + by, 0, item!);
    onChange(next);
  };
  return (
    <Stack gap="xs">
      <Text size="sm" fw={600}>
        {field.label}
      </Text>
      {value.map((item, i) => (
        <Card key={i} withBorder padding="sm">
          <Group justify="space-between" mb="xs">
            <Text size="xs" c="dimmed">
              第 {i + 1} 项
            </Text>
            <Group gap={4}>
              <ActionIcon variant="subtle" aria-label="上移" disabled={i === 0} onClick={() => move(i, -1)}>
                <IconArrowUp size={16} />
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                aria-label="下移"
                disabled={i === value.length - 1}
                onClick={() => move(i, 1)}
              >
                <IconArrowDown size={16} />
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                color="red"
                aria-label="删除这一项"
                onClick={() => onChange(value.filter((_, n) => n !== i))}
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
          </Group>
          <FieldsEditor
            fields={sub}
            value={item}
            ctx={ctx}
            onChange={(v) => onChange(value.map((x, n) => (n === i ? v : x)))}
          />
        </Card>
      ))}
      <Group>
        <Button
          size="xs"
          variant="light"
          leftSection={<IconPlus size={14} />}
          disabled={!!field.max && value.length >= field.max}
          onClick={() => onChange([...value, {}])}
        >
          添加一项
        </Button>
      </Group>
    </Stack>
  );
}

export function FieldInput({
  field,
  value,
  onChange,
  ctx,
}: {
  field: Field;
  value: unknown;
  onChange: (v: unknown) => void;
  ctx: Context;
}) {
  if (field.kind === "list")
    return (
      <ListInput
        field={field}
        value={Array.isArray(value) ? (value as Value[]) : []}
        onChange={onChange}
        ctx={ctx}
      />
    );
  if (field.kind === "boolean")
    return (
      <Switch
        label={field.label}
        checked={value === undefined ? field.default === true : value === true}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
    );
  if (field.localized)
    return (
      <L10nInput
        field={field}
        value={value && typeof value === "object" ? (value as L10n) : {}}
        onChange={onChange}
      />
    );
  const text = typeof value === "string" ? value : "";
  if (field.kind === "select" || field.kind === "icon" || field.kind === "work") {
    const data =
      field.kind === "select"
        ? (field.options ?? [])
        : field.kind === "icon"
          ? ctx.icons.map((i) => ({ value: i, label: i }))
          : ctx.works;
    return (
      <Select
        label={field.label}
        description={field.hint}
        data={data}
        value={text || (field.default as string | undefined) || null}
        onChange={(v) => onChange(v ?? "")}
        clearable={field.kind === "icon"}
        allowDeselect={field.kind === "icon"}
        withAsterisk={field.required}
      />
    );
  }
  return (
    <Stack gap={4}>
      <SingleInput field={field} label={field.label} value={text} onChange={onChange} />
      {field.hint && (
        <Text size="xs" c="dimmed">
          {field.hint}
        </Text>
      )}
    </Stack>
  );
}
