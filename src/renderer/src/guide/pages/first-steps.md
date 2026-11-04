# First steps

1. **Create a profile.** On first launch {{app}} shows a welcome screen with **Create your first profile**. The wizard asks for a name, a color and which Claude account to use, then checks that Claude Code is ready. See [Creating a profile](create-profile).
2. **Add a project.** Choose a git repository, or a folder that holds several. <kbd>{{key:addProject}}</kbd> See [Adding a project](add-project).
3. **Create a workspace.** Type the task, for example `ENG-1423 Fix login timeout`. <kbd>{{key:newWorkspace}}</kbd> See [New workspace](new-workspace).
4. **Work with Claude.** Claude starts in the new worktree, on the new branch. Type your request in its tab. See [The workspace view](workspace-view).
5. **Finish the task.** **Changes** <kbd>{{key:changes}}</kbd> shows what Claude changed, and takes you through Commit, Push and Create PR. See [Finishing work](finishing-work).

When Claude needs you, the workspace shows a status glyph and the profile tab gets a badge. See [Status glyphs](status-glyphs).

On the first start a bar under the tabs also asks whether {{app}} may check GitHub for new versions; until you answer, it sends nothing. See [Updates and privacy](updates).

You can quit at any time: Claude continues the same conversations when {{app}} starts again, and work it hadn't finished is marked **Unfinished**. See [Quitting and resuming](resume).

## Home

Each profile has a Home <kbd>{{key:home}}</kbd>. Its **Overview** shows what needs you, what is working, what is ready to ship and what can be cleaned up; its **Terminal** is a shell in your home folder that uses the profile's account, for anything that isn't a task. A profile without projects offers **Add your first project** there. See [Home](home).

## Your team's skills and workflow

If your team has its own Claude Code skills and a workflow for tasks, [Set up your team's skills and workflow](team-setup) walks through setting them up.
