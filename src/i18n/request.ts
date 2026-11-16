import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { LANG_COOKIE, langOf, MESSAGES } from "@/lib/words";

/** Each request in the language its browser chose (the cms_lang cookie), without a language in the address. */
export default getRequestConfig(async () => {
  const locale = langOf((await cookies()).get(LANG_COOKIE)?.value);
  return { locale, messages: MESSAGES[locale] };
});
