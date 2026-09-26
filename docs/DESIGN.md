# DESIGN.md

The approved design is `docs/design/preview.html`. This document explains it; if the two ever disagree, **the preview wins**. Renders of it are in `docs/design/screenshots/` (real Playfair Display font). The original inspiration is `docs/design/notifications-reference.png`.

`docs/design/globals.css` is the preview's stylesheet, extracted unchanged (only the font-family now uses `var(--font-playfair)`). Copy it to `src/app/globals.css` and build React components that output the same markup and class names as the preview's render functions. Do not restyle, rename classes, or add a UI library.

---

## 1. Idea: "Index + Stage"

- A narrow **index**: numbered rows, hairline dividers, small muted column labels.
- A large **stage**: an oversized uppercase headline stacked in lines, each line separated by a hairline and staggered left/right, then a cover and a ruled metadata table.
- Tiny text navigation on top, a floating dark **dock** for the page's actions, a floating **tab bar** on mobile.
- Hairlines instead of boxes. No shadows. Radius 0, except pills (dock, tab bar) and dots.
- Cover art is the only imagery. The UI is white, near-black and one orange accent.

## 2. Tokens and type

Light theme only. No dark mode.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#ffffff` | Page background |
| `--text` | `#252422` | Text, strong rules, dock and tab bar background |
| `--accent` | `#eb5e28` | Unread dot, selected-row underline, active nav underline, primary button fill |
| `--muted` | `rgba(37,36,34,.6)` | Labels, dates, secondary text |
| `--rule` | `rgba(37,36,34,.18)` | Hairlines |
| `--placeholder` | `#efeeec` | Empty cover box |
| `--ink` | `#252422` | Text on accent fills |

**Contrast rules:** `#eb5e28` on white is about 3.4:1. Use it only for dots, rules, underlines and fills, never for small text. Text on accent uses `--ink`. State is never colour-only (unread = dot; selected = 2px underline plus weight 500).

**Font:** Playfair Display only, weights 400, 500, 600. Numerals: `lining-nums tabular-nums` (set on `body`).

| Role | Size / weight |
|---|---|
| Stage headline | `clamp(2.4rem, 9cqw, 6.5rem)`, 500, uppercase, tracking -0.02em, line-height .92 |
| Dashboard headline | `clamp(2.4rem, 8.5vw, 7rem)` (same style) |
| Page title | `clamp(2.4rem, 6vw, 3.5rem)`, 500 |
| Section title | 1.5rem, 500 |
| Index row | 15px (16px mobile), 400 |
| Row number | 13px, 500, muted |
| Labels, links, buttons, nav | 12 to 14px, 500 |
| Body | 16px, line-height 1.5 (description 1.65, max 58ch) |

Never go below 12px. Anything under 14px is weight 500.

Spacing: page gutter 24px (16px mobile). Top bar height 44px.

## 3. App shell

**Desktop (>= 1024px)**
- `TopBar`: left "Comic tracker" (600) then links `Dashboard, Library, Notifications, Discover, Settings` with 20px gaps. Active link: 2px accent underline, offset 6px (`aria-current="page"`). Right: local time with short time zone name (`toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', timeZoneName:'short'})`), updated every 30s, muted. Client component. Give the time element `id="clock"` (the visual tests mask it). On mobile the brand is a separate element in the top bar (see `.mobile-brand` in the preview).
- When active followed series need a match, Library displays a small numbered `.attention-badge` beside its desktop link and inside its mobile tab. The badge leads to the filtered Library view; it is absent at zero.
- `main` fills the rest of the height and scrolls (`overflow:auto`). The split layout scrolls its two columns independently.
- `Dock`: fixed pill at the bottom (24px from the bottom, plus safe area).

**Mobile (< 1024px)**
- Top bar: "Comic tracker" left, time right. No links.
- `TabBar`: fixed pill at the bottom, same five labels, active tab has a 2px accent underline; Notifications shows an accent dot when any notification is unread.
- Dock moves up to sit above the tab bar (bottom 80px).
- Toast sits above the tab bar.

## 4. Components and their CSS classes

Markup must match the preview's render functions. Key classes:

