"use client";
/**
 * A page's own file in the explorer's page list (S9; the owner, 2026-11-16: 「we can download and upload with the json or
 * xml file to cover the selected page … when you upload the same name with the file, it will be automatically checked
 * out」): 下载 the page picked as <its name>.json or .xml; 上传 a file back onto the page of its name (the one picked if one
 * is), shown first, then written, its files taken for you when nobody has them.
 */
import { Button, FileButton, Group, Menu, Modal, Stack, Text } from "@mantine/core";
import { IconDownload, IconUpload } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { uploadPageAction } from "@/app/actions";
import type { FileView } from "@/lib/present";
import { changedIn, type Plan, PlanView } from "./plan";
import { report } from "./result";

export function PageTransfer({ picked, done }: { picked: FileView[]; done: () => void }) {
  const t = useTranslations("transfer");
  const tf = useTranslations("files");
  const one = picked.length === 1 ? picked[0] : undefined;
  const [file, setFile] = useState<{ name: string; text: string }>();
  const [plan, setPlan] = useState<Plan>();
  const [busy, setBusy] = useState(false);
  const read = async (f: File | null) => {
    if (!f) return;
    const text = await f.text();
    setBusy(true);
    const r = await uploadPageAction(f.name, text, false, one?.id);
    setBusy(false);
    if (report(r) && r.value) {
      setFile({ name: f.name, text });
      setPlan(r.value);
    }
  };
  const close = () => {
    setPlan(undefined);
    setFile(undefined);
  };
  const changed = plan ? changedIn(plan) : [];
  return (
    <>
      <Menu>
        <Menu.Target>
          <Button
            size="xs"
            variant="default"
            leftSection={<IconDownload size={14} />}
            disabled={!one}
            data-testid="page-download"
          >
            {t("pageDownload")}
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          {(["json", "xml"] as const).map((format) => (
            <Menu.Item
              key={format}
              component="a"
              href={`/api/export?kind=page&id=${encodeURIComponent(one?.id ?? "")}&format=${format}`}
            >
              {format.toUpperCase()}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
      <FileButton onChange={read} accept=".json,.xml,application/json,application/xml,text/xml">
        {(props) => (
          <Button
            {...props}
            size="xs"
            variant="default"
            leftSection={<IconUpload size={14} />}
            loading={busy && !plan}
            disabled={picked.length > 1}
            data-testid="page-upload"
          >
            {t("pageUpload")}
          </Button>
        )}
      </FileButton>
      <Modal
        opened={!!plan}
        onClose={close}
        title={t("pageUploadTitle", { file: file?.name ?? "" })}
        size="lg"
      >
        {plan && (
          <Stack>
            <Text size="sm" c="dimmed">
              {t("pageUploadHelp")}
            </Text>
            <PlanView plan={plan} />
            <Group justify="flex-end">
              <Button variant="default" onClick={close}>
                {tf("cancel")}
              </Button>
              <Button
                disabled={!changed.length}
                loading={busy}
                data-testid="page-upload-apply"
                onClick={async () => {
                  setBusy(true);
                  const r = await uploadPageAction(file!.name, file!.text, true, one?.id);
                  setBusy(false);
                  if (report(r, t("applied"))) {
                    close();
                    done();
                  }
                }}
              >
                {t("apply", { n: changed.length })}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  );
}
