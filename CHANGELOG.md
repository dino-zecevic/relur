# Changelog

All notable changes to Relur. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/). A release's section here is its GitHub release notes.

## [Unreleased]

## [0.3.2] - 2026-11-04

### Added

- In terminals, ⇧↵ starts a new line in Claude's prompt instead of sending it (Relur sends ESC ↵, so `/terminal-setup` isn't needed). On macOS, ⌘⌫ deletes to the start of the line, as in other macOS terminals.

## [0.3.1] - 2026-11-03

### Added

- **Report a Bug…** and **Request a Feature…** in the Help menu (under the Guide, on macOS too) and as links on the Guide's Troubleshooting page. Both open the repository's issue forms in the browser; a bug report comes prefilled with the app version, the OS and its version, and the Claude Code version. Nothing is sent.

### Fixed

- New workspace accepts any task text and always gives a valid branch name: what git refuses is replaced, a template with only `{id}` or `{slug}` fills it from the other, and text that gives no name becomes `task`.
- A branch from the task that's already taken, also only on the remote, becomes the next free name (`-2`, `-3` …). A typed one that's taken says so and offers **Use** with a free name.
- Task lookup no longer blocks: an id it doesn't find creates the workspace without a title, with a note, and a failed lookup offers **Create anyway** (↵) or **Cancel**.
- A base branch that isn't on the remote yet, or a fetch that fails, starts the workspace from the local base branch with a note; Create fails only when the base is on neither.
- Prompt marks, Copy buttons and the prompt navigator could appear on the wrong lines of a full-screen Claude tab after switching back to it. The tab now stays in the alternate screen when it's shown again.

## [0.3.0] - 2026-11-03

### Added

- Add project creates a new repository or clones one: the dialog offers **Existing folder**, **New repository** and **Clone from URL**. A new repository gets `git init` on the profile's base branch and a first commit with the profile's identity; a clone runs in a terminal in the dialog, so git's prompts work, and a failed clone keeps git's output and adds nothing. On the command line: `relur add --new <path>` and `relur add --clone <url> [<path>]`.
- The project view's **Remote** row has **Change…**, and an `origin` added later to a project without a remote is picked up with a notice. The Changes panel explains what Push and Create PR need.

### Changed

- Linux is no longer beta: Relur has been tested on Ubuntu 24.04 with GNOME. The `.deb` stays the recommended install on Ubuntu 23.10 and later.
- Terminals redraw in full when they're shown, resized or re-themed, and after a lost WebGL context, so no content from the terminal shown before can remain.

### Fixed

- On Linux, logging out could end Relur before it saved what the window remembers (sizes, collapsed panels and other preferences). They're now written to disk shortly after every change and first thing when the app is told to end; a hangup (SIGHUP) now quits like SIGTERM.

## [0.2.0] - 2026-11-02

### Added

- New versions: on the first start Relur asks whether to check GitHub for its latest release once a day; nothing about you or your work is sent. A newer version shows a quiet notice with **Update** (opens your terminal with the install command), **Release notes** and **Skip this version**. **Check for Updates…** and **Check for Updates Automatically** are in the app menu (the Help menu on Linux).
- Continue interrupted work: when Relur stops while Claude is working (quit, logout, an update, a crash), the workspace is marked **Unfinished**. A profile setting continues that work at the next start, one workspace after another and never at the plan limit; otherwise Relur asks once at start which workspaces to continue.
- A workspace that was done but still had background commands running (a dev server, a long test run) is marked **Unfinished** too, with "1 background command was stopped". It's never continued by itself: you choose it in the overview or with **Continue**.
- Changes panel: a draggable divider between the file list and the diff; the list is as tall as its files up to about five rows; clicking its header collapses it to one line with previous and next file (⌥⌘↑ / ⌥⌘↓); in Full view the list is a resizable column.

### Changed

- The quit dialog says what happens to Claude's unfinished work at the next start.
- The Guide: First steps goes on to finishing a task, the Resume page is now **Quitting and resuming**, and the pages cover the Unfinished marker, background commands, the update notice and the Linux menu.

### Fixed

- Quitting while typing in a terminal could show "The database connection is not open" in an error dialog. Once a quit goes ahead, Relur takes no more terminal input or hook events, and closes its database last.

## [0.1.0] - 2026-11-02

### Added

- Parallel Claude Code sessions, each in its own git worktree and branch, created from a task with setup commands and a block of ports.
- Status for every session from Claude Code's hooks: working, needs permission, waiting for input, awaiting approval, done; in the sidebar, the Dock badge, notifications and optional sounds.
- Profiles that keep Claude accounts, settings and projects apart, with a setup check that installs and signs in with Claude Code's own commands.
- The Changes panel with a read-only diff, Commit, Push and Create PR, and the PR badge. The panel is resizable, has a Full view (⇧⌘M) and a Unified / Side by side switch; the view buttons are in the tab bar.
- Skills and workflows from a status file, with gates and Continue; linked repositories in one workspace.
- Plan usage in the status bar, from Claude Code's status line.
- The `relur` command line tool (`add`, `link`, `projects`), the in-app Guide, and Open in editor.
- macOS (Apple Silicon and Intel) and Linux beta builds (AppImage and `.deb`), with an install script. Both Linux builds keep Chromium's sandbox, the AppImage on Ubuntu 23.10 and later once it's listed for it, and the window says so when it runs without it.

[Unreleased]: https://github.com/dino-zecevic/relur/compare/v0.3.2...HEAD
[0.3.2]: https://github.com/dino-zecevic/relur/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/dino-zecevic/relur/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/dino-zecevic/relur/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/dino-zecevic/relur/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/dino-zecevic/relur/releases/tag/v0.1.0