| Component | Classes | Notes |
|---|---|---|
| `IndexRow` | `.row`, `.num`, `.t`, `.dot(.on)`, `.sel` | Columns `44px | 1fr | auto`. Link variant is `<a class="row">` |
| Index header | `.idx-head` | Labels "No." and "Notification", 12px muted |
| `Headline` | `.hl` > `.line` | Lines alternate alignment, see section 5.1 |
| `Cover` / `GeneratedCover` | `.cv` | 2:3 ratio, no border or radius, `--placeholder` background |
| `MetaTable` | `dl.meta` > `div` > `dt`, `dd` | Label column 130px |
| `Dock` | `.dock` (+ `.fixed`) | Pill: `--text` background, white text; `.btn.primary` = accent fill with `--ink` text |
| Buttons | `.btn`, `.btn.primary`, `.lnk` (underlined text link button) | Radius 0 outside the dock |
| Library item | `.grid`, `.item(.sel)`, `.cap`, `.chk` | Cover, hairline, title, small meta |
| Strips | `.strip`, `figure`, `figcaption` | Horizontal scroll, 150px items |
| Stats | `.stats`, `.stat` | Four columns (two on mobile) |
| Sections | `.sec`, `.sec header`, `h2` | Strong top rule, title left, link right |
| Discover | `.disc`, `.drow`, `.preview`, `.thumb` | Preview column 240px, sticky |
| Settings | `.srow` | Service, URL, status, Test |
| Page | `.page`, `h1.title`, `.tools`, `.foot` | Max width 1240px |

**Cover fallback.** Real covers come from Komga (owned) or Metron (`cover_url`). When there is no image, render `GeneratedCover`: port the preview's `cover(seed, title, num)` SVG function to a React component. Seed = a stable number derived from the series id. In the seed script, use the `seed` field from `sample-data.json`.

## 5. Pages (exactly as in the preview)

### 5.1 Notifications (`/notifications`, `/notifications/[id]`)
- Left `.index` (340px): filter row with an `Unread only` toggle (`aria-pressed`, underline turns accent when on), `.idx-head`, then one `.row` per notification: `01  Night Signal #14 / 16 Sep 2026` with the unread dot on the right. Selected row: 2px accent bottom border, weight 500. Hover: bottom border becomes `--text` and the text shifts 4px right.
- Right `.stage`: **no selection** shows `Headline` with `<n> unread`, `<n> notifications`, `Since <oldest date without year>` (preview: "Since 26 Aug"), then the newest cover and the sentence "Select a notification on the left to see the issue, its creators and a shortcut to Kapowarr."
- **Selected:** `Headline` lines `<Series>`, `Issue <n>`, `Out <date without year>`; below, a grid of cover (220px) and `MetaTable` (Issue title, Writer, Artist, Publisher, Release date, In your library: `● Owned` / `○ Missing`), then the description, then the `Dock` with `Send to Kapowarr` (primary) and `Mark unread`.
- Use a nested layout: `notifications/layout.tsx` renders the list and the `<section class="stage">`; the list stays mounted between routes and keeps its scroll position. Use `useSelectedLayoutSegment()` in a client shell to set the `has-sel` class on `.split`.
- **Mobile:** `/notifications` shows only the list (rows 56px). `/notifications/[id]` shows only the stage, starting with the `.mbar`: `← Notifications` on the left, `↑` and `↓` links (previous/next notification) on the right. The dock floats above the tab bar.

### 5.2 Dashboard (`/`)
- `Headline` (dashboard size): `<n> new issues` (notifications from the latest release date), `<n> missing`, `<n> books read`.
- Sections, each with a strong top rule, title, and a link on the right:
  1. **Missing issues** (link: "Manage followed series" to `/library`): rows `01  Night Signal #12 / 22 Jul 2026` with a `Send to Kapowarr` link button trailing.
  1a. **Coming up**: a cover strip of the next 30 days' eligible issues, grouped under "Week of <date>" labels. A recent date change has a small "moved" tag. When empty, show "No issues due in the next 30 days."
  2. **Recommended for you** (link "See all" to `/discover`): horizontal strip of 10 items: cover, hairline, title, muted reason, `Follow` link button.
  3. **Something different**: same, with the random set.
  4. **Reading**: four `.stat` items: Books read, In progress, Series completed, Read this month.
