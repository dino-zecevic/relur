# The three building blocks

{{app}} is built from three things: profiles, projects and workspaces. Each profile has its projects, and each project its workspaces.

:::diagram
:::

## Profile

One Claude account and its projects, for example Work and Personal. Profiles are the tabs at the top of the window; <kbd>{{keys:profile}}</kbd> switch between them, in tab order. Everything a profile starts, Claude and every terminal, uses that profile's account.

## Project

A git repository on your computer. Its main checkout, where you normally work, stays as it is. A repository can belong to only one profile.

## Workspace

One task: its own worktree, its own branch, its own Claude and its own terminals. Workspaces are listed under their project in the [sidebar](sidebar).

:::tip
Start a new workspace for each task, even a small one. Its changes stay on their own branch until you merge them.
:::
