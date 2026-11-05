/**
 * The Guide's files as Vite bundles them: its pages and screenshots. Apart
 * from content.ts, so the web export (scripts/guide-export.ts) can use the
 * rest of the Guide's code in Node.
 */

/** The Markdown files shipped with the app, by page id. */
export function pageFiles(): Record<string, string> {
  const modules = import.meta.glob('./pages/*.md', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;
  return Object.fromEntries(
    Object.entries(modules).map(([file, text]) => [file.replace(/^.*\/|\.md$/g, ''), text]),
  );
}

/** The screenshots shipped with the app, by name: their dark and light URLs. */
export function imageFiles(): Record<string, { dark?: string; light?: string }> {
  const modules = import.meta.glob('./images/*.webp', {
    query: '?url',
    import: 'default',
    eager: true,
  }) as Record<string, string>;
  const out: Record<string, { dark?: string; light?: string }> = {};
  for (const [file, url] of Object.entries(modules)) {
    const m = file.match(/([a-z0-9-]+)-(dark|light)\.webp$/);
    if (!m) throw new Error(`A Guide image must be <name>-dark.webp or <name>-light.webp: ${file}`);
    const name = m[1] as string;
    out[name] = { ...out[name], [m[2] as 'dark' | 'light']: url };
  }
  return out;
}
