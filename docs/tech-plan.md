# Cameyware Web CMS: tech plan

The content management system for the company website (www.cameyware.com, the repository `C:\Cameyware`). Open work
lives here as stages (S1, S2, …) of work packages (WP); the status table is at the end.

## The owner's request (2026-11-15)

> 进行一次重大更新，主要目的是为了创建一个CMS 系统去update当前的官方网站。
>
> 1. 需要有一个CMS domain专门负责更改页面（以后的每次更改就不再需要通过code push）目前就叫做 cms.preview.cameyware.com
>    打开这个可以看到页面上所有的eidt
> 2. 将页面的每一个部分的内容，除了后台读进来的，只要是静态的都要存放在数据库的相应的表中，表可以通过上传相应的JSON 或者XML 去更改
>    数据，也可以下载下来去更改。
> 3. 当前cms.preview.cameyware.com 会把每一个部分的模块上添加一个Edit, 通过这个edit link 会跳转到相应的UI 去更改内容。比如hero
>    banner
> 4. 给不同的view设置不同的type， 比如herobanner， 有专门的herobanner view 去渲染，比如accordion 还有 freeform的style 通常
>    freeform的style可以放置任何html 包括script也可以
> 5. 还要有个CMS central page， 可以查看已有的所有page， 比如https://cms-edit.preview.cameyware.com, 这个类似于一个file
>    system可以查看所有的active page 和inactive page， 还可以查看不同的component， 比如herobanner
> 6. 可以通过download and upload 去上传并且新建一个新的url of page
> 7. 多语言支持, 翻译已有文档，添加繁体中文和法语作为支持。
> 8. 添加一个workflow deployment process, 比如通过checkin 一些component或者page可以push到 cms.preview.cameyware.com，
>    然后还可以再push到preview.cameyware.com ， 最后可以直接push到production
> 9. 我们需要添加一个新的Folder和新的database专门去updatewebsite
> 10. 如果需要有些准备工作，比如准备tunnel 还有别的什么的，请告知。

Then: 「我已经新建了一个新的repo https://github.com/leonfighter1/CameywareWebCMS」.

**Decisions (the owner, 2026-11-15, asked before the work began):**

| #   | Question                                 | Decision                                                                                                                                                                                       |
| --- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | The two addresses                        | One level below the domain, so Cloudflare's free certificate covers them: `cms-preview.cameyware.com` (the site with Edit) and `cms-edit.cameyware.com` (the central page and editors)         |
| C2  | How 推到正式站 reaches www.cameyware.com | The CMS writes the release into the website repository (`content/site.json`), commits that file alone and pushes; Cloudflare Pages builds it. No new key                                       |
| C3  | freeform's scripts                       | In a sandboxed frame (`<iframe sandbox="allow-scripts …">` without same-origin): scripts run, but never reach the site's sign-in or the rest of the page; the frame takes its content's height |
| C4  | Who signs in                             | The company's staff accounts (人员与权限 in 禄命秘解's 管理后台): roles with `content` (网站编辑, 管理员, 超级管理员) edit, check in and push to preview; 管理员 and up push to production     |

## How it fits together

```
 editors ──► cms-edit.cameyware.com  (this repository: Next.js, port 8790)
                │  central page, editors per type, check-in, releases, import / export
                │  PGlite database in data/ (its own; not 禄命秘解's)
                ▼
            cms-preview.cameyware.com (port 8791): the website built in CMS mode, content live from the CMS,
                │  an Edit button on every block; 已签入 by default, 草稿 on a switch
                ▼  推到预览站: a release (every checked-in item) → the website built with it
            preview.cameyware.com (禄命秘解's server, as now)
                ▼  推到正式站: the same release → C:\Cameyware\content\site.json, committed and pushed
            www.cameyware.com (Cloudflare Pages builds main, as now)
```

- **The website stays the only renderer.** Each type (hero banner, accordion, freeform, …) is a view in the website
  (`src/cms/views`), described in its catalog (`cms/types.json`): the fields the CMS shows and checks. The CMS reads the
  catalog through its `npm run sync`.
- **What the website builds from:** a content snapshot, `CMS_CONTENT` or else `content/site.json` (production's, written
  by the CMS, never by hand). Pages, their blocks, the globals (company, header, footer, works, meta) and every UI text,
  in four languages. Texts missing from it come from `messages/*.json`, so code that adds a text still builds.
- **What stays code:** what the API reads in (the account centre's data, the services' on/off), the behaviour (sign-in,
  forms), the views themselves. Their words are UI texts, and editable.
