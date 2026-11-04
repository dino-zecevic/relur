# Start Claude here

**Start Claude here** <kbd>{{key:startClaude}}</kbd> in a project view runs Claude in the main checkout, not in a workspace. **Open shell** <kbd>{{key:newShell}}</kbd> does the same for a terminal. On [Home](home), **Start Claude here** switches to the Terminal tab, types `claude` into the Home terminal and presses <kbd>↵</kbd>, as you would; if another program is running there, it does nothing and says **The home terminal is busy**.

It's good for questions about the code, not for changes.

:::warning Changes
Edits made here land in your main checkout, outside any workspace branch. For changes, start a new workspace.
:::

**Open in editor** <kbd>{{key:openInEditor}}</kbd> opens the main checkout in the project's [editor](open-in-editor).

In a project view, these sessions open as tabs after the project's own tabs (Workspaces, Setup, Skills, Workflow); each closes with its **×**. They have no worktree, status or Changes panel.

Claude here gets the project's [skill sources](skills#how-claude-gets-them), as in a workspace.

When the profile [suspends idle sessions](suspend), Claude here is suspended too once its tab hasn't been shown for that long, and resumes when you show the tab again. To keep it running, right-click its tab and choose **Keep Claude Running**; that's remembered for the project.
