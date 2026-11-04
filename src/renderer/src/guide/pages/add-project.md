# Adding a project

Click **Add project** at the bottom of the sidebar <kbd>{{key:addProject}}</kbd>. At the top, choose how:

- **Existing folder**: a repository you already have.
- **New repository**: {{app}} makes one for you.
- **Clone from URL**: {{app}} clones one with git.

← and → move between them. {{app}} never stores credentials: cloning and pushing use your own git setup (SSH keys, credential helpers, CLI logins).

## An existing folder

Type the **Repository path** or click **Browse…** <kbd>{{key:browse}}</kbd>.

{{app}} finds the repository's main checkout (also from a folder inside it, or from one of its worktrees), its remote and its base branch: the remote's default branch, or the checked-out branch when there is no remote. You can change the name, remote and base branch before you click **Add project**. Without a remote, workspaces branch from local branches.

A repository belongs to one profile only. If it's already in another profile, {{app}} says which.

## A new repository

Enter a **Name** and choose the **Parent folder** (**Browse…** <kbd>{{key:browse}}</kbd>). The parent starts at the last one you used in this profile. {{app}} shows the folder it will create, or why it can't:

- The name has to be a plain folder name: no `/`, not starting with `-`, not ending with a space or a dot.
- The folder must not exist yet, or be empty.
- A parent folder inside another repository only gets a warning: the new repository is nested in it.

Under **First commit**, a `README.md` with the name as its heading and a `.gitignore` are ticked; untick both for an empty commit. **Create repository** runs `git init` on the profile's base branch and makes that first commit with the profile's commit identity (Edit profile), so you can create a workspace right away.

A new repository has no remote. Workspaces branch from the local base branch, and the Changes panel compares with it. Push and Create PR need a remote: add one in a shell with `git remote add origin <url>` and {{app}} picks it up by itself, with a short notice. Or choose one under **Remote** in the project view (see below).

## Cloning from a URL

Paste the **Repository URL** and choose the **Parent folder**. The **Folder name** comes from the URL; you can change it. **Clone** runs `git clone` in a terminal inside the dialog, with the profile's environment: type an SSH passphrase or sign in there as you would in your own terminal.

When the clone is done it's added with its remote, and the remote's default branch as the base branch. If git fails, its output stays in the dialog and nothing is added; fix the URL and click **Try again**.

## A folder of repositories

Type or choose a folder that isn't a repository itself, for example `~/Projects`, and {{app}} lists the repositories one level down, each with a checkbox, its remote and its base branch.

- New ones start ticked. Ones already in this profile show **already added**, ones in another profile show **in <profile>**; both can't be ticked. **Select all** and **Select none** tick or untick the rest.
- Hidden folders, `node_modules`, submodules, linked worktrees and bare repositories are left out.
- The worktree location you pick applies to all of them. **Add N projects** adds each on its own and then lists what was added and what wasn't, with the reason.

## Where its worktrees go

Under **Worktrees**, choose **Default** or **Choose folder…**. See [Where worktrees go](worktrees).

## The project view

Click a project's name in the sidebar to open its view; it also opens after you add one. Its header has:

- **New workspace** <kbd>{{key:newWorkspace}}</kbd>, **Open shell** <kbd>{{key:newShell}}</kbd>, **Start Claude here** <kbd>{{key:startClaude}}</kbd> and **Open in editor** <kbd>{{key:openInEditor}}</kbd>. All but the first run in the main checkout; see [Start Claude here](start-claude-here).
- **Path**, **Base branch**, **Remote** and **Worktrees**, and **Memory** while any of the project's Claude sessions runs ([Memory](memory)). **Remote** has **Change…**: choose one of the repository's remotes, or none. **Worktrees** has **Change…** (and **Use default** once you chose a folder).
- **Remove…**; see [Removing a project](remove-project).

Below are its tabs:

| Tab | What it has |
| --- | --- |
| Workspaces | The project's workspaces: status, task, title, branch, [memory](memory#in-the-project-view) and last activity, and the workflow status when there is a workflow. Click one to open it, or Tab to the table, move with ↑ ↓ and open with ↵. Below, [Other worktrees](adopting-worktrees) |
| Setup | The project's **Editor** and its [setup and teardown commands](workspace-setup) |
| Skills | Which of the profile's [skill sources](skills#per-project) apply to this project |
| Workflow | The profile's [workflow](workflows#per-project), an override for this project, or none, and its own Start prompt |

## From a terminal

```
{{cli}} add . --profile personal
{{cli}} add --new ~/code/my-app --profile personal
{{cli}} add --clone git@example.com:team/app.git --profile personal
```

See [The command line tool](cli).
