# Memory

{{app}} shows how much memory your Claude sessions use, so you can find the workspace whose dev server or MCP servers grew and stop it.

## What counts

Each running Claude session is measured together with every process it started: MCP servers, the shells of its Bash tool, background commands and dev servers. The numbers are resident memory, what the processes hold in RAM right now.

- **Claude** is Claude Code's own process.
- **Other** is everything it started, named by process, such as **node dev server**, **node MCP server** or **zsh**.

Shells you open yourself in a workspace's terminal tabs aren't counted, and neither is a process that detaches from Claude and keeps running on its own.

{{app}} measures every 10 seconds, and only while its window is visible. A minimized or hidden window measures nothing.

## In the status bar

**Sessions** next to the plan usage is the total of every running Claude session, in all profiles. Hover it to see the five largest workspaces, each split into Claude and what it started, for example:

```
ABC-142  1.5 GB (Claude 300 MB, other 1.2 GB: node dev server)
```

The last line is {{app}}'s own memory: its window and helper processes.

## In the project view

The project's **Workspaces** table has a **Memory** column. Hover a number to see the split; click the column's header to sort by it, largest first, then smallest first, then back to the usual order. Workspaces without a running Claude have no number.

Above the tabs, **Memory** is the total of the project's running sessions, those in its workspaces and in its main checkout.

:::tip
A dev server that Claude started keeps running after Claude has finished its turn. If a workspace is larger than you expect, look in its Claude tab for background commands, or stop Claude there.
:::
