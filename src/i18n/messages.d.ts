import type messages from "../../messages/zh.json";

// The CMS's words are typed from its Chinese: a key the pages use that zh.json lacks fails the typecheck (and
// tests/messages.test.ts holds en.json to the same keys).
declare module "next-intl" {
  interface AppConfig {
    Locale: "zh" | "en";
    Messages: typeof messages;
  }
}
