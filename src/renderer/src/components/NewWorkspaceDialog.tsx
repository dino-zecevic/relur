import { branchFromTemplate } from '@shared/branch';
import type { Profile, Project } from '@shared/schemas';
import { parseTask } from '@shared/tasks';
import { LINK_TRUST_NOTE } from '@shared/workspaces';
import { useMutation, useQuery } from '@tanstack/react-query';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { GuideLink } from '../guide/link';
import { type AppRouterOutputs, useTRPC } from '../trpc';
import { button, inputClass, Kbd, keyHint, labelClass } from '../ui/controls';
import { remember } from '../ui/remember';
import { Modal, ModalFooter } from './Modal';

export type CreatedWorkspace = AppRouterOutputs['workspaces']['create'];

/** A value that settles `ms` after it stops changing. */
function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

/** The projects last ticked under Also in, per project (spec §21.2). */
const alsoInKey = (projectId: string) => `alsoIn:${projectId}`;
function rememberedAlsoIn(projectId: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(alsoInKey(projectId)) ?? '[]');
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}
function rememberAlsoIn(projectId: string, ids: string[]): void {
  remember(alsoInKey(projectId), JSON.stringify(ids));
}

/**
 * New workspace (spec §7.1): one Task field (a leading `ABC-123` or `#42` is
 * the id, the rest the title), a branch derived from the profile's branch
 * template until edited, and the base branch inherited from the project.
 * "Run setup, then start Claude" shows when the project has setup commands
 * (spec §8.3). **Also in** links the profile's other projects (§21.2). Any
 * text gives a branch; a taken one from the task becomes the next free name.
 * A key alone is looked up first when the profile has a task lookup (§13.7):
 * the title fills in and the workspace is created; a key the lookup doesn't
 * know is created without a title; a failed lookup offers Create anyway.
 */
