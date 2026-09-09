import { progress } from './progress.ts';

/** Theme toggle, sidebar, scroll-spy, progress marks, and problem filters. */

export function setupTheme(): void {
  const toggle = document.getElementById('theme-toggle');
  toggle?.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('tb-theme', next);
    } catch {
      /* storage may be unavailable; the toggle still works for this page */
    }
  });
}

export function setupSidebar(): void {
  const toggle = document.getElementById('menu-toggle');
  const sidebar = document.getElementById('sidebar');
  const scrim = document.getElementById('scrim');
  if (!toggle || !sidebar || !scrim) return;

  const setOpen = (open: boolean) => {
    sidebar.classList.toggle('is-open', open);
    scrim.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  };

  toggle.addEventListener('click', () => setOpen(!sidebar.classList.contains('is-open')));
  scrim.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false);
  });

  // Keep the current chapter visible in a long contents list.
  sidebar.querySelector('.is-active')?.scrollIntoView({ block: 'center' });
}

/** Highlight the heading currently in view in the right-hand rail. */
export function setupScrollSpy(): void {
  const links = [...document.querySelectorAll<HTMLAnchorElement>('#rail-list a')];
  if (links.length === 0) return;

  const byId = new Map(links.map((a) => [a.getAttribute('href')?.slice(1) ?? '', a]));
  const headings = [...byId.keys()]
    .map((id) => document.getElementById(id))
    .filter((el): el is HTMLElement => el !== null);

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        for (const link of links) link.classList.remove('is-current');
        byId.get(entry.target.id)?.classList.add('is-current');
      }
    },
    // Trigger when a heading crosses the upper third of the viewport.
    { rootMargin: '-80px 0px -66% 0px', threshold: 0 },
  );
  for (const heading of headings) observer.observe(heading);
}

export function setupProgress(): void {
  const article = document.querySelector<HTMLElement>('.prose[data-chapter]');
  if (article) {
    const slug = article.dataset.chapter!;
    const title = document.querySelector('h1')?.textContent ?? slug;
    progress.visit(location.pathname, title);

    const button = document.getElementById('mark-done');
    if (button) {
      const paint = () => {
        const read = progress.isRead(slug);
        button.textContent = read ? '✓ Read' : 'Mark as read';
        button.classList.toggle('is-done', read);
      };
      paint();
      button.addEventListener('click', () => {
        progress.toggleRead(slug);
        paint();
      });
    }
  }

  // Mark chapters already read in the contents list.
  const read = new Set(progress.get().read);
  for (const link of document.querySelectorAll<HTMLAnchorElement>('.nav__list a')) {
    const slug = link.getAttribute('href')?.split('/').filter(Boolean).pop();
    if (slug && read.has(slug)) link.classList.add('is-read');
  }

  const resume = document.getElementById('resume-button') as HTMLButtonElement | null;
  const last = progress.get().last;
  if (resume && last) {
    resume.hidden = false;
    resume.textContent = `Resume: ${last.title}`;
    resume.addEventListener('click', () => {
      location.href = last.url;
    });
  }

  // Solved markers on the problem list.
  const solved = new Set(progress.get().solved);
  for (const marker of document.querySelectorAll<HTMLElement>('[data-status-for]')) {
    if (solved.has(marker.dataset.statusFor!)) {
      marker.classList.add('is-solved');
      marker.title = 'Solved';
    }
  }
}

export function setupProblemFilters(): void {
  const list = document.getElementById('problem-list');
  if (!list) return;
  const empty = document.getElementById('problem-empty');
  const items = [...list.querySelectorAll<HTMLElement>('.problem')];

  let difficulty = 'all';
  let topic = 'all';

  const apply = () => {
    let shown = 0;
    for (const item of items) {
      const topics = (item.dataset.topics ?? '').split(' ');
      const ok =
        (difficulty === 'all' || item.dataset.difficulty === difficulty) &&
        (topic === 'all' || topics.includes(topic));
      item.hidden = !ok;
      if (ok) shown += 1;
    }
    if (empty) empty.hidden = shown > 0;
  };

  const wire = (attribute: string, set: (value: string) => void) => {
    const buttons = [...document.querySelectorAll<HTMLElement>(`[data-filter-${attribute}]`)];
    for (const button of buttons) {
      button.addEventListener('click', () => {
        for (const other of buttons) other.classList.remove('is-on');
        button.classList.add('is-on');
        set(button.dataset[`filter${attribute[0].toUpperCase()}${attribute.slice(1)}`] ?? 'all');
        apply();
      });
    }
  };

  wire('difficulty', (v) => {
    difficulty = v;
  });
  wire('topic', (v) => {
    topic = v;
  });
}
