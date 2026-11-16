import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "./globals.css";

import { ColorSchemeScript, mantineHtmlProps } from "@mantine/core";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Cameyware 网站内容管理",
  robots: { index: false, follow: false },
};

// Every page reads the database as it is now.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hans" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript defaultColorScheme="auto" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