- **Languages:** 简体 (`/zh/`), 繁體 (`/zh-hant/`, Taiwan usage as the app's), English (`/en/`), Français (`/fr/`).

## S1 The CMS, the website on it, four languages (big: CMS v1.0.0, website v2.0.0)

| WP   | What                                                                                                                                                                                                                  |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WP1  | This repository: Next.js + Mantine (the website's libraries), PGlite in `data/`, migrations, CLAUDE.md, records; ports and addresses in 禄命秘解's `config/addresses.json`                                            |
| WP2  | The content model: pages (path, active / inactive, title, description, blocks), components (a type and its data), globals, UI texts; revisions, check-ins, releases, environments, deployments                        |
| WP3  | The website: the catalog and a view per type; every public page from the snapshot (`[locale]/[...slug]`), the header and footer from the globals, the texts merged in; the first snapshot made from the site as it is |
| WP4  | Four languages on the website: routing, the switch, 繁體 (OpenCC, Taiwan phrases, then read) and French for every text and page                                                                                       |
| WP5  | Sign-in: 我的账号 → 网站内容管理 (staff) → a one-time code → the CMS reads the role from `/v1/admin/me`                                                                                                               |
| WP6  | The central page (cms-edit): pages as folders, active and inactive; components by type; globals; texts; each with its editor (a form from the catalog, four languages side by side, a live preview)                   |
| WP7  | cms-preview: the website in CMS mode, live content, an Edit button on every block, the header and the footer, 已签入 / 草稿                                                                                           |
| WP8  | Download and upload, JSON and XML: a page (a new path makes a new page), a component, the texts, everything; checked against the catalog, shown as a diff before it applies                                           |
| WP9  | The workflow: save (draft) → 签入 (chosen items, a message) → cms-preview → 推到预览站 (a release, built) → 推到正式站 (committed, pushed); history, rollback to any release                                          |
| WP10 | Checks: unit tests of the model, the XML round trip, the workflow and the roles; the website's tests on the snapshot and in four languages; the harness on both                                                       |

## S2 Check-out, locks, the workflow's steps, versions, the CMS in English (big: CMS v2.0.0)

**The owner (2026-11-15), on the 发布 page (a screenshot with the space under 推到预览站 and 推到正式站 circled):**

> 添加version tracker 同时还能rollback。 同时file 必须要先checkout之后才能update， 每个file有 没有被touch的情况，这样editor可以
> 进行拿取操作，一旦拿取，file/component就进入checkout 状态，此时如果另一个人想要拿回去可以直接take over， 但是一旦当文件进入
> 签入(added to workflow)状态，file就被lock住了。此时文件就无法被拿取。只有文件被checkout的情况下可以add into workflow. 还有图中，
> 我们可以添加一个退回签入step, 在签入的step我们也可以添加terminate workflow的功能。 用户可以查看当下哪些文件在他们的名下，然后可以
> 多个文件一同签入，当然也可以移除相关文件。文件还可以被discard, discard后的文件自动退回上一个 pushed to prod的版本。 preview 版本只
> 留在cms preview 和preview中。

Then: 「给CMS网站同时添加一个英文语言。」

**Decisions (asked first):** W1 终止工作流 at the check-in step: back to the one who checked it in, checked out, the
changes kept. W2 退回签入 at the preview step: back to the check-in step, still locked; preview is built again without
it. W3 移除 in 我的文件: put back (not checked out), the changes kept; 丢弃 is another button (back to production's
version). W4 versions: each file's own (rolling one back = that version as a draft, then the workflow), and the whole
site's production too (straight back to a release pushed before, for emergencies).

**The model:** every page, block, global and UI text is a file with a state: 未拿取 (anyone may take it), 拿取 (one
person's; only they edit; another may take it over), 工作流 (checked in: locked, at 已签入 or 预览站). Production holds
each file's version pushed last; preview shows production plus the files at 预览站; cms-preview shows production plus the
workflow's files (已签入) or every draft (草稿).

| WP   | What                                                                                                                                                     |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WP11 | Files' states and owners (migration 2), every save checked against them; take, take over, put back, discard (to production's version)                    |
| WP12 | The workflow's steps: check in (several files, a message), terminate, push to preview, back to check-in, push to production; selected files at each step |
| WP13 | Versions: each file's history (its production version marked) and rollback to any; the whole site's production rolled back to a release                  |
| WP14 | 我的文件 (mine, to check in, put back or discard together); the central page, editors and texts show each file's state                                   |
| WP15 | The CMS in English and Chinese (next-intl, a switch); the catalog's labels in English; cms-preview's bar in the page's language                          |

## S3 The explorer: content by type, component styles (templates), resource bundles (big: CMS v3.0.0, website v2.1.0)

**The owner (2026-11-16), with two screenshots of Bell's CMS.Net (a tree on the left: Content/…/Components/Banner with
its content files, Common/Components/ResourceBundles, Pages; Views/BRF/Component_Styles/Banner with its .cshtml
templates; on the right each folder's files with Status (New, CheckedIn, CheckedOut, OnWorkflow), Modified Date and
Modified By or Version History):**

> your thoughts and results are pretty solid, but what I need is there is also a system can see components like this,
> content contains files of each type: e.g. banner style, there is another component style that also have related
> matched path with all templates related to this content, can express the content. this is a kind of CMS dashboard can
> view who is doing what. also, look there is a folder called Resource bundle file, that contains all keys and values of
> all rescourse form the website, this is like what you created, but need to be centeralized.

**Decisions (asked first, all as recommended):** T1 templates are CMS files: each type's templates under 视图/组件样式/
<类型>; the website's views stay as each type's 内置 template (code, read-only); new ones are written in the CMS in a safe
markup (the site's components and the block's fields, no script), taken, checked in, through the workflow and versioned
like content; each block picks its template. T2 a resource bundle is one file: the UI texts by their namespace (nav,
auth, account, workspace, errors, app, … 12 bundles, 268 texts), taken, checked in and versioned whole. T3 a fixed tree:
内容/页面, 内容/组件/<类型>, 内容/公共/资源包, 内容/公共/全局资料; 视图/组件样式/<类型>, the content's type folders and the
styles' matched by the type.

**The template markup (website `src/cms/template.ts`, shared here by `npm run sync`):** elements of the site (Box,
Stack, Group, SimpleGrid, Grid/Col, Card, Title, Text, Badge, Button, Anchor, Image, Icon, Accordion, Disclaimer,
ContactDetails, WebAppButton, ServiceCards, AppIcon, HeroArt, Html for a rich-text field), control (Each over a list
field, If on a field, Work/Works for the works), bindings `{field}`, `{#}` (the number in an Each) and `{@ns.key}` (a text
of the resource bundles). Only listed attributes, each value checked (tokens, numbers in a range, links /, https:,
mailto:, tel:, #); React escapes every text; nothing becomes HTML but a rich-text field the catalog sanitised. The CMS
checks a template against the type's fields and the bundles' keys before saving; the website draws it
(`template-view.tsx`) and falls back to the type's 内置 view when a block names no template.

| WP   | What                                                                                                                                                                                                                                         |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WP16 | The website: the template markup (parse, check, draw), `block.template` and `content.templates` (additive), the CMS preview of one block with a template (`?block=&template=`)                                                               |
| WP17 | Templates as files (migration 3: `templates`, `components.template`): editor with the elements' and the type's fields' reference and a live preview; a block picks one; a new one goes along at each step; in use refuses delete and discard |
| WP18 | Resource bundles (kind `bundle`): the text files merged per namespace with their production and every release's manifest; the bundle editor; the code's new texts, upload and download by bundle                                             |
| WP19 | The explorer as the central page: the tree, each folder's files (name, state, template or uses, modified, by, versions), filters and the steps on what is ticked; the root shows who is doing what                                           |
| WP20 | Checks: the markup's tests in both repositories, migration 3, bundles and templates in the workflow; every route in both languages; a browser walk                                                                                           |

## S4 Page layouts, components placed in zones, the page as Bell's WebPage (big: CMS v4.0.0, website v2.2.0)

**The owner (2026-11-16), with a screenshot of the support page's narrow FAQ and Bell's `Productivity_Tech.xml` (a
`WebPage`: `MetaData` with titles per language, `PageLayout` (BRF\PageLayouts\generic-rebrand), breadcrumb and sitemap
flags; `Components`, each with `ZoneId`, `ZoneIndex`, `ComponentFilePath` (\Content\…\Components\<type>\<name>) and
`StyleFilePath` (BRF\Component_Styles\<type>\<style>)):**

> 这里还缺少了对于page的layout的添加，比如有landing page layout， 还有homepagelayout 以及article 啊那些。 都要包含基本的
> header和footer那些， page里的内容是由不同的component组成的， 我给你一个参考案例，你可以看一下，尽量参考这样的xml去搭建
> 内容。然后 把图片中采用同样宽度大小布局的页面都改大宽度，跟其他页面一样。

**Decisions (asked first, both as recommended):** L1 layouts are CMS files: four built-in ones in the website's code
(标准 standard: one main zone; 首页 home: a full-width hero zone and the main zone; 落地页 landing: hero, main and a
full-width action band; 文章 article: a header zone, the main column and a side column), read-only, and new ones written
in the CMS in the template markup with `<Zone name="…" />`, taken, checked in and versioned like content; every layout is
drawn inside the site's header and footer. L2 the style is chosen where a component is placed (Bell's `StyleFilePath`):
a page lists its placements, each a zone, an index, the component and its style; a block's template of S3 moves to its
placements, and the block editor edits the content alone. The narrow width goes: every page is as wide as the others.

**Then, during the work (2026-11-16), with Bell's page editor's screenshots (a palette of available components; rows,
each a component card with Content and Style; edit, content source (Use Shared / Create New / Copy From Existing), style
Browse (styles with their counts and Used in Pages) and delete; a Metadata page-properties dialog):**

> then open the page, you can open view like this, you can drag and drop rows(create new row), and create a new file of
> component based on the drag and drop, reorder. you can create component and pick avaialbe styles from the files.

WP23 took it: the page editor is Bell's, by drag and drop.

| WP   | What                                                                                                                                                                                                      |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WP21 | The website: the built-in layouts and their zones (`src/cms/layouts.ts`), CMS layouts (the markup's `Zone`), pages drawn by layout and zone, a breadcrumb, a page left out of the sitemap; narrow gone    |
| WP22 | The CMS's model (migration 4): `layouts` and kind `layout`; a page's layout, breadcrumb and sitemap; its blocks as placements {component, zone, style}; S3's block templates moved to their placements    |
| WP23 | The page editor by zone: the layout chosen, each zone's components in order, a style for each, moved between zones; the layout editor and the built-in layouts' pages; Views/Page layouts in the tree     |
| WP24 | A page's download and upload as Bell's WebPage (MetaData; Components with ZoneId, ZoneIndex, ComponentFilePath, StyleFilePath), the old form still read; a new layout and new styles go along with a page |
| WP25 | Checks: the layout markup and zones in both repositories, migration 4, layouts and placements in the workflow, the WebPage round trip; every route in both languages; a browser walk                      |

## S5 Rows of components (big: CMS v5.0.0, website v2.3.0)

**The owner (2026-11-16), with three screenshots of Bell's page editor (Row 1 holding a BannerGroup and a FreeForm side
by side; a BannerGroup and a FreeForm dragged into Row 2; Row dragged from the palette into the gap between Row 1 and
Row 2):**

> another thing: we should be able to add new row to the page level, also rows can be drag and drop reordered, row
> index don't carry. check the screenshot.one row can be added multiple components(can be duplicated components as well)

**Read as:** a zone of the layout holds rows; a row holds one or more components side by side, the same one twice too;
新的一行 in the palette makes a row; a whole row drags to another place; a row's number is where it stands, never kept
with it. Kept as placements in one list with an optional row key (no migration: a placement without one is a row
alone), the editor's empty rows saved when their first component is.

| WP   | What                                                                                                                                                                        |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WP26 | The website: `Block.row`, `rowsOf` and `isRowKey` (`layouts.ts`, shared); a row of several side by side in even columns, stacked on a phone; a block twice on a page        |
| WP27 | The CMS: `Placement.row` checked, built, seeded; `rows.ts` (rows of a zone, a placement put beside a row or as a row, a card or a row moved); `placeBlockAction` through it |
| WP28 | The editor: 新的一行, rows with a bar (drag, up, down, delete), components side by side (drag, left, right, which half they are dropped on), moves shown at once            |
| WP29 | The WebPage's `RowId` both ways; checks: the row functions, a row to the website and through a WebPage, a bad key; a browser walk                                           |

## S6 Built-in templates as files, a cms-preview branch; the deployment history; links in new tabs (big: CMS v6.0.0, website v2.4.0)

**The owner (2026-11-16):**

> for all the builtin template, don't have download and upload of code. we should be able to checkout and replace the
> same file from local file. The file's status should follow the same statuses like reglar files. however, we should
> have version controls. while we upload a new template file, for cms-preview branch should be created and allow us to
> run push for the files. what do you suggest

then, on the suggestion (one file per template, the same statuses and versions, a `cms-preview` branch, 超级管理员 only,
imports checked):

> we should be able to view the file, download the file upload the file, if file never taken by others, it should be
> automatically replaced

> 给deployments添加一个新的link， 当前的deployment只显示当前的。要查看所有的可以查看。还有很多link最好都可以打开新的tab，
> 否则很容易丢失自己从哪里打开的，比如edit component，check views check pages等等

> workflow只针对可查找的workflow进度，为了页面干净，可以显示当前的deployment进度，至于以往的log可以又专门的地方查看，
> 比如查看所有deployment history（添加分页和查找 和filter等功能）

**Read as:** each type's built-in template is a file of the website (`src/cms/views/<type>.tsx`) and a CMS file (kind
`code`): its state, versions and workflow like any file; viewed, downloaded, and replaced by an upload of the same file
(taken by the uploader when nobody has it; 超级管理员 alone, since it is code every visitor runs), checked by the
website's rules. Preview is built on the branch `cms-preview` (main with a commit per file at 预览站), production gets
the files with `content/site.json` on GitHub's main, linted and built first. The built-in layouts stay code (a few
shared lines of `render.tsx`, not files). The 工作流 page keeps the workflow's progress and the deployment running now;
every deployment and release go to a history page with search, filters and pages; links to editors and lists open new
tabs.