- Footer line `.foot`: only in the mock/seeded build ("Sample data for the design preview. Covers are generated placeholders."). Remove it when the app runs on real data (show it only if the DB was seeded with mock data).

### 5.3 Library (`/library`)
- `h1.title` "Library". `.tools`: underline-only search input (placeholder "Search your library"), `Followed only` toggle.
- `.grid` of `.item` buttons: cover, hairline, series title, small line: `● Following` or the publisher. Clicking toggles selection (`aria-pressed`): 3px accent bottom border on the cover and a dark check square top-left.
- When something is selected, a fixed centered `Dock` appears: `Follow <n> series` (primary) and `Clear`. Following clears the selection and shows a toast `Following <n> series`.
- Empty search result: muted sentence "No series match that search."

### 5.4 Discover (`/discover`)
- `h1.title` "Discover". Two sections, `Recommended for you` and `Something different`, each with a `Refresh` link button in the header and 10 `.drow` rows: number, (mobile only) 32px cover thumb, `Title / Publisher` with the reason below in muted 13px, and a `Follow` link button.
- Desktop: hovering a row swaps the sticky right-hand preview cover and shows the title beneath it. Preview hidden on mobile.

### 5.5 Settings (`/settings`)
- `h1.title` "Settings"; section "Connections"; one `.srow` per service: name, URL (muted), `● Connected`, `Test` link button. Test shows `Testing…` then the result. The live version also shows `○ Not reachable` with the error on failure.

## 6. Responsive rules
- Breakpoint 1024px: below it the split becomes one screen at a time, top links move to the tab bar, headlines switch to `clamp(2.4rem, 12.5cqw, 5rem)` with odd lines right-aligned and even lines left-aligned and no indents.
- Below 420px the detail cover is 64% wide.
- Touch targets at least 44px (rows are 56px on mobile).

## 7. Behaviours
- **Opening a notification marks it read** (persist `read_at`; the dot disappears). `Mark unread` sets it unread again; the button then reads `Marked unread` and is disabled, with a toast `Marked unread`.
- **Kapowarr button** (`KapowarrButton`, also the `.lnk` variant on the dashboard) has states: idle `Send to Kapowarr`, busy `Sending…` (disabled), done `Sent to Kapowarr` (disabled, toast `Sent to Kapowarr`). Real failure state: `Failed, retry` (enabled). Disabled with a tooltip when the series is unmatched.
- **Toast**: bottom-left, white, 1px `--text` border, 13px 500, visible about 2.2s, `role="status"`, `aria-live="polite"`.
- **Keyboard:** on `/notifications/[id]`, ArrowDown/ArrowUp go to the next/previous notification (ignore when focus is in an input).
- The index lists also support j/k, ArrowDown/ArrowUp, and Enter for the selected row. Mobile detail views return to the index on Escape. Selected rows reuse `.row.sel` and expose `aria-current="true"`.
- **List scroll** is preserved when the selected notification changes. The stage scrolls to the top on change.
- **Follow** (`Follow` / `Following`) toggles and shows toast `Following <title>` or `Unfollowed <title>`.
- **Reduced motion:** no transitions when `prefers-reduced-motion: reduce` (already in the CSS).
- Nothing animates on page load. Motion only responds to input (row hover, toast).

## 8. Implementation map

```
src/app/layout.tsx                 <html class={playfair.variable}>, TopBar, <main>, TabBar, Toast provider
src/app/page.tsx                   Dashboard
src/app/library/page.tsx           Library (client parts: search, toggle, selection, dock)
src/app/notifications/layout.tsx   .split with index (left) and .stage (right)
src/app/notifications/page.tsx     stage summary
src/app/notifications/[id]/page.tsx stage detail
src/app/discover/page.tsx          Discover (client part: hover preview)
src/app/settings/page.tsx          Settings
src/app/series/[id]/page.tsx       see section 9
src/app/api/health/route.ts
src/components/                    TopBar, TabBar, Toast, IndexRow, Headline, Cover, GeneratedCover,
                                   MetaTable, Dock, KapowarrButton
src/lib/services/                  getNotifications, getNotification, getMissing, getRecommendations,
                                   getReadingStats, getLibrary, getServices (pages use only these)
```