export function NewWorkspaceDialog({
  profile,
  projects,
  initialProject,
  onClose,
  onCreated,
}: {
  profile: Profile;
  /** The profile's projects. */
  projects: Project[];
  initialProject: Project | null;
  onClose: () => void;
  onCreated: (created: CreatedWorkspace) => void;
}) {
  const trpc = useTRPC();
  const [projectId, setProjectId] = useState(initialProject?.id ?? projects[0]?.id ?? '');
  const [taskText, setTaskText] = useState('');
  const { id: taskId, title } = parseTask(taskText);
  // Edits; null means "use the derived or inherited value".
  const [branchEdit, setBranch] = useState<string | null>(null);
  const [baseEdit, setBase] = useState<string | null>(null);

  const project = projects.find((p) => p.id === projectId) ?? null;
  const others = projects.filter((p) => p.id !== projectId);
  const [alsoIn, setAlsoIn] = useState<string[]>(() =>
    rememberedAlsoIn(projectId).filter((id) => others.some((p) => p.id === id)),
  );
  const [alsoRemembered, setAlsoRemembered] = useState(alsoIn.length > 0);
  const linkedProjectIds = others.filter((p) => alsoIn.includes(p.id)).map((p) => p.id);
  const derived = branchFromTemplate(profile.defaults.branchTemplate, {
    id: taskId ?? '',
    title,
  });
  // The branch asked for: typed, else from the task.
  const wanted = branchEdit ?? derived;
  const base = baseEdit ?? project?.baseBranch ?? profile.defaults.baseBranch;
  // Spec §7.3: each remote is asked, and its base fetched, as the dialog opens
  // (again for another project, base or Also in), so Create can reuse it.
  const prepareRemotes = useMutation(trpc.workspaces.prepareRemotes.mutationOptions());
  const preparedBase = useDebounced(base.trim(), 500);
  const preparedLinks = linkedProjectIds.join('\n');
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per project, links and base
  useEffect(() => {
    if (!project || !preparedBase) return;
    prepareRemotes.mutate({
      projectId: project.id,
      linkedProjectIds: preparedLinks ? preparedLinks.split('\n') : [],
      baseBranch: preparedBase,
    });
  }, [project?.id, preparedLinks, preparedBase]);

  const checkedBranch = useDebounced(wanted.trim(), 250);
  const check = useQuery(
    trpc.workspaces.branchCheck.queryOptions(
      { projectId, branch: checkedBranch, linkedProjectIds },
      { enabled: Boolean(project && checkedBranch) },
    ),
  );
  const checked = checkedBranch === wanted.trim() && wanted.trim() ? (check.data ?? null) : null;
  // A taken branch from the task becomes the next free name (spec §7.1); a
  // typed one is the user's to change, with the free name offered.
  const renamed =
    branchEdit === null && checked?.problem && checked.suggestion ? checked.suggestion : null;
  const branch = branchEdit ?? renamed ?? derived;
  const bases = useQuery(
    trpc.workspaces.baseBranches.queryOptions({ projectId }, { enabled: Boolean(project) }),
  );
  const create = useMutation(trpc.workspaces.create.mutationOptions());
  const lookup = project ? (profile.taskLookup ?? null) : null;
  const lookupTitle = useMutation(trpc.workflow.lookupTitle.mutationOptions());
  const cancelLookup = useMutation(trpc.workflow.cancelLookup.mutationOptions());
  // The running lookup; a stale answer (after Cancel) is ignored.
  const [lookingUp, setLookingUp] = useState<{ id: string; requestId: string } | null>(null);
  const [lookupError, setLookupError] = useState<{
    id: string;
    message: string;
    /** Claude's own explanation, when it gave one. */
    detail?: string;
  } | null>(null);
  const running = useRef<string | null>(null);
  const taskInput = useRef<HTMLInputElement>(null);
  const stopLookup = () => {
    if (running.current) cancelLookup.mutate({ requestId: running.current });
    running.current = null;
    setLookingUp(null);
  };
  // Closing the dialog stops a lookup still running.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only on unmount
  useEffect(() => () => stopLookup(), []);
  const setup = useQuery(
    trpc.projects.setup.queryOptions({ projectId }, { enabled: Boolean(project), staleTime: 0 }),
  );
  const hasSetup = (setup.data?.setup.length ?? 0) > 0;
  const [runSetup, setRunSetup] = useState(true);

  const branchError = !renamed && checked?.problem ? checked.problem : null;
  const canCreate =
    project !== null &&
    (title !== '' || taskId !== null) &&
    branch.trim() !== '' &&
    base.trim() !== '' &&
    !branchError &&
    !create.isPending &&
    !lookingUp;

  /** Creates the workspace; `note` joins the notice the window shows after (spec §7.1). */
  const createWith = (
    project: Project,
    taskTitle: string,
    taskBranch: string,
    note: string | null = null,
  ) => {
    create.mutate(
      {
        projectId: project.id,
        taskId,
        title: taskTitle,
        branch: taskBranch.trim(),
        baseBranch: base.trim(),
        runSetup: hasSetup ? runSetup : undefined,
        linkedProjectIds,
        // A branch from the task, not typed: a taken one gets the next free name.
        uniqueBranch: branchEdit === null,
      },
      {
        onSuccess: (created) =>
          onCreated({ ...created, notes: [...(note ? [note] : []), ...created.notes] }),
      },
    );
    rememberAlsoIn(project.id, linkedProjectIds);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canCreate || !project) return;
    if (!taskId || title || !lookup) {
      createWith(project, title, branch);
      return;
    }
    // Create anyway after a failed lookup: no title, the branch from what was typed.
    if (lookupError?.id === taskId) {
      createWith(project, '', branch);
      return;
    }
    // A key alone: look its title up, then create (spec §13.7).
    const id = taskId;
    const requestId = crypto.randomUUID();
    running.current = requestId;
    setLookupError(null);
    setLookingUp({ id, requestId });
    lookupTitle.mutate(
      { requestId, profileId: profile.id, projectId: project.id, taskId: id, lookup: null },
      {
        onSettled: (result, error) => {
          if (running.current !== requestId) return;
          running.current = null;
          setLookingUp(null);
          if (result?.ok) {
            setTaskText(`${id} ${result.title}`);
            createWith(
              project,
              result.title,
              branchEdit ??
                branchFromTemplate(profile.defaults.branchTemplate, { id, title: result.title }),
            );
            return;
          }
          // An id the lookup doesn't know: created anyway, without a title.
          if (result && !result.ok && result.notFound) {
            createWith(
              project,
              '',
              branch,
              `${id} wasn't found; the branch is named after what you typed`,
            );
            return;
          }
          setLookupError({
            id,
            message: result?.message ?? error?.message ?? 'The lookup failed',
            detail: result && !result.ok ? result.detail : undefined,
          });
          requestAnimationFrame(() => {
            const input = taskInput.current;
            input?.focus();
            input?.setSelectionRange(input.value.length, input.value.length);
          });
        },
      },
    );
  };

  return (
    <Modal
      title="New workspace"
      description={
        project ? (
          <>
            In <span className="font-mono text-fg">{project.name}</span> · creates a worktree and
            branch.
          </>
        ) : (
          'Add a project first.'
        )
      }
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-3 text-md">
        {initialProject === null && projects.length > 1 ? (
          <div>
            <label htmlFor="ws-project" className={labelClass}>
              Project
            </label>
            <select
              id="ws-project"
              className={`${inputClass} font-mono text-sm`}
              value={projectId}
              onChange={(e) => {
                const id = e.target.value;
                setProjectId(id);
                setBase(null);
                const remembered = rememberedAlsoIn(id).filter((o) => o !== id);
                setAlsoIn(remembered);
                setAlsoRemembered(remembered.length > 0);
              }}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {project && others.length > 0 ? (
          <fieldset data-also-in className="space-y-1.5">
            <legend className="flex w-full items-baseline gap-2 text-sm text-fg-muted">
              <span>Also in</span>
              <span className="flex-1" />
              {alsoRemembered && alsoIn.length > 0 ? (
                <span className="text-xs text-fg-subtle">Last used with {project.name}</span>
              ) : null}
              <GuideLink
                to="tasks-across-repositories#creating-one"
                label="Tasks across repositories"
                before={onClose}
              />
            </legend>
            {/* Ten rows of 30px with their 1px gaps, then it scrolls. */}
            <div className="flex max-h-[calc(var(--spacing)*75+9px)] flex-col gap-px overflow-y-auto rounded-md border border-line bg-line">
              {others.map((p) => (
                <label
                  key={p.id}
                  className="flex h-7.5 shrink-0 items-center gap-2.5 bg-raised px-2.5 text-md hover:bg-selected"
                >
                  <input
                    type="checkbox"
                    checked={alsoIn.includes(p.id)}
                    onChange={(e) => {
                      setAlsoRemembered(false);
                      setAlsoIn((ids) =>
                        e.target.checked ? [...ids, p.id] : ids.filter((id) => id !== p.id),
                      );
                    }}
                  />
                  <span className="font-mono text-sm">{p.name}</span>
                  <span className="flex-1" />
                  <span className="font-mono text-xs text-fg-subtle">
                    ← {p.baseBranch ?? profile.defaults.baseBranch}
                  </span>
                </label>
              ))}
            </div>
            {linkedProjectIds.length > 0 ? (
              <p className="text-sm text-fg-muted">
                One Claude works in all of them, starting in {project.name}.
              </p>
            ) : null}
            <p data-trust-note className="text-sm text-fg-subtle">
              {LINK_TRUST_NOTE}
            </p>
          </fieldset>
        ) : null}

        <div>
          <label htmlFor="ws-task" className={`${labelClass} flex items-center gap-1.5`}>
            Task{' '}
            <GuideLink to="new-workspace#the-task-field" label="The Task field" before={onClose} />
          </label>
          <input
            id="ws-task"
            className={inputClass}
            placeholder="PROJ-123 Fix login timeout"
            // biome-ignore lint/a11y/noAutofocus: the task is the field you start with
            autoFocus
            data-autofocus
            ref={taskInput}
            readOnly={lookingUp !== null}
            value={taskText}
            onChange={(e) => {
              setTaskText(e.target.value);
              setLookupError(null);
            }}
          />
          {taskText.trim() ? (
            <p data-task-preview className="mt-1 flex gap-3 text-sm text-fg-muted">
              {taskId ? (
                <span>
                  ID <span className="font-mono text-fg">{taskId}</span>
                </span>
              ) : null}
              <span className="min-w-0 truncate">
                Title{' '}
                <span className="text-fg">
                  {title || (taskId && lookup ? 'looked up when you create' : '—')}
                </span>
              </span>
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="ws-branch" className={labelClass}>
            Branch name
          </label>
          <div className="relative">
            <input
              id="ws-branch"
              className={`${inputClass} ${linkedProjectIds.length > 0 ? 'pr-44' : 'pr-28'} font-mono text-sm`}
              spellCheck={false}
              value={branch}
              aria-invalid={Boolean(branchError) || undefined}
              onChange={(e) => setBranch(e.target.value)}
            />
            {branchEdit === null ? (
              <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm text-fg-subtle">
                from the task
                {linkedProjectIds.length > 0 ? ` · same in all ${linkedProjectIds.length + 1}` : ''}
              </span>
            ) : null}
          </div>
          {renamed ? (
            <p data-branch-renamed className="mt-1 text-sm text-fg-muted">
              {checked?.problem}; using <span className="font-mono text-fg">{renamed}</span>
            </p>
          ) : null}
          {branchError ? (
            <p role="alert" className="mt-1 flex items-center gap-2 text-sm text-st-error">
              <span>✕ {branchError}</span>
              {checked?.suggestion ? (
                <button
                  type="button"
                  data-use-branch
                  className={button('ghost', 'sm')}
                  onClick={() => setBranch(checked.suggestion)}
                >
                  Use <span className="font-mono">{checked.suggestion}</span>
                </button>
              ) : null}
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="ws-base" className={labelClass}>
              Base branch
            </label>
            <input
              id="ws-base"
              className={`${inputClass} font-mono text-sm`}
              spellCheck={false}
              list="ws-base-branches"
              value={base}
              onChange={(e) => setBase(e.target.value)}
            />
            <datalist id="ws-base-branches">
              {(bases.data ?? []).map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </div>
        </div>

        {hasSetup ? (
          <label className="flex items-start gap-2 text-md">
            <input
              type="checkbox"
              id="ws-run-setup"
              className="mt-0.5"
              checked={runSetup}
              onChange={(e) => setRunSetup(e.target.checked)}
            />
            <span>
              Run setup, then start Claude with the task brief
              <span className="block text-sm text-fg-subtle">
                {setup.data?.source === 'repo'
                  ? 'Setup from the repository'
                  : 'Setup from the project settings'}
                : <span className="font-mono">{setup.data?.setup.join(' && ')}</span>
                {linkedProjectIds.length > 0
                  ? '. Setup runs in every repository; Claude starts once all have passed.'
                  : null}
              </span>
            </span>
          </label>
        ) : null}
        {setup.data?.error ? (
          <p role="alert" className="text-sm text-st-error select-text">
            ✕ {setup.data.error}
          </p>
        ) : null}

        {lookingUp ? (
          <p data-lookup-running className="flex items-center gap-2 text-sm text-fg-muted">
            Looking up <span className="font-mono text-fg">{lookingUp.id}</span>…
            <button type="button" className={button('ghost', 'sm')} onClick={stopLookup}>
              Stop
            </button>
          </p>
        ) : null}
        {lookupError ? (
          <div data-lookup-error role="alert" className="space-y-0.5 text-sm select-text">
            <p className="text-st-error">
              ✕ Couldn't look up {lookupError.id}: {lookupError.message}.
            </p>
            {lookupError.detail ? (
              <p data-lookup-detail className="text-fg-muted">
                Claude: {lookupError.detail}
              </p>
            ) : null}
            <p className="text-fg-muted">
              Create anyway names the branch after what you typed, or type the title after the id.
            </p>
          </div>
        ) : null}
        {create.isPending ? (
          <p className="text-sm text-fg-muted">
            {project?.remote ? `Fetching ${project.remote}/${base}, then a` : 'A'}dding the worktree
            {linkedProjectIds.length > 0 ? 's' : ''}…
          </p>
        ) : null}
        {create.error ? (
          <p role="alert" className="text-sm text-st-error select-text">
            ✕ {create.error.message}
          </p>
        ) : null}

        <ModalFooter>
          <button type="button" className={button('ghost', 'lg')} onClick={onClose}>
            Cancel <Kbd>Esc</Kbd>
          </button>
          <button type="submit" className={button('primary', 'lg')} disabled={!canCreate}>
            {lookupError ? 'Create anyway' : 'Create workspace'}{' '}
            <Kbd onFg>{keyHint('confirm')}</Kbd>
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
