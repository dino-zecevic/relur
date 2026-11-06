# What {{app}} is

{{app}} runs several Claude Code sessions side by side. Each task gets its own copy of the repository, a git worktree, on its own branch, so tasks never get in each other's way.

## How it works

- You add a git repository as a project, or have {{app}} create or clone one.
- For each task you create a workspace. {{app}} makes a worktree and a branch for it, prepares it, and starts Claude Code there.
- While Claude works, you start the next task, or answer the one that needs you. The sidebar and [Home](home) show which.

Every session is the regular `claude` command, running in a terminal you can see. {{app}} adds nothing to Claude Code's own settings, and nothing to your repository that git tracks. It has no telemetry or accounts; see [Updates and privacy](updates).

## Accounts

Profiles keep accounts apart: a Work profile and a Personal profile each use their own Claude login, and a repository belongs to one profile only. See [The three building blocks](building-blocks).

## Using this Guide

Open it from the **Guide** tab, the Help menu or <kbd>{{key:guide}}</kbd>, from anywhere. <kbd>{{key:guideSearch}}</kbd> searches every page; <kbd>Esc</kbd> clears the search, and a second <kbd>Esc</kbd> returns to the page. The **?** buttons next to settings open the page at the matching section, and **← Back** <kbd>{{key:guideBack}}</kbd> returns to where you were.