| WP   | What                                                                                                                                                                                                  |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WP30 | The website: `views.tsx` split into `views/<type>.tsx` (+ `parts.tsx`, `index.ts`); `code.ts` `checkViewCode` (imports, globals, properties, elements, raw HTML but where the view needs it)          |
| WP31 | The CMS: kind `code` (migration 5, `code_files`), `saveCode` (checked, laid out by the website's Prettier), the code's latest taken in at start and on its page (`addCodeFiles`)                      |
| WP32 | The branch: `code.ts` (the worktree `.cms-tree`, `codeChanges` with the code's own changes refused, `checkout`, lint); preview on `cms-preview`, production on GitHub's main, rollback leaves code    |
| WP33 | The built-in template's page: its file bar, versions with downloads, the code, 下载, 上传替换 (auto-take, 超级管理员); the explorer shows its state; 禄命秘解's `npm run all` builds on `cms-preview` |
| WP34 | 部署记录 (`/deployments`: search, site, state and step filters, 50 a page; a deployment's own page with its log and files; 所有版本 as its second tab); the 工作流 page's 当前部署; links in new tabs |

## v6.1.0 (medium, after S6): the pages that use a block, Save and Preview at the top, the favicon

**The owner (2026-11-16):**

> Add a new feature, for opened component content of the file, we can trace the origins of the pages that used the
> component. for example, for shared content file, it can be referenced by different pages, so you can create a link
> that triggers a pop up, that popup will list all pages that contains the content file

> also add a fav icon for the cms pages.

> 每个content file的顶部也添加一个 save, 同时再增加一个preview. preview link 点开后可以preview changes。 同时当前更改的
> 页面底部不需要再添加Preview (drafts)。

**Read as:** a link 用在 N 个页面 that opens the list of a block's pages (each place's zone and style, its draft), in the
block's editor, on a shared block's card in the page editor and in 用共用的's table; 保存 and 预览 at the top of the
editors with one form and one Save (blocks, globals; a page saves each move and has 预览 at the top already, a bundle
saves each text), 预览 saving changes first and opening the draft in a new tab, no preview frame in the block's editor;
an icon of the CMS's own.

| WP   | What                                                                                                                                      |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| WP35 | `pageUses` (present.ts), `UsedOn` (components/used-on.tsx) in the block's editor, the page editor's cards and 用共用的; Esc over a dialog |
| WP36 | `PreviewButton` (components/preview.tsx); 保存 and 预览 at the top of the block's and the global's editors; the block's frame gone        |
| WP37 | `src/app/icon.svg`: the company's mark (the website's) in the CMS's red, with a pencil; light and dark                                    |

## S7 Workflow jobs (big: CMS v7.0.0)

**The owner (2026-11-16)**, with a screenshot of Bell's Workflow Job Manager (its steps Work in Progress, Deploy to
Preview1, Deploy to Preview2, Submit for Approval, Approve, Publish, Scheduled, Completed, with Bypass Preview1/2,
Reject, Return to Work in Progress, Terminate Workflow, Cancel Scheduled Job; a list of My Publishing Jobs with their
Salesforce ID, job name, status, lock, creator, approver and date; a job's files grouped by category and entity type
with path, preview date, modifier and file status; Remove selected from Job, Split selected items to a new Job, Export
Job, Email Workflow):

