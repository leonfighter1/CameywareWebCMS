# Mistakes: Cameyware Web CMS

Rules learned here, one per mistake; add with `add-mistake.ps1 -Project .`.

## Rules (read before every task)

1. A chain of if / else if whose branch is a loop gets braces on every branch.
2. Decide an XML list by its path in the document; test every round trip with the real catalog's fields.
3. A package whose scripts use top-level await is `"type": "module"`.
4. In a server component (no "use client"), use Mantine's named parts, never `X.Y`.
5. Spawn an .exe without a shell; when a .cmd needs one, give it no argument with a space. Test a git step against a bare
   repository, never against GitHub.
6. In a server component, no component as a prop (tests/server-components.test.ts). After a change, open every route.
7. Ignore an output folder from the root (`/name/`), never by a bare `name/`; check git status lists a new folder's files.
8. After stopping the CMS, check that 8790 and 8791 are free; stop what still holds them by the port's owner.
9. Never round-trip a source file through Get-Content / Set-Content in Windows PowerShell: rename with the Edit tool or
   node; if it happens, undo it with the 1252 round trip, not git checkout.
10. In Playwright, wait for a control inside a Mantine Modal or Drawer, never for the modal's own data-testid

## Log

### 2026-11-16: A browser walk waited on a Mantine Modal's data-testid
- **Symptom:** locator.waitFor timed out: the style browser's data-testid resolved to a hidden mantine-Modal-root, though the dialog was open on screen
- **Root cause:** Mantine puts data-testid on the modal's root, a wrapper with no box of its own (the overlay and content are fixed inside it), so Playwright never sees it as visible
- **Fix:** the walk waits for a control inside the dialog (style-pick, source-shared) instead
- **Rule:** In Playwright, wait for a control inside a Mantine Modal or Drawer, never for the modal's own data-testid (Rule 10)

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

## 6. A server component can't hand next/link to Mantine

- **Symptom:** /components answered 「Server error」 (the owner, through the tunnel): 「Functions cannot be passed directly
  to Client Components」 in the log.
- **Cause:** `component={Link}` on a Mantine Card and Anchor in a server component: a function can't cross to the
  browser. The walk-through opened every editor but not that list, so nothing saw it.
- **Fix:** plain links there (`component="a"`, `href`).
- **Rule:** in a server component, no component as a prop; enforced by tests/server-components.test.ts (with rule 4's
  dotted parts). After a change, open every route, not only the ones the flow passes through.

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

## 7. A bare folder name in .gitignore hid a source folder

- **Symptom:** `src/app/deploy` (v1's 发布 page) was never committed: git status never listed it, so the repository on
  GitHub had no 发布 page (found in S2, replacing it).
- **Cause:** `deploy/` in .gitignore matches a folder of that name at any depth: the route folder went with the deploy
  output.
- **Fix:** anchored to the root: `/deploy/`, `/data/`.
- **Rule:** ignore an output folder from the root (`/name/`), never by a bare `name/`; after adding a route or a folder,
  check that git status lists its files before committing.

## 8. Stopping npm start left the CMS's servers running

- **Symptom:** after the background `npm start` was stopped, ports 8790 and 8791 were still held (`next start` and
  `preview-server.ts`).
- **Cause:** on Windows, ending the shell that ran npm start doesn't end the node processes `scripts/start.ts` spawned.
- **Fix:** found by port (`Get-NetTCPConnection -LocalPort 8790,8791`) and stopped by process id.
- **Rule:** after stopping the CMS, check that 8790 and 8791 are free before building or touching `data/`; stop what
  still holds them by the port's owner.

## 9. Get-Content | Set-Content garbled a UTF-8 source file

- **Symptom:** after a rename with `(Get-Content f) -replace … | Set-Content -Encoding utf8`, every Chinese comment in
  `src/lib/workflow.ts` read as mojibake (丢弃 → ä¸¢å¼ƒ) and the file began with a BOM.
- **Cause:** Windows PowerShell 5.1's Get-Content reads a file without a BOM in the ANSI code page (1252); Set-Content
  -Encoding utf8 writes a BOM.
- **Fix:** reversed byte for byte (`[Text.Encoding]::GetEncoding(1252).GetBytes`, then `UTF8.GetString`), written without
  a BOM; the diff's non-ASCII lines were then only the intended ones.
- **Rule:** never round-trip a source file through Get-Content / Set-Content in Windows PowerShell: rename with the Edit
  tool (replace_all) or node. If it happens, undo it with the 1252 round trip, not git checkout (that loses the work).
