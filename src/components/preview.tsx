"use client";
/**
 * 预览 at the top of a content file's editor (the owner, 2026-11-16: 「每个content file的顶部也添加一个 save, 同时再增加一个
 * preview. preview link 点开后可以preview changes」): its draft on the CMS's preview, in a new tab. Changes not saved yet
 * are saved first: a save is only a draft, nothing leaves the CMS before it is checked in.
 */
import { Button, Tooltip } from "@mantine/core";
import { IconEye } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

export function PreviewButton({
  href,
  save,
  none,
}: {
  /** The draft's address on the preview; without one the button says [none]. */
  href?: string;
  /** Saves the changes (true when saved); only while there are changes of yours to save. */
  save?: () => Promise<boolean>;
  none?: string;
}) {
  const t = useTranslations("files");
  const open = async () => {
    if (!href) return;
    if (!save) {
      window.open(href, "_blank", "noopener");
      return;
    }
    // Opened now, while the click still allows it, and sent to the draft once it is saved.
    const tab = window.open("", "_blank");
    if (await save()) {
      if (tab) {
        tab.opener = null;
        tab.location.href = href;
      } else window.open(href, "_blank", "noopener");
    } else tab?.close();
  };
  return (
    <Tooltip label={href ? (save ? t("previewSaves") : t("previewDraft")) : none} disabled={!href && !none}>
      <Button
        variant="default"
        size="xs"
        leftSection={<IconEye size={14} />}
        onClick={open}
        // Disabled this way, so the tooltip still says why (a disabled button takes no hover).
        data-disabled={!href || undefined}
        data-testid="preview"
      >
        {t("preview")}
      </Button>
    </Tooltip>
  );
}
