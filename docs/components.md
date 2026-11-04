# Relur component specs

Class names are Tailwind v4 utilities backed by the tokens in `src/renderer/src/styles/theme.css` (colors `canvas`, `surface`, `raised`, `selected`, `chrome`, `term`, `band`, `band-strong`, `line`, `line-strong`, `fg`, `fg-muted`, `fg-subtle`, `on-fg`, `focus`, `scrim`, `st-permission`, `st-input`, `st-approval`, `st-error`, `diff-add(-bg)`, `diff-del(-bg)`, `profile` and the six `profile-*`). Shared control classes live in `src/renderer/src/ui/controls.tsx` (`button(variant, size)`, `iconButton`, `inputClass`, `labelClass`, `Kbd`). Sizes are in px (Tailwind step = 4px).

Behaviour is specified in `docs/SPEC.md`, which wins where the two differ; this file covers the visual and interaction details. Sections marked **Superseded** describe designs that were replaced and are kept for reference only.
Shared rules:
- **Hover:** `bg-raised` (or `bg-selected` inside raised surfaces). No movement or shadow change. 120ms `ease-out-quiet`.
- **Focus:** shown only on keyboard focus (`:focus-visible`), as a 2px `outline-focus` with 2px offset. Inputs show a `border-focus` plus a 35% halo instead.
- **Disabled:** 40% opacity, `cursor-default`, no hover, skipped in tab order. Disabled actions in menus stay visible with the reason in a tooltip.
- **Shortcut hints:** `font-mono text-2xs text-fg-subtle`, inside the control, right-aligned. On `bg-fg` buttons they use 70% opacity.
- **Terminal focus:** the terminal owns focus by default. Nothing in this list may steal it except dialogs and an explicit ⌘K. `Esc` from any panel returns focus to the last terminal.

---

## Button

| Variant | Classes | Use |
|---|---|---|
| Primary | `bg-fg text-on-fg font-medium` | One per surface: stage action, Create, Add |
| Secondary | `border border-line-strong text-fg` | Open shell, Browse… |
| Ghost | `text-fg-muted` → hover `bg-raised text-fg` | Header tools |
| Danger | `bg-st-error text-on-fg font-semibold` | Delete anyway |
| Danger-quiet | `text-st-error` (ghost) | "Remove…" entry points |

- **Sizes:** sm `h-6 px-2 text-sm`, md `h-7 px-2.5 text-md` (default), lg `h-7.5 px-3 text-md` (dialogs). Radius `rounded-md`. Icon-only: square, same height, `rounded-sm`.
- **States:** hover (primary/danger: opacity 86–88%; others: `bg-raised`), focus ring, pressed toggle (`bg-selected border-line-strong text-fg`, `aria-pressed`), disabled.
- **Keyboard:** Enter and Space activate. Toggles expose `aria-pressed`. Every icon-only button has a tooltip with its shortcut.


## Icons

`ui/icons.tsx`: 14px line icons drawn in the current text colour (16-unit box, 1.5 stroke, round caps and joins), so they follow both themes and the control's hover colour. Decorative (`aria-hidden`): the control has an `aria-label` and a tooltip with its shortcut. Used for the narrow window's view buttons (Responses, Open in editor, Changes) and the header's Delete workspace….

## Input / path field

- `h-7.5 px-2.5 rounded-md bg-term border border-line-strong`. Paths and branches use `font-mono text-sm`; prose uses `text-base`.
- **States:** focus (`border-focus` + halo), error (`border-st-error` plus a `text-st-error text-sm` message with a ✕ prefix, `aria-invalid`), disabled (`bg-surface border-line text-fg-subtle`), read-only derived value (e.g. branch from id + title, with a `text-sm text-fg-subtle` source note on the right).
- **Path field + Browse…:** Browse opens the native folder picker (⌘B while the field is focused). Typing or picking runs detection after 250ms; results appear in a `bg-surface border-line rounded-lg` panel below (git repo ✓, name, base branch, remote, setup script).
- **Keyboard:** ⌘↵ submits the dialog from any field; Esc cancels.

## Select / dropdown (incl. skill picker)

> The skill picker and its "Not found in .claude/skills/" warning belonged to the lifecycle stage table and are **superseded** (spec §13). Built selects are native `<select>` elements styled with `inputClass`; checkboxes and radios are native inputs.

- Trigger looks like an input with a ▾ on the right.
- Menu: `bg-raised border-line-strong rounded-lg shadow-overlay p-1`, max-height 320 then scroll. Two-line options for skills: `font-mono font-medium` name, `text-sm text-fg-muted` description truncated to one line, ✓ on the selected item. The last option is "None".
- **Warning state:** if the stored value no longer exists (e.g. a skill removed from `.claude/skills/`), the trigger gets `border-st-permission` and a triangle, and the description column says "Not found in .claude/skills/".
- **Keyboard:** Space/Enter/↓ open. ↑↓ move, typing jumps by prefix, Enter picks, Esc closes and keeps the old value, Tab closes and moves on.

## Checkbox, segmented control

- Checkbox 14×14 `rounded-xs`. Checked: `bg-fg text-on-fg` ✓. Unchecked: `border-line-strong`. Space toggles.
- Segmented control: container `p-0.5 bg-surface border-line rounded-lg`. Active segment: `bg-raised` with a 1px `line-strong` ring and `font-medium`. ←→ move, and the selection follows focus.

## Profile tab (window strip)

The pinned Guide tab sits before the first profile tab (see Guide tab).

- 184×33 active / 184×32 inactive (150 below 900px window width); `rounded-t-lg`. Content: 8px `bg-profile-*` dot, name, attention badge, `⌘n` hint.
- **Active:** `bg-canvas border-line border-b-0`, 2px inset top edge in the profile color, merges into the content below. **Inactive:** transparent, `text-fg-muted`. **Hover:** `bg-raised text-fg`.
- **Badge:** count of the profile's workspaces that need permission, wait for input, or await approval (done and error are not counted). 16px pill, `bg-st-permission text-on-fg font-mono text-2xs font-semibold`, hidden at 0.
- **Drag:**
  - Horizontal drag reorders within the strip, with a 2px `bg-focus` insertion line.
  - *(M5, not built: detaching, merging into another window and closing an empty window.)* Dragging more than 24px below the strip detaches the tab: a lifted tab (`shadow-drag`, rotate −1.5°) plus a window-outline ghost follow the cursor. Release opens the profile in a new window at the drop point.
  - Dropping onto another window's strip merges the profile into that window.
  - A window closes when its last profile leaves.
- **Keyboard:** ⌘1–⌘9 select. ⌘⇧[ / ⌘⇧] cycle and "Move profile to new window" arrive with M5; today the context menu has Move Left / Move Right.
- **Window title:** `<Profile> — Relur` for the active profile, no counts.
- **Dock/taskbar badge:** total workspaces needing you across all profiles and windows (permission + input + approval). Cleared at 0. Uses `app.setBadgeCount` on macOS and an overlay icon on Windows. Linux: the launcher entry over D-Bus where the dock shows badges, and the count in front of the window title, `(2) Work — Relur` (spec §5).

## Terminal tab (inside a workspace)

- `h-7.5 px-3 text-md rounded-t-md`. Content: status glyph (Claude, Setup) or `$` (Shell), name, `⌃n` hint, and a close × that is visible on the active tab and on hover.
- **Active:** `bg-term border-line border-b-0` merging into the terminal. **Inactive:** `text-fg-muted`, hover `bg-raised`.
- **Reorder only:** drag is locked to the x-axis inside the strip with a 2px insertion line. Tabs can never leave the workspace and never become windows.
- **Close:** ⌘W or ×. Closing Claude while it runs asks first. Exited tabs show "[process exited · code n]" with "↵ restart · ⌘W close".
- **Keyboard:** ⌃1–⌃9 select, ⌃Tab / ⌃⇧Tab cycle, ⌘⇧[ / ⌘⇧] move the active tab, ⌘T new Shell tab.
- **Strip:** `h-9 bg-surface border-b-line px-2`. After the terminal tabs, when the workspace's status file is found (spec §13.8), a **document tab** with a `¶` mark and the workflow's document label (default the file name), same active/inactive treatment, no close ×, tooltip "<label>: the workflow's status file, read-only". Then the + (24px icon button). On the right, the active tab's actions: on a Claude tab, the ghost **Responses ⇧⌘R** toggle (`aria-pressed`) and, for 1.5s after ⌥C, "Copied the last response" (`text-xs text-fg-muted`).
- **Linked workspaces:** one Claude tab; one "Setup · <repo>" tab per repository that has a setup script, in chip order; Shell tabs are named by their repository (`$ api-service`). The ⌃n hint shows on the active tab only (all hints stay in tooltips) so the longer names fit. + opens a "New shell in…" menu (built as a native menu): one row per repository, `$ <name> — <worktree path>`; ⌘T opens a shell in the primary. Picking a repository that already has a shell opens a second one.

## Status glyph

12×12 box; every state has a distinct shape, so color is never the only signal.

