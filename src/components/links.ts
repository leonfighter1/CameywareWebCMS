/**
 * A link that opens in a tab of its own (the owner, 2026-11-16: 「很多link最好都可以打开新的tab，否则很容易丢失自己从哪里
 * 打开的，比如edit component, check views, check pages等等」): every link from a page to a file's editor, to a page that
 * uses it, to another list or a deployment's log. The shell's menu, the folder tree and 回到文件夹 stay in the tab.
 */
export const NEW_TAB = { target: "_blank", rel: "noopener" } as const;
