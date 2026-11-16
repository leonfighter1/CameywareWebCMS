"use client";
import { createTheme, MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import type { ReactNode } from "react";

const theme = createTheme({
  primaryColor: "red",
  defaultRadius: "md",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif',
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <ModalsProvider>
        <Notifications position="top-center" />
        {children}
      </ModalsProvider>
    </MantineProvider>
  );
}