> 这是一个workflow manager的案例，我们需要可以知道自己有哪些文件可以添加到workflow里去，workflow可以有多个，比如案例中有
> 三个，但是每个添加的file不同，或许是做的同一个ticket的先后顺序还是别的情况，workflow必须实例化，可以把自己checkoutfile都
> 新建不同的workflow ticket去deploy

**Read as:** a workflow is an instance (a job): a ticket, a name, its own files, its own step. Your checked-out files
not yet in a job are listed as the ones you can add; you make a job from some of them (or add them to a job of yours
still in progress), and each job moves on its own: to the previews, to production, done. Several jobs may share a
ticket (batch 1, 2, 3). A file is in one job at a time. Today's single workflow (已签入 → 预览站 → 正式站, check-ins with
a message) becomes these jobs; its check-ins map onto them.

**The owner's answers (2026-11-16):** approval (「要不要"提交审批 → 批准 / 退回"这一步？…让网站编辑提交、管理员批准后发布」)
「可以」; a time for production 「可以设置也可以跳过」; the ticket 「可以不填」; mail 「不要 只需要相关人员登陆时右上角有一个小铃铛的
notification 提醒用户workflow approve」. Then, while it was built:

> notification bell需要提醒用户有多少个notifications。

> 还有个功能需要完成，当checkout file需要添加workflow的时候，可以增加这样的功能，可以添加到已有的workflow也可以添加到别人的
> workflow里，默认是自己已有的，也可以新建workflow. 第三个tab是添加到其他人的workflow。 (with Bell's Publish dialog: Selected
> Contents, then the tabs My Workflows, Create New Workflow, Add to Workflow)

