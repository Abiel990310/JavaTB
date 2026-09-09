/**
 * Reading and problem-solving progress, kept in this browser only.
 * There is no account and nothing leaves the machine.
 */

const KEY = 'javatb-progress-v1';

export interface Progress {
  /** Chapter slugs marked read. */
  read: string[];
  /** Exercise ids solved. */
  solved: string[];
  /** Exercise id -> the reader's latest submission. */
  drafts: Record<string, string>;
  /** Last chapter opened, for "resume where you left off". */
  last: { url: string; title: string } | null;
}

const EMPTY: Progress = { read: [], solved: [], drafts: {}, last: null };

function load(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<Progress>;
    return {
      read: parsed.read ?? [],
      solved: parsed.solved ?? [],
      drafts: parsed.drafts ?? {},
      last: parsed.last ?? null,
    };
  } catch {
    return { ...EMPTY };
  }
}

function save(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode, quota, or storage disabled — progress is a nicety */
  }
}

export const progress = {
  get: load,

  isRead: (slug: string): boolean => load().read.includes(slug),

  toggleRead(slug: string): boolean {
    const p = load();
    const i = p.read.indexOf(slug);
    if (i === -1) p.read.push(slug);
    else p.read.splice(i, 1);
    save(p);
    return i === -1;
  },

  isSolved: (id: string): boolean => load().solved.includes(id),

  markSolved(id: string): void {
    const p = load();
    if (!p.solved.includes(id)) {
      p.solved.push(id);
      save(p);
    }
  },

  draft: (id: string): string | null => load().drafts[id] ?? null,

  saveDraft(id: string, code: string): void {
    const p = load();
    p.drafts[id] = code;
    // Keep the newest 60 drafts so storage cannot grow without bound.
    const keys = Object.keys(p.drafts);
    if (keys.length > 60) delete p.drafts[keys[0]];
    save(p);
  },

  visit(url: string, title: string): void {
    const p = load();
    p.last = { url, title };
    save(p);
  },

  reset(): void {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* nothing to do */
    }
  },
};