Nav hrefs: `/`, `/library`, `/notifications`, `/discover`, `/settings`. `TopBar` and `TabBar` set `aria-current="page"` from the pathname (`/notifications/3` counts as Notifications).

## 9. Not in the preview (build from the same parts; keep it minimal)

- **Series detail** (`/series/[id]`): same split as notifications. Left index: the series' issues (`No. | Issue | state`), state as `● Owned`, `○ Missing`, or `◐ Upcoming`. Stage: `Headline` with the series title (plus lines `Issue <n>` for the selected issue if useful), cover, `MetaTable` (Publisher, Match, Monitoring), a `Change match` link button opening a side sheet, and a dock with `Send to Kapowarr`. Mobile: index first, stage on tap, like notifications.
- A series issue whose date moved in the last 14 days shows a small "moved" tag; its previous date appears when the row is hovered or focused.
- **Match sheet:** a panel from the right, white, 1px `--text` left border, search underline input, candidates as `.row` items, `Use this match` primary button. No shadow, no backdrop blur; a `rgba(37,36,34,.25)` scrim is fine.
- **Loading:** rows of hairlines with a muted bar in place of text; slow opacity pulse, honouring reduced motion.
- **Empty states:** one large Playfair sentence (headline size, sentence case) and one link, nothing else. Example: "Nothing to follow yet." with `Browse your library`.
- **Errors:** one plain sentence saying what failed and how to fix it, in the same style. Errors don't apologise.
- **First run** (no services configured): full-width `Headline` `Connect / your services / pick some comics`, then a three-row `.row` index linking to Settings, Library, Notifications.

## 10. Visual test mapping (`pnpm test:visual`)

Seed with `pnpm db:seed-mock`. Mask the clock element (`#clock`) in every shot. Compare with `docs/design/screenshots/` at a loose threshold.

| Screenshot | Route | Viewport / action |
|---|---|---|
| desktop-notifications-detail | `/notifications/2` | 1440x900 |
| desktop-notifications-empty | `/notifications` | 1440x900 |
| desktop-dashboard | `/` | 1440x900 |
| desktop-library | `/library` | 1440x900 |
| desktop-library-selected | `/library` | 1440x900, click the 3rd and 5th `.item` |
| desktop-discover | `/discover` | 1440x900, hover row 3 of the first list |
| desktop-settings | `/settings` | 1440x900 |
| mobile-notifications-list | `/notifications` | 390x844, scale 2 |
| mobile-notifications-detail | `/notifications/3` | 390x844, scale 2 |
| mobile-dashboard | `/` | 390x844, scale 2 |
| mobile-discover | `/discover` | 390x844, scale 2 |

Since opening a notification marks it read, reseed (or reset `read_at`) before each shot.

## 11. Copy (use exactly)

Brand: `Comic tracker`. Nav: `Dashboard`, `Library`, `Notifications`, `Discover`, `Settings`. Buttons and links: `Send to Kapowarr`, `Sending…`, `Sent to Kapowarr`, `Mark unread`, `Marked unread`, `Follow`, `Following`, `Follow <n> series`, `Clear`, `Refresh`, `Test`, `Testing…`, `Manage followed series`, `See all`, `Unread only`, `Followed only`. Table labels: `Issue title`, `Writer`, `Artist`, `Publisher`, `Release date`, `In your library`. Section titles: `Missing issues`, `Recommended for you`, `Something different`, `Reading`, `Connections`. Stats: `Books read`, `In progress`, `Series completed`, `Read this month`. Toasts: `Sent to Kapowarr`, `Marked unread`, `Following <title>`, `Unfollowed <title>`, `Following <n> series`, `Recommendations refreshed`.

The same action keeps the same name everywhere (the button says "Send to Kapowarr", so the toast says "Sent to Kapowarr").

## 12. Accessibility
- Visible focus ring: 2px `--text` outline, 2px offset (white on the dark dock and tab bar).
- Full keyboard use of lists, dock and library selection.
- Covers: `role="img"` with `aria-label="<Series> cover"`; the Discover preview is `aria-hidden`.
- Unread dot has `role="img" aria-label="Unread"`; read rows use `aria-hidden`.
- Selected row has `aria-current="true"`; library items use `aria-pressed`.