> 还可以通过选择不同的file新建新的 workflow 也可以移除workflow。 (with Bell's Split selected items to a new Job: the job's
> files with those moving in bold; Remove selected from Job)

**Built as:** the steps 进行中 → 预览站 → 待审批 → 已批准 (→ 已定时) → 已完成, and 已终止. The job's author or 管理员 and up
move it; 管理员 and up alone approve, send back (with why) and publish, now or at a time; the CMS publishes a job whose
time has come (start.ts asks /api/internal/tick each minute). No mail: a bell with a count. One preview site still: a
job at 预览站 or later keeps its files there (Bell's two previews are our CMS preview and 预览站; no bypass). The file
steps of workflow.ts stay underneath, a job's step running with its files' move (`also`).

| WP   | What                                                                                                                                                       |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WP38 | Migration 7: jobs, job_files (what a job held, kept), job_events (its history), seen (the bell); deployments.job_id; today's check-ins become jobs         |
| WP39 | `jobs.ts`: create, add (to anyone's job at 进行中), remove (at 进行中, or at 预览站 by a preview build), split, terminate; a page's new part joins its job |
| WP40 | Steps: preview, back, submit, approve, reject, publish now or at a time, cancel the time, the scheduler (`runDue`); a failed build is an event             |
| WP41 | The 工作流 page as a job manager (the job's step bar and buttons, the list with filters and pages, files by category, history, export); 我的文件's jobs    |
| WP42 | 加入工作流's dialog (selected contents; 我的任务 / 新建任务 / 加到其他人的任务), the split dialog, the bell with its count                                 |

## Status

| WP   | Status                                       | Version                |
| ---- | -------------------------------------------- | ---------------------- |
| WP1  | done                                         | v1.0.0                 |
| WP2  | done                                         | v1.0.0                 |
| WP3  | done                                         | website v2.0.0         |
| WP4  | done (French to be read by a French speaker) | website v2.0.0         |
| WP5  | done                                         | v1.0.0, website v2.0.0 |
| WP6  | done                                         | v1.0.0                 |
| WP7  | done                                         | v1.0.0, website v2.0.0 |
| WP8  | done                                         | v1.0.0                 |
| WP9  | done                                         | v1.0.0                 |
| WP10 | done                                         | v1.0.0, website v2.0.0 |
| WP11 | done                                         | v2.0.0                 |
| WP12 | done                                         | v2.0.0                 |
| WP13 | done                                         | v2.0.0                 |
| WP14 | done                                         | v2.0.0                 |
| WP15 | done                                         | v2.0.0, website v2.0.1 |
| WP16 | done                                         | website v2.1.0         |
| WP17 | done                                         | v3.0.0                 |
| WP18 | done                                         | v3.0.0                 |
| WP19 | done                                         | v3.0.0                 |
| WP20 | done                                         | v3.0.0, website v2.1.0 |
| WP21 | done                                         | website v2.2.0         |
| WP22 | done                                         | v4.0.0                 |
| WP23 | done                                         | v4.0.0                 |
| WP24 | done                                         | v4.0.0                 |
| WP25 | done                                         | v4.0.0, website v2.2.0 |
| WP26 | done                                         | website v2.3.0         |
| WP27 | done                                         | v5.0.0                 |
| WP28 | done                                         | v5.0.0                 |
| WP29 | done                                         | v5.0.0, website v2.3.0 |
| WP30 | done                                         | website v2.4.0         |
| WP31 | done                                         | v6.0.0                 |
| WP32 | done                                         | v6.0.0, website v2.4.0 |
| WP33 | done                                         | v6.0.0                 |
| WP34 | done                                         | v6.0.0                 |
| WP35 | done                                         | v6.1.0                 |
| WP36 | done                                         | v6.1.0                 |
| WP37 | done                                         | v6.1.0                 |
| WP38 | done                                         | v7.0.0                 |
| WP39 | done                                         | v7.0.0                 |
| WP40 | done                                         | v7.0.0                 |
| WP41 | done                                         | v7.0.0                 |
| WP42 | done                                         | v7.0.0                 |

## 阶段总结 S7 (v7.0.0, 2026-11-16)

1. **Delivered** (all in v7.0.0): WP38 migration 7 and the carrying over (`job-migration.ts`: one job per check-in and
   step; the owner's two check-ins became #1 webfl5019 and #2 webfl1234 at 预览站); WP39–WP40 `jobs.ts` on top of
   workflow.ts (whose deploying steps take `also`, `terminate` returns what it gave back, `giveBack` is its own,
   `withTheirParts` is shared); WP41 the job manager (`workflow/jobs.tsx`, `job-table.tsx`), 我的文件's jobs, the export
   (`/api/jobs/[id]/export`); WP42 the dialog (`job-form.tsx` through `jobModal`), the split view, the bell
   (`bell.tsx`, `bellView`), the tick (`/api/internal/tick`).
2. **Numbers:** 59 tests (9 new in tests/jobs.test.ts); harness PASS; a browser walk on a copy of the CMS with its own
   database and its own clone of the website pushing to a local bare repository (two real builds: preview and
   production).
3. **Against the plan:** approval, a time and a bell as the owner answered; adding to someone else's job and removing
   at 预览站 came in while it was built (the owner's two messages with Bell's dialogs). Bell's Bypass Preview and Email
   Workflow are left out (one preview site; no mail). The old file-by-file workflow actions are gone: production is
   reached through an approved job alone.
4. **Mistakes:** 15 (Esc over a dialog, from v6.1.0, used again here), 16 (walks on a copy), 17 (a copy's website needs
   its own node_modules: Turbopack doesn't follow a junction out of its root).
5. **Next:** the owner's review of the job manager; a French speaker reads /fr/.

## 阶段总结 S6 (v6.0.0, 2026-11-16)

1. **Delivered:** WP30 the website's views one file each and `checkViewCode` (website v2.4.0). WP31 kind `code`
   (migration 5), `saveCode` (checked, laid out by the website's Prettier), `addCodeFiles` at start and on the page.
   WP32 `src/lib/code.ts`: the worktree `.cms-tree`, `codeChanges` (the code's own change refuses a workflow file; a
   text the CMS had is main behind it), preview on `cms-preview`, production with code linted and built before one
   commit on GitHub's main, rollback leaves code. WP33 the built-in template's page (file bar, versions with downloads,
   the code, 下载, 上传替换 with auto-take, 超级管理员 only), the explorer's state, 禄命秘解's `npm run all` on
   `cms-preview`. WP34 部署记录 (search, filters, pages, a page per deployment, 所有版本 there), the 工作流 page's
   当前部署, `NEW_TAB` on 16 links.
2. **Numbers:** CMS 48 unit tests (44 before; 4 for code files against a bare repository); website 40 (36 before); a
   browser walk: a bad and a wrongly named upload refused, a good one taken and laid out, checked in (the CMS preview
   showed it), pushed to preview on `cms-preview` (5 files of preview's build carried it), found by search, its log in
   a new tab, then 退回签入, 终止 and 丢弃 back to main's code; production untouched.
3. **Against the plan:** the built-in layouts stay code (a few shared lines of render.tsx); the checkout lives inside
   the website (git-ignored) so the website's node_modules serve it, with Turbopack's root named (`CMS_TURBOPACK_ROOT`)
   rather than a second `npm ci`; the owner's two mid-way requests (deployment history, new tabs) joined the stage as
   WP34, with 所有版本 moved to the history too, since the 工作流 page keeps progress alone.
4. **Mistakes:** CMS 13 (vitest from a lower-case `c:\` loads twice), 14 (Windows PowerShell drops `--`, so `npm start
-- --build` started the old build); website 33 (a folder another tool writes inside the repository goes into every
   ignore list). The walk's first check of preview's build used grep, which node couldn't find: a check that can fail
   silently proves nothing, so it now reads the files itself.
5. **Next:** website v2.1.0–v2.4.0 on GitHub (the owner's push) before a built-in template can reach production (the
   CMS refuses with `errors.codeMissing` until then); Cloudflare's branch previews stay off for `cms-preview`, which
   lives on this PC alone.

## 阶段总结 S5 (v5.0.0, 2026-11-16)

1. **Delivered:** WP26 rows on the website (`Block.row`, `rowsOf`, `isRowKey`; `Stacked` draws a row of several as a
   `SimpleGrid`, 1 / 2 / up to 4 columns; blocks keyed by index), website v2.3.0. WP27 `Placement.row` (checked by
   `check.badRow`, assembled, seeded) and `src/lib/rows.ts`, the one place rows change, used by the editor and by
   `placeBlockAction`. WP28 the editor: 新的一行, row bars, components side by side, moves at once (`useOptimistic`).
   WP29 the WebPage's `RowId`; the checks below.
2. **Numbers:** CMS 44 unit tests (39 before); website 36 (35 before); a browser walk on the real database.
3. **Against the plan:** no migration (a row key is optional, so every saved page reads as before); empty rows live in
   the editor until filled rather than in the page; a drop on a component's right half places after it (the walk found
   a notice dropped "into the row" landing before the image it was dropped on).
4. **Mistakes:** 11 (a drag's payload in a ref read by helper-built handlers fails the compiler's refs rule: carry it
   in dataTransfer); 12 (a walk's drag measured during a refresh lands on what moved: let a save settle first).
5. **Next:** the owner's look at rows; website v2.1.0–v2.3.0 must be on GitHub before a page with a CMS template,
   layout, style or a row of several is pushed to production (the old site stacks a row's blocks one under another).

## 阶段总结 S4 (v4.0.0, 2026-11-16)

1. **Delivered:** WP21 the website's layouts (`src/cms/layouts.ts`: the four built-ins with their zones and a default
   breadcrumb, `layoutOf`, `defaultZone`, `zonesOfMarkup`, `crumbsOf`; the markup's layout-only `Zone`; `PageView` by
   layout and zone, a CMS layout through `TemplateView`; the breadcrumb, `sitemap: false`, `?layout=` on cms-preview;
   every page at the container's width), website v2.2.0. WP22 migration 4: `layouts`, a page's layout, breadcrumb and
   sitemap, placements `{id, zone, style?}` (`src/lib/pages.ts`), S3's block templates moved to their placements in
   every page and page revision; the release's checks per placement. WP23 the page editor (Bell's: the palette dragged
   into a zone, rows dragged or moved by arrows, the place dialog's Use Shared / Create New / Copy From Existing, the
   style browser with uses and pages, Metadata), the layout editor with its zones and preview, the built-in layouts'
   pages, Views/Page layouts in the tree; a page takes its new blocks, styles and layout along at every step. WP24 the
   WebPage download and upload (MetaData, PageLayout, Components by path, zone, index and style; the old form read).
   WP25 the checks below.
2. **Numbers:** CMS 39 unit tests (33 before); website 35 (31 before); every route in both languages; a browser walk
   with drag and drop on the real database after migration 4.
3. **Against the plan:** the owner's page-editor screenshots came during the stage; WP23 became Bell's editor by drag and
   drop instead of a list per zone. The walk found the breadcrumb's home link named by the home page's SEO title (now the
   menu's word) and the cookie banner covering the editors' preview frames (hidden in a frame on cms-preview only).
4. **Mistakes:** 10 (a Playwright wait on a Mantine Modal's testid never sees it: wait for a control inside it).
5. **Next:** the owner's look at the page editor; website v2.1.0 and v2.2.0 must be on GitHub before a page with a CMS
   layout or a style is pushed to production (without them production ignores layouts and zones and draws every block in
   its built-in view, one under another); picture upload into the CMS (later).

## 阶段总结 S3 (v3.0.0, 2026-11-16)

1. **Delivered:** WP16 the website's template markup (`src/cms/template.ts`: parse, check, values, a starter per type;
   `template-view.tsx` draws it with the site's components; `block.template`, `content.templates`; one block alone on
   cms-preview for the editors' preview), website v2.1.0. WP17 templates as files (migration 3; `createTemplate`,
   `saveTemplate`, `deleteTemplate`, `templateProblems`): the template editor (markup, every problem by line in the
   reader's language, the type's fields, the syntax, the 30 elements, a live preview by block and language), each
   type's built-in template page, the block's template picker; a block takes its new template along at every step
   (check-in, preview, back to check-in, terminate, production); a release refuses a block without its template.
   WP18 resource bundles: 12 files for 268 texts, merged by migration 3 with production's versions and every release's
   manifest (production can still roll back to release 1); the bundle editor; the code's new texts, upload and download
   by bundle. WP19 the explorer replacing the central page: the fixed tree with counts and the files someone holds, each
   folder's files with state, about, modified, by and version history, filters, sort, pages, the steps on ticked files,
   new page / block / template, the matched path between a type's content and its styles; the overview of who is doing
   what. WP20 the checks below.
2. **Numbers:** CMS 33 unit tests (27 before); website 31 (20 before); every route in both languages and at a phone's
   width; a browser walk on real preview builds (releases 10 and 11).
3. **Against the plan:** the problems of a template are `markup.*` messages, not `template.*` (a UI key had the same
   name); a page's new parts now also go back with it and terminate with it (the walk found a block's template left on
   preview after 退回签入); `canonical` moved to `json.ts` so migration 3 can use it; MIGRATIONS take a step function.
4. **Mistakes:** 9 (Get-Content | Set-Content garbled a UTF-8 file; never round-trip a source file through them). The
   CMS's MISTAKES.md now has the Rules list show-rules reads (it loaded none before).
5. **Next:** the owner's look at the explorer; website v2.1.0 must be on GitHub before a block with a template is pushed
   to production (without it production shows the block's built-in view); picture upload into the CMS (later).

## 阶段总结 S2 (v2.0.0, 2026-11-15)

1. **Delivered:** WP11 file states (migration 2, `files.ts`; every save checked; take, take over, put back; new files
   their maker's; uploads take what nobody has and refuse the rest). WP12 the steps (`workflow.ts`): check-in of your
   files, terminate (W1), push to preview, back to check-in (W2), push to production of the files picked alone, each
   moving its files only once its build succeeded; a page's new blocks go along. WP13 versions: each file's check-ins
   with production's and the workflow's marked and the releases it was published in; restore as a draft; production
   back to a release it showed (its manifest), preview rebuilt after. WP14 我的文件, 工作流 (replacing 签入 and 发布),
   the state on the central page, the blocks list, the texts table (batch take, check-in, put back) and each editor (a
   bar with the steps; fields read-only unless yours). WP15 the CMS in English and Chinese (next-intl, a switch, server
   messages and logs by key, the catalog's English); the website's CMS bar in the page's language (website v2.0.1).
2. **Numbers:** 27 unit tests (16 before); every route opened in both languages; a browser walk on real preview builds.
3. **Against the plan:** releases, environments and deployments moved to `releases.ts` so the steps can call the
   deployer without a cycle; preview always rebuilds as production plus 预览站 (no more "deploy an old release to
   preview"); production's rollback needs a release with a manifest, so the v1 releases can't be rolled back to (the
   local database was seeded again anyway).
4. **Mistakes:** 7 (an unanchored .gitignore folder hid src/app/deploy: anchor output folders), 8 (stopping npm start
   left the servers on 8790/8791: check the ports).
5. **Next:** the owner's 推到正式站 of the 繁體 fix (now through 工作流's 预览站 column); a French reader; picture upload
   into the CMS (left for later).

**Left for later:** pictures uploaded into the CMS (now an image is a path under the site or a full address); a live
check that a freeform's script runs on the production build; legal documents in French (D5 decided 简体, 繁體 and
English; Quebec is counsel's question).

## Prepared by the owner (C1–C4 decided; the rest when the work is ready to be seen)

1. The tunnel: two public hostnames on the existing tunnel: `cms-preview.cameyware.com` → `http://127.0.0.1:8791`,
   `cms-edit.cameyware.com` → `http://127.0.0.1:8790`.
2. Cloudflare Access: both hostnames in the application that guards preview.cameyware.com (one application, one sign-in
   for both, so the editor's preview frame opens), with the same e-mail list.
3. The GitHub repository: done (leonfighter1/CameywareWebCMS, 2026-11-15).
4. French: written by the agent; a French speaker should read it before production.