| State | Shape | Token | Row label |
|---|---|---|---|
| Working | 9px ring with a gap, rotating (`animate-glyph-spin`) | `fg-muted` | elapsed, mono |
| Needs permission | Filled triangle | `st-permission` | Permission |
| Waiting for input | 10px hollow ring, 2px | `st-input` | Input |
| Awaiting approval | Filled diamond (the workflow is at a gate and Claude isn't working, spec §13.5) | `st-approval` | the gate's label (e.g. Spec review) |
| Done (unread) | 8px filled dot + bold title until opened | `fg` | Done |
| Exited | 8px hollow square | `fg-subtle` | Exited |
| Error | ✕ glyph, bold | `st-error` | e.g. Setup failed |
| Unfinished (marker, spec §9.7) | Two 2.5×9px bars, 2px apart | `st-input` | Unfinished |

`title` / `aria-label` carry the full state name; Unfinished's title is "Claude didn't finish when Relur closed". Unfinished shows only where the state has no glyph (resumed and idle) or Exited. Reduced motion stops the spin, and the ring stays visible.

## Sidebar

Spec §6.1. Built in `Sidebar.tsx`; which projects are open is kept by `ui/project-disclosure.ts`.

- `w-60` (240px), `bg-canvas border-r-line`; `w-52` (208px) below 900px window width until the rail exists. The 44px rail (⌘\) arrives with M5 and is not built yet.
- **Header:** 40px (`h-10 px-4`): profile dot, name `font-semibold`, "n workspaces" `text-sm text-fg-muted`. There is no profile-level + and no collapse « (spec §6.1: ⌘N uses the shown project).
- **Rows:** `h-7 rounded-md px-2 mx-1.5 gap-2`, colours animate 120ms `ease-out-quiet`.
  - Home row: `~` in mono `fg-muted`, "Home", `⌘0` hint.
  - "PROJECTS" label: `mt-4 mb-1 px-4 text-xs font-medium uppercase tracking-wider text-fg-subtle`.
  - **Project row** (tooltip: the repository path), left to right:
    - Disclosure caret, a 12px-wide button with `▶` / `▼` at 9px `text-fg-muted`, `aria-expanded`, label Expand / Collapse.
    - Name: `font-mono text-sm`, truncated, fills the row. Click opens the project view (no shell starts); right-click opens the native menu **Remove from <profile>…**.
    - **+**: a 20px `iconButton`, `opacity-0`, shown on row hover and keyboard focus within the row (`group-hover`, `group-focus-within`, `focus-visible`). Tooltip "New workspace in <project> (⌘N)". Disabled (40%) while workspaces can't be created.
    - **Urgent glyph** (collapsed projects only): a 20px `iconButton` holding the Status glyph of the most urgent workspace among the project's own and the ones linked into it, in the order Needs permission, Waiting for input, Awaiting approval, Error, Working; between equals the one in that state longest. Done, Exited and no-glyph states never show here. Glyph tooltip "<title> · <state>", `aria-label` "Open <workspace> (<state>)"; click opens that workspace (which also expands the project).
    - **Linked count** `↗ n`: `font-mono text-xs text-fg-subtle`, tooltip "Linked into 1 workspace of another project" / "Linked into n workspaces of other projects". Hidden at 0.
    - **Own count** `n`: `min-w-3 text-right font-mono text-sm text-fg-subtle`, tooltip "n workspaces" ("1 workspace"). Hidden at 0. Linked workspaces never count here.
    - Projects are separated by 6px (`mb-1.5`).
  - **Collapsed by default:** a project is open only when you expanded it with the caret, or when it holds the last workspace you opened in this profile. Opening a workspace by any route (row, urgent glyph, ⌘J, ⌥↑/⌥↓, Home, a notification) expands its project and collapses the one that was open only for the previous workspace; caret-expanded projects stay open. Collapsing the last workspace's project with the caret releases it. Both are remembered across restarts in the window's local storage.
  - **Workspace rows** (open projects only): indented 26px (`pl-[26px]`), tooltip "<name>" then on a second line "<state> · <branch>" (state in words, at a gate "Awaiting approval: <gate label>"). Content:
    - Status glyph (or a 12px blank) and the title (task title, else name), truncated, `font-semibold` while Done is unread. An Unfinished workspace (spec §9.7) shows the Unfinished glyph and the label "Unfinished" in `st-input`; its tooltip's second line is "Claude didn't finish when Relur closed · <branch>".
    - Linked chip `+n` (below), when the workspace spans other repositories.
    - On the right, one of: while Working with background tasks (spec §10.2), "n in background" (`max-w-24 truncate text-xs text-fg-subtle`); the elapsed time while Working (`font-mono text-xs text-fg-subtle`); while Done with commands still running, "n running" (same style, "Done · n running" while unread); the state label (`max-w-24 truncate text-xs font-medium`, coloured `st-permission` / `st-input` / `st-approval` / `st-error`, else `fg`), where Awaiting approval shows the gate's own workflow label; with no state to show, the workflow status label in `text-xs text-fg-muted`.
    - Right-click: native menu **Open in editor** · **Reveal in Finder** (**Show in folder** elsewhere) · **Copy path** · **Copy branch name** · **Delete workspace…**.
  - **Linked chip:** `+n` after the title (`font-mono text-2xs`, `border border-line-strong rounded-xs px-1`, `text-fg-muted`); tooltip "Also in <projects>".
  - **Linked group:** after a project's own workspaces, when other projects' workspaces are linked into it: a `text-fg-subtle` row with the caret (`9px`, `fg-muted`) at the workspace glyphs' 26px indent, "↗ Linked" (`text-sm`) and the count (`font-mono text-xs`). Collapsed by default, remembered per project; collapsed, it carries the most urgent status glyph of its workspaces (as a collapsed project row). Only the linked rows below go in it.
  - **Linked rows:** inside the Linked group, when it's expanded, the workspace appears again as a muted 46px-indented row, all `text-fg-subtle`: a 12px `↗`, the task id in `font-mono text-sm` (title when there's no id), "· in <main project>". No glyph, count or status label. Tooltip "<name> · in <main project>". Hover `bg-raised`; while that workspace is open the row gets `bg-band-strong` (the main row keeps `bg-selected`). Click opens the same workspace and expands its main project.
  - **No projects:** "No projects yet. Add a git repository to start." in a dashed box (`mx-3.5 rounded-md border-dashed border-line-strong px-3 py-2.5 text-sm text-fg-muted`).
  - "Add project ⌘O" pinned at the bottom above a `border-t-line`, `+` in `fg-muted`.
- **Selected:** `bg-selected text-fg font-medium` (`aria-current`). Hover: `bg-raised`. Tooltips are the native `title`.
- **Rail (M5, not built):** Home, then per project its initials and one glyph button per workspace (same selected and hover rules, tooltip = id, title, state), then + and » at the bottom.
- **Keyboard:** one Tab stop with a roving tabindex (`data-nav-key` on Home, project rows, workspace and linked rows): ↑↓ move, Home/End first and last, → expands or enters a project, ← collapses it or goes from a row to its project, Enter/Space activate. Tab from a project row reaches its + (shown on focus) and urgent glyph; the caret has `tabIndex=-1`. ⌥↑ / ⌥↓ switch workspaces from anywhere; ⌘J jumps to the next workspace that needs you.

## Workspace header

Spec §6.2, §13.5, §21.4. `header` in `WorkspaceView.tsx`: `bg-surface px-4 pt-3 pb-2.5`, followed by a 1px separator (`hr`, `h-px bg-line`) above the tab bar: the workspace's identity above, its views below. Rows top to bottom:

- **Title row** (`gap-2.5`):
  - Task id chip `font-mono text-sm bg-raised border-line rounded-sm px-1.5` (only with an id), then the title `text-lg font-semibold`, truncated.
  - **Delete workspace…**: a 24px `iconButton` with the trash icon right after the title, quiet (`text-fg-subtle`, `fg` on hover), tooltip "Delete workspace…"; it opens the delete confirmation.
  - **⋯** (24px `iconButton`) at the right: the workspace menu.
