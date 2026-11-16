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
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toTraditionalAction } from "@/app/actions";
import type { Field } from "@/lib/catalog";
import { hintIn, labelIn } from "@/lib/labels";
import type { Lang } from "@/lib/words";
import { type L10n, LOCALES } from "@/generated/model";
import { report } from "./result";

/** A field's label and hint in the CMS's language. */
const useField = (field: Field) => {
  const lang = useLocale() as Lang;
  return { label: labelIn(field, lang), hint: hintIn(field, lang), lang };
};

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
  const t = useTranslations("fields");
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
        field.kind === "link" ? t("linkHint") : field.kind === "image" ? t("imageHint") : undefined
      }
    />
  );
}

/** A text in the four languages: 简体 first, its 繁體 a click away. */
function L10nInput({ field, value, onChange }: { field: Field; value: L10n; onChange: (v: L10n) => void }) {
  const t = useTranslations("fields");
  const { label, hint } = useField(field);
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
          {label}
          {field.required && <span style={{ color: "var(--mantine-color-red-6)" }}> *</span>}
        </Text>
        <Tooltip label={t("hantHelp")}>
          <Button
            size="compact-xs"
            variant="subtle"
            leftSection={<IconLanguage size={14} />}
            onClick={fromSimplified}
            loading={busy}
          >
            {t("hant")}
          </Button>
        </Tooltip>
      </Group>
      {hint && (
        <Text size="xs" c="dimmed">
          {hint}
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
  const t = useTranslations("fields");
  const { label } = useField(field);
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
        {label}
      </Text>
      {value.map((item, i) => (
        <Card key={i} withBorder padding="sm">
          <Group justify="space-between" mb="xs">
            <Text size="xs" c="dimmed">
              {t("item", { n: i + 1 })}
            </Text>
            <Group gap={4}>
              <ActionIcon
                variant="subtle"
                aria-label={t("up")}
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                <IconArrowUp size={16} />
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                aria-label={t("down")}
                disabled={i === value.length - 1}
                onClick={() => move(i, 1)}
              >
                <IconArrowDown size={16} />
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                color="red"
                aria-label={t("removeItem")}
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
          {t("addItem")}
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
  const { label, hint, lang } = useField(field);
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
        label={label}
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
        ? (field.options ?? []).map((o) => ({ value: o.value, label: labelIn(o, lang) }))
        : field.kind === "icon"
          ? ctx.icons.map((i) => ({ value: i, label: i }))
          : ctx.works;
    return (
      <Select
        label={label}
        description={hint}
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
      <SingleInput field={field} label={label} value={text} onChange={onChange} />
      {hint && (
        <Text size="xs" c="dimmed">
          {hint}
        </Text>
      )}
    </Stack>
  );
}
