/**
 * Where the site is deployed.
 *
 * At the domain root (a custom domain, or `npm run dev`) this is `/`. On
 * GitHub Pages for a project repo the site lives under `/<repo>/`, so every
 * generated link, asset reference, and runtime fetch has to carry that prefix
 * or it resolves against the domain root and 404s.
 *
 * Set it with TB_BASE at build time; the deploy workflow does.
 */
const raw = process.env.TB_BASE ?? '/';
const leading = raw.startsWith('/') ? raw : `/${raw}`;

export const BASE = leading.endsWith('/') ? leading : `${leading}/`;

/** Turn a site-root-relative path into a deployable URL. */
export function url(path: string): string {
  return `${BASE}${path.replace(/^\/+/, '')}`;
}