- **Repository chips** (linked workspaces only, `mt-2`): see Repository chips.
- **Branch row** (`mt-1.5 font-mono text-sm text-fg-muted`, selectable): `branch ← base` (the arrow `fg-subtle`; dropped in a linked workspace, the primary chip has it), `ports a–b` in `fg-subtle` (tooltip: $PORT is the first), and in a single-repository workspace its PR badge.
- **Workflow row** (`mt-2 gap-3`, only when a workflow applies): the stepper, then the workflow actions. See Workflow stepper.
- **Skills changed** (when the profile's skill sources changed since Claude started): "Skills changed since Claude started." `text-sm text-fg-muted` and a secondary sm **Restart Claude**.
- **View buttons** (`data-view-buttons`, the tab bar's right side, `gap-1`): **Responses ⇧⌘R** on a Claude tab (see Responses panel), **Open in editor ⌘E** (ghost sm with its hint; tooltip "Open [<primary>] in its editor (⌘E)"; in a linked workspace followed by a narrow ▾ `iconButton`, tooltip "Open all repositories in their editors", whose native menu has **Open all…**; see Open in editor) and **Changes ⇧⌘D** (ghost sm toggle, `aria-pressed`, the file count across repositories in `font-mono text-xs text-fg-subtle`). Below 900px window width each is a 24px `iconButton` with its icon (Responses: speech bubble, Open in editor: arrow out of a square, Changes: ± with the count beside it), named in its tooltip with the shortcut and in `aria-label`.
- **Bars under the tab strip** (each `bg-surface border-b-line px-4 py-2 text-md`): Unfinished (spec §9.7: "Claude didn't finish when Relur closed: it was working." in `fg-muted`, or "…: 1 background command was stopped." for stopped commands, secondary sm **Continue**, absent for a permission and disabled with the reason as its tooltip at the plan limit, and ghost sm **Dismiss**), merged ("<branch> is merged into <base>. Delete workspace?" with secondary sm **Delete…**), setup failed (see Linked repositories), "Running setup. Claude starts when it finishes.", or "Claude isn't running in this workspace." with secondary sm **Start Claude** (and "↵ restart · ⌘W close" on a Claude tab).
- **Workspace menu (⋯)**, native: **Link another repository…** (disabled with the reason in the label: "(every project is in)" or "(<profile> has no other projects)") · **Unlink <repo>…** for each linked repository · **Delete workspace…**. The primary can't be unlinked.

## Repository chips

Spec §21.4. `RepoChips.tsx`. One line (`mt-2 flex gap-1.5`), measured: a ResizeObserver on the row recomputes, from hidden copies of every chip, how many linked chips fit.

- **Primary chip** (not a button, text selectable): `h-6 px-2 gap-1.5 rounded-md border border-line bg-canvas font-mono text-sm`. Name `font-medium text-fg`; the "primary" tag (`text-2xs bg-raised border-line-strong rounded-xs`, tooltip "Claude starts here"); `branch ← base` in `text-fg-muted` (arrow `fg-subtle`, base is the primary's own); `↑n` unpushed in `fg-muted` when > 0; "✕ setup failed" in `st-error`. Native tooltip: the worktree path.
- **Linked chip** (a button, `aria-haspopup="menu"`): same frame, name only (`font-medium text-fg`) plus marks:
  - `✕` `st-error` when its setup failed, else a pulsing `◌` (`animate-pulse text-fg-muted`) while its Setup session runs;
  - `PR` in `text-xs`, coloured by state: open/draft `diff-add`, merged and likely merged `st-approval`, closed `fg-subtle`.
  - Hover and focus-visible: `border-line-strong` (no outline).
- **Tooltip** (hover or keyboard focus, `role="tooltip"`, linked via `aria-describedby`): below-left of the chip, `bg-raised border-line-strong rounded-md shadow-overlay px-2.5 py-1.5 font-mono text-xs leading-5`, max 480px. Four lines: `branch ← base · ↑n`; the worktree path (`fg-muted`, truncated); the setup state ("Setup running", "Setup failed (<reason>)" in `st-error`, or "Setup passed or not needed"); the PR ("PR open · <url>", or "No PR known").
- **Menu** (click, ↵ or Space; native): Open in editor · New shell in <repo> · Reveal in Finder (Show in folder elsewhere) · Show in Changes (opens the panel at that repository's section) · Unlink <repo>….
- **Overflow:** chips that don't fit go into a dashed **+n more** button (`h-6 px-2 rounded-md border-dashed border-line text-sm text-fg-muted`, hover `text-fg`), with a `✕` in `st-error` when one of them failed; tooltip lists their names. Its native menu lists them as "<name> · ✕ setup failed / setup running · <PR state>"; picking one opens that chip's menu.
- A workspace with one repository has no chips.

## Workflow stepper

Spec §13.4–§13.5. `WorkflowStepper` and `WorkflowActions` in `WorkflowViews.tsx`. Replaces the lifecycle stepper (below).

- **Steps** (`ol`, `gap-1 text-sm whitespace-nowrap`), every status of the workflow in order, separated by `›` in `fg-subtle`:
  - Finished: `✓ Label` in `text-fg-subtle`.
  - Upcoming: `Label` in `text-fg-subtle`.
  - Current: a pill `rounded-sm border border-line-strong bg-raised px-1.5 font-semibold text-fg`.
  - Gates: a `◆` in `st-approval` before the label (tooltip "A gate: the skill waits for you here"), in every form, so you see where Claude will stop.
  - Each step's tooltip: its label, plus " · gate, waits for you" on gates. The whole stepper's tooltip is the status file's path.
- **Fit, by width, not by count:** the stepper fills the space left of the actions (`min-w-0 flex-1 overflow-hidden`). Hidden copies of the full and compact forms are measured on every resize, and the widest form that fits is shown (`data-stepper-fit`):
  1. **Full:** every status named.
  2. **Compact:** finished statuses become `✓`, upcoming ones their number (`2`, `3` …), gates keep their `◆`; the current one keeps its name. Full names stay in the tooltips.
  3. **Pill:** one pill (same classes as the current step) reading `3/7 ◆ Label` (the ◆ only at a gate).
- **No status:** instead of the stepper, the reason in `text-sm text-fg-subtle` ("No status file for <branch> yet", "n files match <branch>"), tooltip the file. A status not in the list: "Status “x” isn't in the workflow's list" in `text-sm text-st-permission`.
- **Actions** (after the stepper, `gap-2`, can shrink):
  - The current status's hint, `text-sm text-fg-muted`, truncated (full text in the tooltip).
  - At a gate with a status file: secondary sm **Review** (opens the document tab).
  - At a gate with an answer button: its label, **primary** sm while Awaiting approval, else secondary; enabled only while Claude runs and is idle. Tooltip: "Types into Claude: <prompt>", or why it's disabled ("Claude is busy; answer when it stops" / "Claude isn't running; start it first").
  - At a step, only while Claude runs and is idle: secondary sm **Continue ⌘⇧↵**, tooltip "Type the Continue prompt into Claude (⌘⇧↵)". Hidden otherwise.
  - At a final status: nothing. An error from Continue or an answer: "✕ <message>" in `text-sm text-st-error`.
- **Keyboard:** ⌘⇧↵ sends Continue at a step; at a gate it sends nothing and puts the Claude terminal in focus, for the answer.

## Open in editor

Spec §6.13. `EditorPicker.tsx` (`EditorPicker`, `ChooseEditorDialog`, `OpenAllDialog`, `useOpenInEditor`).

- **Entry points:** the tab bar's ghost sm **Open in editor ⌘E** (a view button, see Workspace header) (the primary worktree) and, in a linked workspace, the ▾ icon button next to it with a native menu holding **Open all…**; each linked repository chip's menu; the project view's secondary lg **Open in editor ⌘E** (main checkout); the Changes panel (a file row's **Open** and the diff header's ghost **Open in editor**, below); the spec view's **Open in editor**. ⌘E opens the primary worktree from anywhere in the workspace view, except while a dialog is open.
- **Editor setting** (`EditorPicker`): a native select (`inputClass`) of the editors found on this machine (one chosen earlier but not found stays listed with " (not found)"), "Custom command…", and a first "none" option ("Not set: the first Open in editor asks" in Edit profile; "Use the profile's editor (<name>)" in the project's Setup tab). With none found: "None of VS Code, Cursor, IntelliJ IDEA, WebStorm or Zed was found; use a custom command." (`text-sm text-fg-subtle`). Custom shows two mono inputs: "Open a folder · {path}" (placeholder `code {path}`) and "Open a file at a line · {file} {line} · optional", with the note that without it a file opens as its folder. The project's picker saves on change (custom commands 700ms after typing stops) and shows "Saved".
- **Choose an editor** (first use, 500px dialog): one explanatory line, the picker preselecting the first editor found, "Only for <project>" checkbox (unticked saves to the profile), Cancel and primary **Save and open**. Errors under the picker in `st-error`.
- **Open all…** (500px dialog "Open all in editors"): one checkbox row per repository (name mono, then its editor in `text-sm text-fg-subtle`, or "no editor set: choose one in Edit profile › General" with the box disabled); all with an editor ticked. Below: "n windows: repositories on VS Code or Cursor share one." (`text-sm text-fg-subtle`), or "Nothing ticked." Primary **Open** (disabled with nothing ticked). Above 3 windows the first Open turns the line into "Open n editor windows?" in `text-md text-st-permission`, the buttons into **Back** and **Open n windows**. ⌘↵ submits, Esc cancels.
- **Failures** show in the window's notice bar, worded as in spec §6.13.

## Lifecycle stepper (superseded)

> **Superseded** by the workflow from a status file (spec §13.4–§13.5): see Workspace header, Workflow stepper and Open in editor above. Kept for reference.

- **Row 1:** task id chip (`font-mono text-sm bg-raised border-line rounded-sm`), title `text-lg font-semibold`, then Open in editor (ghost, ⌘E; in a linked workspace followed by a ▾ icon button with "Open all…", which opens a checklist dialog of repositories with their editors and "Open n editor windows?" above 3), Changes toggle (⌘⇧D, shows the file count across repositories) and ⋯ (workspace menu).
- **Row 2:** `branch ← base` in mono, ahead/behind, then the stepper and the stage action (primary, ⌘⇧↵).
- **Linked workspaces** get a repository row between rows 1 and 2, and row 2 drops its `branch ← base`. One chip per repository, primary first: `h-6 px-2 rounded-md border-line bg-canvas font-mono text-sm`, name (`font-medium text-fg`), a "primary" tag on the first (`text-2xs bg-raised border-line-strong rounded-xs`, tooltip "Claude starts here"), `branch ← base` (`text-fg-muted`, base is that repository's own), `↑n`, and "✕ setup failed" in `st-error` when its setup failed. Tooltip: the worktree path. Only the primary chip is in full (the branch is the same everywhere); linked repositories get name-only chips (the same frame, focusable buttons) with marks: `✕` in `st-error` (setup failed), a pulsing `◌` (setup running), `PR` in `text-xs` coloured by state (open/draft `diff-add`, merged `st-approval`, closed `fg-subtle`). One line: what doesn't fit goes into a dashed `+n more` chip (`border-dashed text-fg-muted`, `✕` when one of them failed) that opens a menu of them. Hover/focus tooltip (`bg-raised border-line-strong shadow-overlay font-mono text-xs`): `branch ← base · ↑n`, worktree path, setup state, PR. Click/↵: native menu Open in editor, New shell in <repo>, Reveal in Finder, Show in Changes, Unlink <repo>…. Changes panel file rows show a small "Open" button (`border-line-strong bg-raised text-xs`) on hover/focus; the diff header has a ghost "Open in editor".
- **Workspace menu (⋯):** Link another repository… (disabled with the reason when every project of the profile is already in) · Unlink <repo>… for each non-primary repository · divider · danger Delete workspace…. The primary can't be unlinked.
- **Stepper:** stage names come from the lifecycle file (profile default or project override), 3–8 stages.
  - Done stages: `✓ Name`, `text-fg-muted`. Upcoming: `text-fg-subtle`. Current: pill `bg-raised border-line-strong font-semibold`. Separators: ›.
  - With 7–8 stages, every stage except the current one collapses to ✓ or its number, with the full name in a tooltip.
  - Below 900px wide the whole stepper becomes a `3/6 Implement` pill, and the action shortens to the next stage's name.
- **Stage action:** `Move to <next>` normally; `Approve & continue` when awaiting approval; `Re-run setup` on setup error; `Archive` at the last stage.
- **New workspace lifecycle field:** prefilled with the project's chosen lifecycle, with "None" as the only other option. "None" hides the stepper for that workspace.

## Workflow settings

Spec §13.4, §13.9, §13.10. Edit profile › Workflow (`ProfileWorkflowEditor`) and the project view's Workflow tab (`ProjectWorkflowEditor`, max 760px, `py-4`), both in `WorkflowViews.tsx`. Body `text-md space-y-3`.

- **Top:** a `text-fg-muted` explanation with a "?" Guide link floated right; the step-by-step team setup link; **Set up from my skills** (below); **Import…** and **Export…** (secondary sm; Export disabled until every field is filled, tooltip "Fill in every field first"), then "✓ Exported to <path>" (`text-sm text-fg-muted`) or the error.
- **On/off:** in Edit profile a checkbox "Read a workflow status in this profile's workspaces". In the project tab a radio row (`gap-4`): "Use <profile>'s workflow" · "Override for this project" · "None"; with the profile's chosen and none set, a `text-sm text-fg-subtle` note says where to set one. The project tab also has its own **Start prompt** (mono textarea).
- **Fields:** "Status file" pattern (mono input); **Statuses, in order** as a table (`text-md`, header `text-sm text-fg-muted` font-normal): Value in the file (30%, mono) · Label · Kind (select: Step · Gate · waits for you · Final, 160px) · ghost sm ↑ ↓ ✕ (↑ disabled on the first row, ↓ on the last). Under each row a second line of `text-sm` inputs: Hint; for gates also the answer button's label and the text it sends (`2fr 1fr 2fr`). Ghost sm **+ Add status** below. Start and Continue prompts as mono textareas (`min-h-14`).
- **Advanced:** a `<details>` (`rounded-lg border-line`), closed by default; its summary reads "**Advanced** · <what the match, id, title and status fields and the document label are set to>" in `text-sm text-fg-muted`. Inside, above a `border-t-line`: Document label; match field and what it equals (2 columns); status, id and title fields (3 columns).
- **Preview:** `bg-surface border-line rounded-lg p-3`, "Preview" `font-medium` and a workspace select on the right. States in `text-sm`: "No workspaces to preview yet.", "Fill in every field and status to preview.", "Reading…", an error in `st-error`. Then the matching files (mono; the chosen one `fg`, others `fg-subtle`, per-file errors in `st-error`), the front matter as a mono `dt`/`dd` grid, and the result line; an unknown status offers secondary sm **Add to list**.
- **Draft notice** (after Import or a proposal): `bg-surface border-line-strong rounded-lg p-3`: "Filled in from <source>. Nothing is saved yet", the list of changes against the saved workflow (`list-disc text-sm`), "Couldn't determine:" in `text-sm font-medium text-st-permission` with its list, and in Edit profile the "Also set up the task lookup: ask Claude, with <tool>" checkbox.
- **Save:** primary **Save workflow** right-aligned (Edit profile closes on save); in the project tab primary Save on the left with "Saved" after it.

### Set up from my skills

`SetupFromSkills.tsx`. Closed: a secondary sm **Set up from my skills…**. Open (by itself while the profile has no workflow): a `bg-surface border-line-strong rounded-lg p-3` panel, "Set up from my skills" `font-medium` with a `text-sm text-fg-muted` line and, when the profile has a workflow, a ghost sm **Close**; the Skill source select and Model input (mono, placeholder "Profile's default") in two columns, then the Task in progress select. Blocked states as one `text-sm text-fg-subtle` line (no sources, no workspace with a status file, "Looking for status files…"). Right-aligned: while running, "Claude is reading your skills… this can take a minute or two." with ghost sm **Stop**; primary sm **Propose a workflow**. A failure: "✕ <message>" in `st-error`, then "Claude: <its words>" in `fg-muted`.

## Task lookup tab

Spec §13.7. Edit profile › **Task lookup** (`ProfileLookupEditor` in `TaskLookupEditor.tsx`). A form, `text-md space-y-3`:

- A `text-fg-muted` explanation line, then a fieldset whose legend (`labelClass`) reads "Task lookup · fills in the title when New workspace gets a task id alone" with a "?" Guide link.
- **Kind:** a radio row (`gap-4`, `role="radiogroup"`): None · Ask Claude · Run a command. Switching resets the fields to that kind's defaults (prompt: the default prompt, no tools, 60s; command: empty, 20s).
- **Ask Claude:** Prompt (mono textarea `min-h-14`, label notes `{id}` and that it runs without a terminal); then a `1fr 3fr` grid: Model (mono, placeholder "Profile's default") and "Tools it may use · one per line; only read tools" (mono textarea, placeholder a connector tool name). A `text-sm text-fg-subtle` note on read tools. Each tool that looks like it changes things gets a line "⚠ <tool> looks like a tool that changes things." in `text-sm text-st-permission` (`role="alert"`).
- **Run a command:** one mono input (label notes `{id}`; it prints the title).
- **Timeout and Test** (any kind but None), one row: "Timeout" + an 80px mono number input (5–600) + "s"; on the right a 144px mono "Task id to test" input (placeholder `ABC-123`, ↵ runs the test) and ghost sm **Test** ("Looking up…" while it runs; disabled without an id or with an incomplete draft).
- **Test result:** success "✓ <title>" (`text-sm text-fg-muted`, title `fg`). Failure (`role="alert"`, `text-sm`): "✕ <message>" in `st-error`, "Claude: <reason>" in `fg-muted`, then one row per refused tool: its name in mono, "looks like it changes things" in `st-permission` when it does, ghost sm **Allow this tool** (**Allow anyway** for a write-looking one), and "a built-in tool" in `fg-subtle` when it isn't a connector tool. Allowing adds it to the list and clears the result.
- **Footer:** primary **Save task lookup**, right-aligned, disabled while saving or incomplete; saves the lookup alone and closes the dialog. Errors above it in `text-sm text-st-error`.

## Project lifecycle settings

> **Superseded** by the workflow from a status file and the Skills and Workflow tabs (spec §13.2, §13.4; see Workflow settings above). The project view has no Lifecycle tab and there is no lifecycle picker. Kept for reference.

- **Tab:** Project view → Lifecycle tab. The tab label shows a triangle and count while any stage has a missing skill.
- **Lifecycle picker:** a dropdown listing the profile's lifecycles (files in `~/.config/relur/profiles/<profile>/lifecycles/`), each shown with its name, stage count and stage names. The profile default is first. Picking another lifecycle is how a project gets different stages.
- **Skills source:** a segmented control, "<Profile> defaults" / "Override for this project". An override keeps the chosen lifecycle's stage names and only changes which skill runs at each stage. It is saved in Relur's app settings per project, never in the repository. With defaults selected, the skill dropdowns are read-only at 55% opacity.
- **Stage table:** columns #, Stage (read-only, from the lifecycle file), Skill (dropdown of skills found in the repo's `.claude/skills/`, shown with name and description, plus None), Description.
- **Missing skill:** a warning banner above the table, plus the dropdown warning state on the row.
- **Footer:** the lifecycle file path and the number of skills found.
- **Rescan:** the repo is rescanned on focus and when `.claude/skills/` changes.

## Changes panel

- On the right, 380px (360 below 900px window width), off by default. A `cursor-col-resize` edge (8px, `hover:bg-line-strong/60`, tooltip "Drag to resize; double-click for the default width") drags it between 360px and 75% of the workspace area; double-click resets it. The width is kept in local storage.
- **Full view** (⇧⌘M): the panel fills the workspace area (the terminal and the Responses panel hidden, not stopped). The panel takes the focus when it changes size, so Esc reaches it: full view → side panel; Esc beside the terminal returns focus to the terminal.
- **Header:** "Changes vs <base>", +/− totals, ghost sm **Full view** (`aria-pressed`; reads **Side panel** in full view; tooltips name ⇧⌘M and Esc), ×. Linked workspaces: "Changes · n repositories" and the totals across all of them.
- **File list:** beside the terminal, above the diff; with no dragged height its `max-height` is about five rows (`5 × 26 + 34`px, linked `+ 96`px for the repository header and controls), so a short list is as tall as its files and a long one scrolls. Between list and diff a 1px `bg-line` divider with an 8px `cursor-row-resize` hit area (`hover:bg-line-strong/60`, tooltip "Drag to resize the file list; double-click for its default height"). A dragged list keeps its height (min 56px; the diff keeps 120px). In Full view the list is a column on the left (280px default, 180px to 50%), with the same divider standing (`cursor-col-resize`). Height, width and collapsed are kept in local storage.
- **Group headers** ("Committed · n", "Uncommitted · n"; linked "Uncommitted n") are buttons with a 9px ▼: a click collapses the list (tooltip "Collapse the file list to one line").
- **Collapsed list:** one 28px line (`bg-surface border-b-line pl-2 pr-1.5`): ▶ (9px `fg-muted`), the current file's kind letter and path (mono `text-sm`, ellipsized from the left; linked `<repo> · <path>`), the place `3/14` (mono `text-xs fg-subtle`), then **‹** and **›** `iconButton`s (tooltips "Previous file (⌥⌘↑)", "Next file (⌥⌘↓)"; disabled at the ends). Clicking the file part expands the list. In Full view the line sits above the diff and the column is hidden.
- **File rows:** h-6.5, mono `text-sm`; kind letter M/A/D (amber/green/red, plus the letter itself), path ellipsized from the left, +n −n. Selected row: `bg-selected`.
- **Open in editor:** on hover or keyboard focus within a file row, a small **Open** button at its right (`h-5.5 px-1.5 rounded-sm border-line-strong bg-raised text-xs text-fg-muted`, hover `fg`; tooltip "Open in editor, at its first change"); none on deleted files. The diff header has a ghost sm **Open in editor** (at the cursor line in the new side, else the first change).
- **Diff header** (30px, `border-b-line px-3.5`): the path, ghost sm **Open in editor**, and the style switch: a segmented control (`fieldset`, `rounded-md border-line-strong p-px`) of **Unified** and **Side by side** (each `h-5 px-1.5 text-xs rounded-sm`; the chosen one `bg-raised font-medium text-fg`, the other `text-fg-muted`, `aria-pressed`). One app-wide setting, kept in local storage. When the diff is narrower than 640px, side by side shows unified with a line under the header (`bg-surface border-b-line px-3.5 py-1 text-xs text-fg-subtle`): "Too narrow for side by side: widen the panel or use Full view (⇧⌘M)".
- **Diff:** `font-mono` 11.5/18, two line-number columns. Added lines `bg-diff-add-bg` with a `text-diff-add` +; removed lines `bg-diff-del-bg` with a −. Hunk headers `bg-band text-fg-subtle`.
- **Empty:** "No changes yet" plus one line of explanation.
- **Linked workspaces:** one section per repository, primary first, above the diff.
  - Section header 32px `bg-surface border-b-line`: caret (collapses the section), name mono, "primary" tag, PR badge when a PR exists (18px pill, `border-diff-add/50 text-diff-add font-mono text-2xs`, "PR #318 · open", click opens it), the repository's +/−.
  - Groups "Committed n" (right: `↑n not pushed` or "pushed") and "Uncommitted n", 24px `text-xs font-semibold text-fg-subtle`, then the usual file rows. Empty groups are hidden; a repository without changes shows "No changes yet".
  - Controls row: Commit n → Push ↑n → Create PR, sm secondary buttons joined by `→`. Each is enabled only when it has something to do (Create PR needs pushed commits; tooltip names the missing step). With a PR, the last one reads "View PR #n". The buttons act on that repository only.
  - The file path row reads `<repo> · <path>`. ↑↓ move across sections.
- **Keyboard:** ⌘⇧D toggles; ⇧⌘M toggles full view while open. ⌥⌘↑ / ⌥⌘↓ (Ctrl+Shift+Up / Down elsewhere) pick the previous and next file anywhere in the panel, the diff included. With the panel focused, ↑↓ pick a file, Enter opens it in the editor, Esc leaves full view, else returns to the terminal. The toggles do nothing while a dialog is open.

## Claude terminal decorations

The terminal text is never restyled; everything below is an xterm decoration or an overlay.

- **Gutter:** 36px left margin. At each user prompt, the prompt number in `text-profile font-mono font-bold text-xs`. A triangle in `st-permission` marks a line that asks for permission.
- **Own terminal only:** decorations live in their terminal's xterm and go with it. A terminal is redrawn in full when shown, resized, re-themed or after a lost WebGL context (spec §6.3), so nothing from the terminal shown before can remain.
- **Response rule:** a 1px `line-strong` gutter line spanning the hovered response.
- **Copy at each response (classic mode):** a `h-5 bg-raised border-line-strong rounded-md` **Copy** button at the right edge of the line where a response ends, scrolling with the text. The label changes to "Copied" for 1.5s. ⌥C copies the last response.
- **Responses panel** (`ResponsesPanel.tsx`): the Claude tab bar's ghost sm **Responses ⇧⌘R** toggle (`aria-pressed`; tooltip also names ⌥C) opens a right-hand `aside` (`bg-canvas border-l-line`) beside the terminal, next to the Changes panel when both are open.
  - **Width:** default 420px (320px below 900px window width). A 8px-wide invisible handle straddling its left edge (`cursor-col-resize`, `hover:bg-line-strong/60`, tooltip "Drag to resize") resizes it between 320px and 70% of the workspace area; the width is kept in the window's local storage.
  - **Header:** 34px, `bg-surface border-b-line pl-3.5 pr-2`: "Responses" `text-md font-semibold`, the count `font-mono text-xs text-fg-subtle`, then (with 2+ responses) ghost sm **Expand all** and **Collapse all**, ghost sm **Full view** (`aria-pressed`; reads **Side panel** in full view; tooltips name ⇧⌘F and Esc), and a 24px × (tooltip "Close (Esc, ⇧⌘R)").
  - **Block** (`border-b-line`): a header row (`px-3.5 pt-2.5 pb-1.5 gap-2`, `hover:bg-raised`, focusable with `focus-visible:bg-raised`, `aria-expanded`; click, ↵ or Space toggles): `▾`/`▸` `text-xs fg-subtle`, the number `font-mono text-xs font-semibold text-fg-muted`, `› prompt` on one truncated line in `text-xs text-fg-subtle` (full prompt in its tooltip), the time `font-mono text-xs fg-subtle` (or "Not in the terminal" after a failed reveal), and ghost sm **Copy** ("Copied" for 1.5s). Then the body as `.doc-markdown` (`mx-3.5 mb-3 px-1 rounded-md`, selectable). Collapsed, the body is clipped to 4.6em and fades out (`mask-image` black 30% → transparent).
  - **Expanded state:** the newest response expanded, older ones collapsed, unless toggled; a new response arrives expanded. The list stays scrolled to the end while you're at the end (within 24px).
  - **Click a body** (classic renderer, beside the terminal; not a selection): expands it and scrolls the terminal to the response, whose line gets a `bg-profile/20` band for 1.5s; body hover `bg-raised`, tooltip "Show it in the terminal". In the alternate screen and in full view a click only expands.
  - **Full view:** the panel fills the workspace area (the terminal and Changes panel hidden, not stopped); blocks in a centred column, max 900px.
  - **Empty:** centred "No responses yet" `font-medium` and "Claude's responses in this conversation appear here as it writes them." (`text-sm text-fg-subtle`, max 240px). Errors as "✕ <message>" `text-sm text-st-error`.
  - **Keyboard:** ⇧⌘R toggles; ⇧⌘F toggles full view while open; the panel takes focus when it opens or changes size, so Esc reaches it: full view → side panel → closed (focus back to the terminal). The toggles do nothing while a dialog is open.
- **Prompt navigator:** a top-right pill reading `Prompt n of N`, with ↑ ↓. ⌘↑ / ⌘↓ scroll so the prompt sits 2 lines from the top.
- **Scrollbar ticks:** 6×2 in the profile color at each prompt; the current one is at full opacity, the rest at 55%.
- None of these take focus. Their mouse targets sit above the terminal only where they're drawn.

## Home overlay (profile home)

- 300px wide, top-right, 46px from the top of the terminal area. `bg-raised border-line-strong rounded-lg shadow-overlay`. Header: title, count badge (when > 0), "Hide ⌘.". Footer: "Keys go to the terminal…" hint.
- **Content depends on the profile's situation**, re-evaluated live:
  - **Needs you** (≥1 workspace needs permission, waits for input or awaits approval):
    - Leads with one row per such workspace. Each row has the status glyph, the id and title, what it's waiting for (status color, e.g. "Permission to run pnpm vitest · api-service"), and since when (mono, right-aligned). Oldest first.
    - Unfinished workspaces (spec §9.7) are listed among them with the Unfinished glyph, "Claude didn't finish when Relur closed · <project>" in `st-input` and the time Claude stopped. They count in the overlay's badge but not in the profile tab's or the Dock's.
    - Clicking a row (or Enter on it) opens that workspace's Claude tab.
    - Quick actions follow as one compact row of 24px ghost buttons.
  - **Nothing needs you:** full-size quick actions (New workspace ⌘N, Add project ⌘O, Start Claude here ⌘L), then "Recent workspaces": up to 4 rows with glyph, id, title and last activity.
  - **No projects:** "Get started" in three numbered steps: Add project → New workspace → Claude starts in the workspace. The current step is filled and the rest are outlined. Add project is the primary button; Start Claude here is a ghost button. The sidebar shows a matching dashed "No projects yet" note.
- **Never takes focus:** typing always goes to the terminal. ⌘K moves focus into the overlay (the first row gets the focus ring); ↑↓ and Enter work there. Esc, or any action, returns focus to the terminal. Clicks run the action without moving the terminal cursor.
- **Collapse:** ⌘. or Hide collapses it to a 26px pill in the header strip, which never covers terminal text. The pill reads "Needs you" plus the amber count when something needs you, and "Quick actions" otherwise. The collapsed state is remembered per profile.

## Project view (landing page)

- Opens when a project row in the sidebar is clicked or activated with Enter, and right after Add project succeeds. It never opens a terminal on its own. Project rows have no inline terminal button.
Spec §6.10. `ProjectView.tsx`, `bg-canvas`, header `px-6 pt-5`.

- **Row 1:** project name (`font-mono text-xl font-semibold`, truncated), then danger-quiet md "Remove…" on the right.
- **Row 2** (`mt-3 gap-2`, wraps): primary lg "New workspace ⌘N", secondary lg "Open shell ⌘T", secondary lg "Start Claude here ⌘L", secondary lg "Open in editor ⌘E" (main checkout; tooltip "Open the main checkout in the project's editor"). After them the hint "Runs in the main checkout at <path>, not in a workspace." (`text-sm text-fg-subtle`, path mono).
  - Open shell and Start Claude here open a terminal in the main checkout, as a tab in the project view's own tab strip. These terminals have no worktree, workflow or Changes panel.
- **Details** (`mt-4`, `gap-x-9`, wrapping): Path, Base branch, Remote, Worktrees; label `text-sm text-fg-muted`, value `font-mono text-sm` truncated. Remote has ghost sm **Change…**, which replaces the value with a 26px mono select (the repository's remotes, then "none"; focused; Esc or blur closes it, a choice saves it). Worktrees has a "?" Guide link and ghost sm **Change…** and, when the project has its own folder, **Use default**.
- **Remote picked up:** the app notice at the top of the main area (info, goes away after 10 s): "<project> now uses the remote origin: Push and Create PR are available".
- **Tab strip** (`h-9 border-b-line px-4 mt-4`): underline tabs (`h-9 px-2.5 text-md border-b-2`; active `border-fg font-medium text-fg`, inactive `border-transparent text-fg-muted`, hover `text-fg`): **Workspaces** with its count (`font-mono text-xs text-fg-subtle`), **Setup**, **Skills**, **Workflow**. Main-checkout terminals follow as terminal tabs after a `border-l-line` divider, each with ×.
- **Workspaces tab:** a fixed table (`text-md`; header `text-sm text-fg-muted` font-normal; cells `px-2 py-2.5`; rows `border-b-line`, hover `bg-raised`, click opens): Status (176px, glyph + state label in the status color), Workflow (128px, only when any workspace has one; label `text-sm fg-muted`, unknown status `st-permission`), Task (96px, mono `fg-muted`), Title (a button), Branch (30%, mono), Active (64px, right, mono `fg-subtle`, relative time). Below, **Other worktrees** when there are any: `text-sm text-fg-muted` heading with a "?" link, one line of explanation, then rows (branch mono 30%, path mono `fg-muted`, **Open as workspace**). Empty: "No workspaces yet" `font-medium`, one explanatory line, secondary "New workspace ⌘N".
- **Setup tab:** the Editor picker (see Open in editor), then the project's setup settings.
- **Skills tab** and **Workflow tab:** spec §13.2 and Workflow settings above.
- **Keyboard:** ⌘N, ⌘T, ⌘L and ⌘E act on the shown project. The workspace table is reached with Tab (the title buttons); ↑↓ in the table is not built.

## Plan usage (status bar)

- **Session:** label, 44×4 bar, `%` in mono, "resets 2h 11m". **Week:** label, bar, `%`.
- **Fill colors:** `fg-muted`; `st-permission` at 80% or above.
- **Stale** (refresh failed or older than 10 min):
  - striped bar at 60% opacity
  - dashed ring icon
  - "Stale · 22m ago" text
  - a Retry link
  - the last known values stay visible
- **Unknown value:** "—".
- **Tooltip:** exact reset time and the last refresh time.

## Dialogs

- **Container:** 500px wide, top offset 96px, `bg-raised border-line-strong rounded-xl shadow-dialog`, over a `bg-scrim` scrim. Title `text-lg font-semibold`, body `text-md text-fg-muted`, footer right-aligned (Cancel, then the primary action).
- **Focus:** non-destructive dialogs focus the first field; destructive ones focus Cancel. Focus is trapped and restored on close. ⌘↵ confirms, Esc cancels. Clicking the scrim cancels only when nothing has been typed.
- **Add project:** a segmented control first (full width, `mb-4`, `h-7` segments, radio inputs: ←→ move and the selection follows focus): **Existing folder**, **New repository**, **Clone from URL**. Focus stays on it when the mode changes; the first field of the mode has `data-autofocus` for the dialog's opening.
  - **Existing folder:** path field with Browse…, then the detection panel. Add is disabled until a git repository is detected.
  - **New repository:** Name (mono), Parent folder (mono) with secondary lg Browse… ⌘B, then one note line under them (`mt-1.5 text-sm`): "Creates <path>" (`fg-subtle`, path mono), or ✕ the reason (`st-error`), and ⚠ "The parent folder is inside the repository <path>…" (`st-permission`) as a warning that doesn't disable anything. Then the `bg-surface` detail panel (104px label column): **First commit** with two checkboxes, both ticked ("A README.md with the name as its heading", "A .gitignore"; with neither, "An empty commit" in `text-xs fg-subtle`), Base branch (mono), Committed as (the identity mono, or "your git config's user.name and user.email" in `fg-muted`), Remote "None: Push and Create PR need one added later" (`fg-muted`), Worktrees. Primary lg **Create repository ⌘↵** ("Creating…" while it runs), disabled until the folder check passes.
  - **Clone from URL:** Repository URL (mono, placeholder `git@host:team/repository.git`), Parent folder with Browse…, Folder name (filled from the URL until edited), the note line as above, then a `bg-surface` panel with Worktrees. After **Clone**, the fields are disabled and a terminal block appears below (`rounded-md border-line bg-term`): a 28px header with `$ git clone` (mono `fg-muted`) and on the right the working glyph with "running", or "exited · code n" (`diff-add` for 0, `st-error` otherwise), then a 180px terminal. The button reads "Cloning…", then "Adding…"; after a failure "Try again", with ✕ "git clone failed (exit n); nothing was added" and the focus back on the URL.
- **Remove project:** explains that nothing on disk is deleted and lists the repo and worktree paths. The confirm button is Secondary ("Remove from Relur").
- **New workspace:**
  - **Also in** (first, below the project line), shown when the profile has other projects: a list of 30px checkbox rows, one per other project, name mono and `← base` (that project's own base). None ticked by default. The ticked set is remembered per project and pre-filled next time, with "Last used with <project>" on the right of the label. With ≥1 ticked: "One Claude works in all of them, starting in <project>." (`text-sm text-fg-muted`).
  - Fields: task id, title, branch (derived until edited; with Also in ticked the source note reads "from id + title · same in all n"), base branch (defaults to the project's; linked repositories use their own), ~~lifecycle (project's or None)~~ (superseded: there is no lifecycle field; the workflow comes from the project's settings, spec §13.4). The built dialog has one Task field for id and title (spec §7.1) rather than separate id and title fields.
  - "Run setup, then start Claude with the task brief" is on by default. Setup runs in every repository; Claude starts in the primary once all have passed.
  - **Branch taken or invalid** (spec §7.1): for a branch from the task, a `text-sm text-fg-muted` line under the field, "<why>; using <free name>" (name mono `fg`), and the field shows the free name. For a typed branch, the `st-error` line "✕ <why>" with a ghost sm **Use <free name>** (name mono) after it, which puts the name in the field.
  - **Task lookup** (spec §13.7): while it runs, "Looking up ABC-123…" (`text-sm fg-muted`, id mono `fg`) with ghost sm **Stop**. A failure: "✕ Couldn't look up ABC-123: <why>." (`st-error`), Claude's explanation (`fg-muted`), and "Create anyway names the branch after what you typed, or type the title after the id." (`fg-muted`); the primary button reads **Create anyway ⌘↵** until the Task field changes. A task not found closes the dialog like a success.
  - **Notice after Create:** a renamed branch, a not-found id or a base from the local branch (spec §7.3) shows in the app notice bar as news (`↗` in `fg-subtle`, one line each, gone after 10 s).
- **Delete workspace:** amber warning blocks for uncommitted changes (lists files) and unpushed commits. "Also delete the local branch" is off by default. Secondary "Commit and push first"; Danger "Delete anyway". Without warnings, the danger button reads "Delete".
  - **Linked:** one card per repository (`border-line-strong rounded-lg`): 32px `bg-surface` header with name, primary tag and worktree path; one amber row per warning (n uncommitted changes with files · n commits not pushed · PR #n is open, stays open on GitHub); or ✓ "No uncommitted changes or unpushed commits"; then its own "Also delete the local branch <branch>" checkbox, off by default. "Commit and push first" is hidden when every card is clean.
- **Link another repository** (⋯ menu): project list (radio rows, other projects of the profile; ones already in the workspace at 45% with "Already in this workspace"), then a `bg-surface` panel with the worktree path, `branch ← base` ("new branch" off that project's base) and the setup note. Two radio cards:
  - **Link and restart Claude** (default): "Claude restarts in <primary> with all n folders. The conversation continues." Relur restarts Claude with `--resume <session id>` (else `--continue`) and an `--add-dir` per linked worktree.
  - **Link only:** Claude keeps running; shows `/add-dir <worktree path>` in a command block with Copy ("Copied" for 1.5s) to paste into Claude.
  - The primary button follows the choice (⌘↵). Setup for the new repository runs in a new Setup tab first.
- **Unlink <repo>:** "Unlink <repo> from <id>?", "Deletes its worktree and closes its Setup and Shell tabs. Claude restarts in <primary> without it; the conversation continues.", then that repository's card as in Delete. Cancel focused; Danger "Unlink <repo>".
- **Remove project, when linked into other projects' workspaces:** the lead line says how many; one row per workspace (glyph, id, title, "· in <main project>", right: "No uncommitted changes" or amber "Uncommitted changes") with "Deleted <worktree path>" under it. Then: those worktrees are deleted, the workspaces stay in their main project with their other repositories, Claude restarts without this project, the repository itself is untouched. Because something is deleted, the confirm is Danger "Remove and delete n worktrees". Workspaces whose main project is the removed one follow the normal rule (nothing deleted).
- **Quit with running sessions:** lists every non-idle session across profiles with its glyph, profile dot, id, title and state. "Don't ask when all sessions are idle" checkbox; Quit is the primary button (⌘Q). Also triggered by closing the last window where that quits (Linux and Windows, or macOS with Quit When the Window Closes; spec §5).
- **Quit, what comes next** (spec §9.7): the description's second sentence says "They'll continue when Relur starts again", "You'll be asked when Relur starts again", or "n will continue …; you'll be asked about the rest" when Claude was working, interrupted or asking for permission in any of the sessions; otherwise "Claude conversations resume on the next launch."
- **Claude didn't finish in n workspaces** (spec §9.7, `UnfinishedDialog.tsx`): the wide dialog (620px). Description: "Relur stopped while Claude was at work there. The ticked ones get the continue prompt, one after another." One section per profile in tab order, headed by its dot (8px) and name (`text-sm font-medium text-fg-muted`), with a bordered list (`divide-y divide-line rounded-lg border-line`). A row (`px-3 py-2 gap-2.5`): a checkbox in a 16px box (ticked for Working, unticked for Esc-interrupted and stopped background commands, none for permission), the profile dot (6px), the id (mono `text-xs fg-muted`), title and project (mono `text-xs fg-subtle`) with the last prompt on one line below (`text-sm fg-muted`, truncated, full text in the tooltip); at the right the reason (`text-sm`, `st-permission` for a permission; "n background commands were stopped" for stopped commands) over "stopped 10:42" (mono `text-xs fg-subtle`), then ghost sm **Open**. Footer: the plan-limit reason on the left (`text-sm text-st-permission`) when there is one, ghost lg **Not now Esc**, primary lg **Continue selected ⌘↵** (focused; disabled with the reason in its tooltip when nothing is ticked or at the plan limit).
- **Continue notice** (spec §9.7): a bar at the top of the main area, as other app notices (`bg-surface border-b-line px-4 py-2 text-md`): `↻` in `fg-subtle`, "Continuing interrupted work:", then each workspace (profile dot 6px, id or title, and `text-sm fg-muted` "waiting" / "✓ continued" / "stopped" / "held" with the reason as tooltip), separated by `·`; secondary sm **Stop** on the right, disabled once nothing is waiting. Shown while prompts are being sent.
- **New versions** (spec §15.7, `UpdateNotice.tsx`): never a dialog; a bar under the tabs (`bg-surface border-b-line px-4 py-2 text-md`, wraps). The first-start question: `↻` in `fg-subtle`, the question text, secondary sm **Check for updates**, ghost sm **No thanks**. The notice: `↑`, "Relur 0.2.0 is available" with "you have 0.1.0" (`text-sm fg-subtle`), primary sm **Update**, ghost sm **Release notes** and **Skip this version**, and × (`iconButton`, "Hide until the next check"). After Update, a full-width line under it: "A terminal opened…", or the reason with the command in a Command block with Copy (and "Download the .deb" for a .deb install).
- **Closing the window, first time (macOS):** title "<app> keeps running"; the description says Claude keeps working and notifications arrive, Click <app> in the Dock to bring the window back, quit with ⌘Q; a line names Quit When the Window Closes in the app menu and says the message isn't shown again. Cancel (ghost, Esc) and Close Window (primary, focused). Shown once ever (spec §5).

## Linked repositories

One workspace can span several projects of the same profile. Each repository gets its own worktree at `~/Code/.relur/<project>/<id>` on the same branch name, off its own base. The first is the primary: the workspace lives under it, and one Claude runs there with `--add-dir` for every other worktree.

- **Setup:** runs per repository, in parallel, each in its own Setup tab. Claude starts when all have passed.
- **Error bar** (setup failed in one or more): full-width under the header, `st-error` 9% tint, 40% border. ✕, "Setup failed in <repos>", second line "setup.sh exited with code n. <others> are ready; Claude starts when every repository is." Buttons: secondary Retry (⌘R, re-runs only the failed ones; tooltip names them), secondary "Start Claude anyway" (starts in the primary with the repositories that are ready), danger-quiet Delete…. The failed repository's Setup tab opens itself and its chip shows "✕ setup failed". ~~The stage action is hidden while the bar shows.~~ (The stage action is superseded by the workflow actions, which stay.)
  - *As built* (`WorkspaceView.tsx`): a `bg-st-error/9 border-b border-st-error/40 px-4 py-2` bar under the tab strip (`role="alert"`), "✕ <state message>" in `st-error`, the second line in `text-sm text-fg-muted`, then secondary sm Retry with its ⌘R `Kbd`, secondary sm Start Claude anyway, danger-quiet sm Delete…. On Linux and Windows, Ctrl+R in a focused terminal stays with the terminal.
- **Status:** the workspace's glyph reflects Claude; a setup failure in any repository makes it Error.
- **Workflow:** one stepper for the workspace, read from the primary worktree's status file (the old "Lifecycle" stepper is superseded, spec §13.4).

## Claude account handling (hard rule)

Relur never handles Claude logins itself: no password fields, no tokens, no reading or copying credentials. Every account action runs Claude Code's own official command in a visible embedded terminal, and the exact command is shown verbatim (with Copy) before it runs. Sign-in finishes in the browser through Claude Code's own flow. Each profile runs Claude with `CLAUDE_CONFIG_DIR=<folder>`; `~/.claude` means the variable is unset.

Commands Relur runs:

| Purpose | Command | Notes |
|---|---|---|
| Installed? | `claude --version` | Run from a fresh login shell so PATH matches the user's terminal |
| Signed in? | `CLAUDE_CONFIG_DIR=<folder> claude auth status --json` | Exit 0 = signed in; read account, plan, `configDirectory` |
| Install, macOS/Linux/WSL (recommended) | `curl -fsSL https://claude.ai/install.sh \| bash` | Native installer, auto-updates |
| Install, Homebrew (if `brew` found) | `brew install --cask claude-code` | No auto-update; say so |
| Install, Windows (recommended) | `irm https://claude.ai/install.ps1 \| iex` | PowerShell; WinGet `winget install Anthropic.ClaudeCode` as alternative |
| Sign in | `CLAUDE_CONFIG_DIR=<folder> claude auth login` | Opens the browser |

`claude auth status` writes first-run files into an empty folder, so folder detection only runs it on folders that already contain `.claude.json`; others show "Not checked".

## Profile tab: + and context menu

- **+** after the last tab: 28×28 ghost icon button, tooltip "New profile". Opens the New profile wizard.
- **Context menu** (right-click or ⇧F10 on a tab; native): Edit profile…, Check setup, Move Left, Move Right (each disabled at its end), then "Remove profile…" (asks directly: "Remove <Profile> from <app>?" with Keep profile focused, as in Edit profile). Remove is disabled while the profile has projects, with the reason as a disabled line under it. "Move to new window" arrives with multiple windows (M5).

## New profile wizard

- **Container:** 620px dialog, top offset 48px, max-height to the window minus 88px with the body scrolling. Header: profile dot (live color), title ("Create your first profile" on first launch, else "New profile"), ×. Step tabs: Name & color · Claude account · Setup check · Done; done steps show ✓, the current one a 2px `fg` underline.
- **Footer:** Back (step b only), then a ghost secondary and the primary (⌘↵). Primary labels: Next → Create profile → Continue → Open <name>.
- **a. Name & color:** name input (focused). Six swatches; colors used by other profiles go last, after a 1px divider, at 75% opacity, still selectable, tooltip "green · used by Personal". A tab-strip preview shows the new tab next to the existing ones.
- **b. Claude account:** three radio cards (`rounded-lg`, selected = `bg-surface border-fg-subtle`).
  - **Use my default Claude login** `~/.claude`: always shows that folder's state, account and a "Used by <profile>" chip (with the profile's dot) when taken.
  - **Use an existing login:** expands a list of detected folders (`~/.claude*` in the home folder): radio, path (mono), state (✓ Signed in / Not signed in / Not checked), account if known, Used by chip. Last row: "Choose another folder… ⌘B".
  - **Sign in to a new account:** path input prefilled `~/.claude-<slug of name>`, editable; it follows the name until edited. The folder is created on Create profile.
  - **Shared-account warning** (amber block, under the selected card) whenever the chosen folder is used by another profile: both profiles share one login, settings, history and plan usage; signing out in one signs out both.
- **c. Setup check:** the profile exists from here on (no Back). Embedded Setup check without its header. Continue is disabled until all rows pass; "Finish later" skips to Done and the profile stays gated.
- **d. Done:** summary (profile, account, folder) and an optional terminal shortcut: `alias claude-<slug>='CLAUDE_CONFIG_DIR=<folder> claude'` with Copy, plus secondary "Add to ~/.zshrc…". Hidden for `~/.claude`.
  - **Confirmation** (nested dialog over the wizard, focus on Cancel): "Add one line to ~/.zshrc?", the absolute file path and the line as a `+` diff line. Relur appends that line and nothing else. Afterwards: "✓ Added to the end of ~/.zshrc". The shell's rc file is used (`~/.bashrc`, `~/.config/fish/config.fish` with `alias` syntax adapted).

## Setup check

Per profile. Used in the wizard (embedded), in the main area from the status bar warning or "Check setup" (with header), and as the gate.

- **Header:** "Set up <Profile>" (or the gate title; 17px semibold) with a "?" Guide link, one line naming the folder, secondary "Check again ⌘R" on the right ("Check again unlocks when the command exits." under it in `text-xs fg-subtle` while a command runs). Footer: the login promise line.
- **Checklist:** `bg-surface border-line rounded-lg`, three 42px rows: Claude Code installed (detail: version, mono) · Signed in (detail: account · plan) · Ready (detail: "Claude Code uses <folder>"). Rows run in order; rows after a blocked one wait.
- **Row states** (shape + color, right-aligned label):

| State | Glyph | Label |
|---|---|---|
| Checking | spinning ring (Status glyph Working); detail shows the command being run | Checking… `fg-subtle` |
| Passed | ✓ `diff-add` | Passed |
| Needs action | filled triangle `st-permission` | Needs action |
| Failed | ✕ `st-error`; detail in `st-error` | Failed |
| Running (command in terminal) | spinning ring | Running |
| Waiting | 8px hollow circle `line-strong`; title `fg-subtle` | — |

- **Expanded row** (needs action, running, failed): `bg-canvas`, indented 42px: explanation, the command block(s), buttons, then the embedded terminal.
- **Command block:** `bg-term border-line rounded-md h-7.5`, `$` prefix, the command verbatim in mono (never paraphrased or truncated in the copy), Copy → "Copied" for 1.5s.
- **Install (needs action):** one radio card per official method for the platform: native installer (tag "Recommended"), Homebrew only when `brew` is on PATH (WinGet on Windows). Primary "Install" runs the selected command; its tooltip repeats it.
- **Sign in (needs action):** three lines: the browser decides which account signs in; to use another, sign out on claude.ai first or open the login link in a private window; the free Claude plan doesn't include Claude Code. Command block with the `claude auth login` line, primary "Sign in".
- **Embedded terminal:** `bg-term border-line rounded-md`. 28px header: `$ Terminal`, `zsh · CLAUDE_CONFIG_DIR=<folder>`, and running (spinner) or "exited · code n" (`diff-add` for 0, `st-error` otherwise). Output is the real PTY, untouched; URLs are clickable. While running, "Check again" is disabled with the hint "unlocks when the command exits". ⌃C stops it.
- **Failure states:**
  - Install failed: "Install failed · exit code n", explanation, "Run again" + "Check again".
  - Still not found after install: installer exited 0 but `claude` isn't on the login-shell PATH; shows `export PATH="$HOME/.local/bin:$PATH"` to add by hand, and Check again.
  - Login cancelled: "Sign in again" + "Check again"; repeats the other-account hint.
  - Ready failed: `auth status` reports a different `configDirectory` (something in the shell overrides `CLAUDE_CONFIG_DIR`).
- **Keyboard:** ⌘R checks again. Focus moves to the terminal while a command runs and back to Check again when it exits.

## Gate and status bar warning

- While a profile's check isn't fully passed, opening any project or workspace in it shows the Setup check in place of the content (title "Finish setting up <Profile> to open <id or project>", subtitle notes the Home terminal still works). The sidebar stays; its workspaces show Exited.
- Profile home and its terminal work normally.
- **Status bar counts** (spec §6.5, `StatusBar.tsx`): left of usage, each only when it isn't 0: the Working glyph and "n working" in `text-fg-muted`; the Input glyph and "n needs you" in `font-medium text-st-input` (permission, input and approval together). Tooltips say what they count. Not buttons.
- **Sandbox warning bar** (spec §15.6, `SandboxWarning.tsx`): under the profile tabs, full width, `border-b border-st-permission/40 bg-st-permission/8`, while Chromium's sandbox is off: `st-permission` triangle, **Running without Chromium's sandbox**, the reason in `text-fg-muted`, and an underlined "How to turn it on" that opens the Guide at `linux#the-sandbox`. No close button: it stays until the app starts with the sandbox on.
- **Status bar warning:** left of usage, `st-permission` triangle + "claude not found" / "not signed in" / "wrong config folder", plus an underlined "Set up". Click opens the Setup check in the main area. Plan usage is hidden until signed in.
- When the check passes, the gate lifts in place and the requested content opens. New workspace and Start Claude here, gated, go back to where they were asked from and open the dialog or start Claude.

## Edit profile

Spec §6.11 (Edit profile), §6.13, §13.2, §13.4, §13.7. `EditProfileDialog.tsx`.

- **Container:** the wide dialog (620px, 48px from the top) at a fixed height, `min(720px, window − 88px)`, so switching tabs doesn't resize it; the body scrolls. Title "Edit profile" with the profile dot (live color).
- **Tabs** (`role="tablist"`, under the title, `border-b-line`): **General** · **Skills** (with the number of skill sources, `font-mono text-xs text-fg-subtle`, when > 0) · **Workflow** · **Task lookup**. Underline tabs `h-8 px-2.5 text-md border-b-2`; active `border-fg font-medium text-fg`, inactive `border-transparent text-fg-muted`, hover `text-fg`. Other screens can open the dialog at a given tab.
- **General** (form, `gap-4`), top to bottom:
  - Name; Color (others' colors last, as in the wizard).
  - Claude account folder "· read-only" (a disabled mono input) with secondary lg **Check setup**; the folder's state line (`text-sm text-fg-muted`); "To use a different Claude account, create a new profile." (`text-sm text-fg-subtle`).
  - Terminal shortcut (profiles with their own folder; `TerminalShortcut.tsx`, shared with the wizard's Done step): "Terminal shortcut (optional)", the alias in a command block with Copy, secondary **Add to <rc file>…** or the ✓ note.
  - Commit identity "· optional": name and email in two columns, with a `text-sm text-fg-subtle` note.
  - Pull request commands "· optional" with a "?" to Finishing work › PR commands: Create PR and PR status, each a mono `text-sm` input under a `text-sm text-fg-muted` label, then a `text-sm text-fg-subtle` note.
  - Sounds: one checkbox per alert sound; ticking plays it once.
  - Alerts: "Do Not Disturb" checkbox with "no notifications or sounds" in `fg-subtle`.
  - When Relur starts (spec §9.7): "Continue interrupted work when Relur starts" checkbox (off by default), "Continue prompt" (`text-sm text-fg-muted` label) over a 3-row textarea (`text-sm`) holding the default prompt until edited, and a `text-sm text-fg-subtle` note: sent to each workspace where Claude was working, a few seconds apart and never at the plan limit; Esc-interrupted work and permissions are never continued by themselves; off, you're asked at start.
  - Editor (see Open in editor), with a note that a project can choose its own in its Setup tab.
  - Linking repositories: "Ask before Claude links a repository" checkbox with a "?" link and a note.
  - "Your status line command · optional" with a "?" link: a mono input and a note.
  - **Remove profile** (above a `border-t-line`): danger-quiet **Remove profile…**, disabled while the profile has projects; the line next to it gives the reason, or says nothing on disk is deleted. Without projects it expands an inline `bg-surface border-line rounded-md p-3` confirmation (focus on ghost **Keep profile**): the folder and its login stay. Confirm is secondary "Remove from <app>".
  - Footer: ghost Cancel, primary **Save ⌘↵**.
- **Skills:** the skill sources editor (spec §13.2) and a footer with secondary **Close**.
- **Workflow:** see Workflow settings. **Task lookup:** see Task lookup tab. Each saves on its own button and closes the dialog.

## Guide tab (pinned)

- First item in the tab strip, before the profiles, followed by a 1×16 `line-strong` divider. Content: 15px ring with "?" (`border-current`, 9.5px semibold) and the label "Guide". Auto width (`pl-2.5 pr-3`). Below 900px window width: icon only, 34×32.
- Same active/inactive treatment as a profile tab (`bg-canvas border-line` when active), but no profile color stripe, no badge, no ⌘n hint, no close button. Not draggable, never moves to another window, no context menu. Tooltip "Guide ⇧⌘/".
- While the Guide is active, no profile tab is active. The status bar keeps the last profile. Clicking a profile tab returns to that profile's last view.
- **Keyboard:** ⇧⌘/ (⌘?) opens it from anywhere. ⌘1–⌘9 stay the profile shortcuts.

## Guide

Replaces the sidebar and main area. Content comes from Markdown files shipped with the app (one file per page, grouped into numbered sections; the page title is the `#` heading).

- **Table of contents:** 256px, `bg-canvas border-r border-line`. Search field at the top (`h-7.5 bg-term`, ⌘F, × clears). Section rows 28px: chevron, number in mono, title; the current section is `font-semibold` and expanded; one-page sections open the page directly. Page rows 26px, indented 42px; current = `bg-selected text-fg font-medium`.
- **Article:** max 660px, padding 36/40px. Eyebrow (section number mono + section name, `text-sm fg-subtle`), title 26px semibold, then blocks with a 14px gap and 28px before each `##`.
- **On this page:** 176px sticky rail on the right, shown when a page has 3 or more `##` headings and the window is ≥ 900px. 1px `line` track; the heading in view gets `fg` text and an `fg` track segment. Click scrolls to it.
- **Previous / next:** two cards under a `border-t border-line` (label, page title semibold, section name). Order follows the table of contents across sections.

### Article blocks

| Markdown | Rendering |
|---|---|
| `##` | 17px semibold, anchor id = slug |
| Paragraph | 14px/1.6 `fg`, `text-wrap: pretty` |
| `-` / `1.` lists | 22px marker column; bullets `fg-subtle`, numbers mono |
| Table | `border-line rounded-lg`; header `bg-surface text-sm fg-muted`; first column `font-medium` |
| Inline code | mono 0.88em, `bg-surface border-line rounded-sm px-1.25` |
| `**bold**` | `font-semibold` |
| Link | underline, `line-strong` decoration, 3px offset. Relative links (`page-id#section`) open in the Guide; external links open in the browser |
| `<kbd>` | mono 11.5px, min 20×19, `bg-raised border-line-strong`, 2px bottom border |
| Code block | `bg-term border-line rounded-lg`; 28px header with the language and Copy ("Copied" for 1.5s); `#` lines `fg-subtle`; no wrapping, scrolls |
| `:::tip` / `:::note` / `:::warning [title]` | `rounded-lg` box with full border. Tip: ring with → in `diff-add`, 8% tint. Note: ring with i, `bg-surface`. Warning: filled triangle `st-permission`, 8% tint. Title defaults to Tip / Note / Warning |
| `:::keys` | One row per line `keys \| label`. Each chord is one kbd; `–` and `/` render as plain separators. 38px rows, keys column 40% |
| `:::glyphs` | The status glyph legend with the real Status glyph component in a 28px tile, name, shape name, meaning |
| `:::diagram` | Profile → Project → Workspace: three `bg-canvas border-line-strong` boxes (eyebrow, example, caption) joined by "has →"; wraps when narrow |

### Search

- Filters pages by title and text (Markdown stripped), case-insensitive, as you type. Results replace the table of contents: count ("3 pages"), then per page the section name, the title and a two-line snippet around the first match. Matches get a `focus` 30% background.
- **No results:** "No pages match “<query>”", a hint to try a shorter word, links to Troubleshooting, Keyboard shortcuts and The three building blocks, and "Clear search Esc".
- Esc clears the query; a second Esc returns focus to the article.

### Deep links

- Any screen can open the Guide at `page-id#section`. Example: the 16px "?" after the usage meters in the status bar opens Plan usage at Session and Week.
- The article scrolls the section to 28px from the top. The section (its heading to the next `##`) gets a `focus` 11% band with a 1px `focus` 50% ring, `rounded-lg`, and a "Linked" tag (`bg-focus text-on-fg`, 18px pill) on its top edge. After 2.6s the band fades out over 1.2s. Reduced motion: no fade, the band clears on the first scroll.
- A row above the eyebrow reads "← Back to <workspace, project or Home>" and "Opened from <origin>". Back (⌘[) returns to that view.
- Suggested links: setup check sign-in → `create-profile#which-account-signs-in`; status bar warnings → `setup-check`; New workspace Task field → `new-workspace`; Delete workspace dialog → `delete-workspace`.

### Narrow (720×480)

- Applies below 760px window width (spec §6.12). 36px bar on `bg-surface`: "Contents ▾" button (hamburger icon) and the crumb "Section › Page". The button opens the table of contents (with search) as a 300px panel from the left over a scrim; picking a page or Esc closes it. On this page is hidden. Article padding 22px.

## Empty and first-run states

Only empty states and the logo use the orbit motif: dashed ring, ring and dot.

- **First launch:** orbit mark, "Welcome to Relur", one line on profiles, primary "Create your first profile" (opens the New profile wizard), and the login promise line. The tab strip shows only +.
- **Profile with no projects:** sidebar shows "No projects yet" with Add project.
- **Project with no workspaces:** explanation plus New workspace.
- **No changes:** shown in the Changes panel.
- **Exited terminal:** "[process exited · code n]".

---

## Keyboard shortcuts

Every built shortcut is defined once in `src/shared/shortcuts.ts` (key handlers, menu accelerators, the hints on buttons and the Guide's shortcuts page read it); spec §6.6 has the list with milestones. Rows marked *(M5)* aren't built yet. ⌘ = Ctrl on Windows/Linux, except where Ctrl with that key is the shell's: there it's Ctrl+Shift (Ctrl+Shift+L, Ctrl+Shift+W, …) and Check again and Retry are F5 (spec §6.6). App shortcuts never shadow terminal keys (⌃C ⌃D ⌃R ⌃L ⌃Z, Esc pass through). ⌃1–9 for terminal tabs is the one documented exception; it can't be remapped.

| Action | Keys |
|---|---|
| Switch profile tab | ⌘1 – ⌘9 |
| Profile home | ⌘0 |
| Go to… (workspaces, projects, actions) *(M5)* | ⌘K |
| Next / previous workspace | ⌥↓ / ⌥↑ |
| Next workspace needing you | ⌘J |
| New workspace | ⌘N |
| Add project | ⌘O |
| Toggle sidebar (rail) *(M5)* | ⌘\ |
| Toggle changes panel | ⌘⇧D |
| Changes panel: previous / next file (also in the diff) | ⌥⌘↑ / ⌥⌘↓ |
| Continue the workflow; at a gate, put the Claude terminal in focus (was: advance lifecycle stage, superseded) | ⌘⇧↵ |
| Terminal tab 1–9 | ⌃1 – ⌃9 |
| Cycle terminal tabs | ⌃Tab / ⌃⇧Tab |
| New terminal (Shell) | ⌘T |
| Close terminal tab | ⌘W |
| Close window (macOS) | ⇧⌘W |
| Restart Claude in an exited Claude tab | ↵ |
| Move terminal tab *(M5)* | ⌘⇧[ / ⌘⇧] |
| New line in a terminal (Claude's prompt) | ⇧↵ |
| Delete to the start of the line in a terminal (macOS) | ⌘⌫ |
| Previous / next prompt | ⌘↑ / ⌘↓ |
| Copy the last response | ⌥C |
| Responses panel | ⇧⌘R |
| Responses panel: full view or back | ⇧⌘F |
| Changes panel: full view or back | ⇧⌘M |
| Collapse quick actions | ⌘. |
| Start Claude here (home, project main checkout) | ⌘L |
| Open in editor | ⌘E |
| Browse (in a path field) | ⌘B |
| Guide | ⇧⌘/ |
| Search the Guide (in the Guide) | ⌘F |
| Back from a deep link | ⌘[ |
| Confirm dialog | ⌘↵ |
| Check again (setup check) | ⌘R |
| Cancel / return focus to terminal | Esc |
| Quit | ⌘Q |
