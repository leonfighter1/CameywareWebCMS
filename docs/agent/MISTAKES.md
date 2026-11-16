# Mistakes: Cameyware Web CMS

Rules learned here, one per mistake; add with `add-mistake.ps1 -Project .`.

## 1. An else after a for-if binds to the if inside the loop

- **Symptom:** every text in languages was refused as 「应该是各种语言的文字」.
- **Cause:** `if (a) x; else if (b) for (…) if (c) y; else if (d) z;` — the last `else` belonged to the `if` inside the
  `for`.
- **Fix:** braces round each branch of the chain (`src/lib/catalog.ts`).
- **Rule:** a chain of if / else if whose branch is a loop gets braces on every branch.

## 2. An XML element is a list by its place, not its name

- **Symptom:** a round trip of the whole site in XML failed: the disclaimer's `text` field and the works' `page` field
  came back as lists.
- **Cause:** fast-xml-parser's `isArray` was given names (`text`, `page`), which fields may also be called.
- **Fix:** `isArray` by the element's path (`cms.page`, `cms.texts.text`; `item` anywhere).
- **Rule:** decide an XML list by its path in the document; test every round trip with the real catalog's fields.

## 5. spawn with shell: true joins the arguments unquoted

- **Symptom:** 推到正式站 pushed nothing: the commit 「Content: release 1 (tester)」 failed (found by tests/publish.test.ts
  against a bare repository).
- **Cause:** every command was spawned with `shell: true` on Windows, which joins the arguments with spaces and no
  quotes: the message came apart at its spaces and brackets.
- **Fix:** `shell` only for npx.cmd (a .cmd needs it); git runs directly.
- **Rule:** spawn an .exe without a shell; when a .cmd needs one, give it no argument with a space. Test a git step
  against a bare repository, never against GitHub.

## 4. A server component can't use Mantine's dotted parts

- **Symptom:** /login answered 500: 「Element type is invalid: expected a string … but got: undefined」, and npm start's
  wait for it never ended.
- **Cause:** `List.Item` and `Table.Tr` in a server component: a client module's reference has no properties.
- **Fix:** Mantine's named exports there (`ListItem`, `TableTr`, `TableScrollContainer` …); client components may keep the
  dotted ones.
- **Rule:** in a server component (no "use client"), use Mantine's named parts, never `X.Y`.

## 3. tsx runs a .ts script as CommonJS unless the package is a module

- **Symptom:** `npm start` stopped at once: 「Top-level await is currently not supported with the "cjs" output format」.
- **Cause:** the package had no `"type": "module"`.
- **Fix:** `"type": "module"` in package.json (the PostCSS config is .cjs).
- **Rule:** a package whose scripts use top-level await is `"type": "module"`.
