/**
 * Full-text search over chapter titles, headings, and prose.
 *
 * The index is a single JSON file built at compile time, small enough
 * (a few hundred KB) that scoring it in a loop is faster than the round trip
 * to any search service.
 */

interface Entry {
  slug: string;
  title: string;
  part: string;
  url: string;
  summary: string;
  headings: { id: string; text: string }[];
  text: string;
}

interface Hit {
  entry: Entry;
  score: number;
  /** Heading to jump to, when a heading matched more strongly than the page. */
  anchor?: { id: string; text: string };
  snippet: string;
}

let index: Entry[] | null = null;

async function loadIndex(): Promise<Entry[]> {
  if (index) return index;
  const res = await fetch(`${import.meta.env.BASE_URL}data/book.json`);
  const data = (await res.json()) as { search: Entry[] };
  index = data.search;
  return index;
}

function snippetAround(text: string, term: string): string {
  const at = text.toLowerCase().indexOf(term);
  if (at === -1) return text.slice(0, 120);
  const start = Math.max(0, at - 50);
  return `${start > 0 ? '…' : ''}${text.slice(start, at + 90)}…`;
}

function score(entry: Entry, terms: string[]): Hit | null {
  let total = 0;
  let anchor: { id: string; text: string } | undefined;
  const title = entry.title.toLowerCase();
  const summary = entry.summary.toLowerCase();
  const body = entry.text.toLowerCase();

  for (const term of terms) {
    let termScore = 0;
    if (title.includes(term)) termScore += title.startsWith(term) ? 60 : 40;
    if (summary.includes(term)) termScore += 12;

    for (const heading of entry.headings) {
      if (heading.text.toLowerCase().includes(term)) {
        termScore += 20;
        anchor ??= heading;
      }
    }

    const occurrences = body.split(term).length - 1;
    termScore += Math.min(occurrences * 2, 14);

    // Every term must appear somewhere, so results are an AND, not an OR.
    if (termScore === 0) return null;
    total += termScore;
  }

  return {
    entry,
    score: total,
    anchor,
    snippet: snippetAround(entry.text, terms[0]),
  };
}

export function setupSearch(): void {
  const trigger = document.getElementById('search-trigger');
  if (!trigger) return;

  const dialog = document.createElement('dialog');
  dialog.className = 'search';
  dialog.innerHTML = `
    <form method="dialog" class="search__form" role="search">
      <input class="search__input" type="search" placeholder="Search the book" aria-label="Search the book" autocomplete="off">
    </form>
    <ul class="search__results" role="listbox"></ul>
    <p class="search__hint"><kbd>↑</kbd><kbd>↓</kbd> to move · <kbd>Enter</kbd> to open · <kbd>Esc</kbd> to close</p>`;
  document.body.append(dialog);

  const input = dialog.querySelector<HTMLInputElement>('.search__input')!;
  const results = dialog.querySelector<HTMLUListElement>('.search__results')!;
  let hits: Hit[] = [];
  let selected = 0;

  const paint = () => {
    results.innerHTML = '';
    if (hits.length === 0) {
      results.innerHTML = input.value.trim()
        ? '<li class="search__empty">Nothing matched. Try a single word — <em>lvalue</em>, <em>lifetime</em>, <em>constexpr</em>.</li>'
        : '';
      return;
    }
    hits.forEach((hit, i) => {
      const item = document.createElement('li');
      item.className = `search__hit ${i === selected ? 'is-selected' : ''}`;
      const href = hit.anchor ? `${hit.entry.url}#${hit.anchor.id}` : hit.entry.url;
      item.innerHTML = `<a href="${href}">
        <span class="search__part">${hit.entry.part}</span>
        <span class="search__title">${hit.entry.title}${hit.anchor ? ` <span class="search__anchor">› ${hit.anchor.text}</span>` : ''}</span>
        <span class="search__snippet">${hit.snippet}</span>
      </a>`;
      results.append(item);
    });
  };

  const search = async () => {
    const query = input.value.trim().toLowerCase();
    if (query.length < 2) {
      hits = [];
      paint();
      return;
    }
    const entries = await loadIndex();
    const terms = query.split(/\s+/);
    hits = entries
      .map((entry) => score(entry, terms))
      .filter((hit): hit is Hit => hit !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    selected = 0;
    paint();
  };

  const open = () => {
    dialog.showModal();
    input.value = '';
    hits = [];
    paint();
    input.focus();
    void loadIndex();
  };

  trigger.addEventListener('click', open);
  input.addEventListener('input', () => void search());

  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      selected = Math.max(0, Math.min(hits.length - 1, selected + (e.key === 'ArrowDown' ? 1 : -1)));
      paint();
      results.children[selected]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const link = results.children[selected]?.querySelector('a');
      if (link) location.href = link.getAttribute('href')!;
    }
  });

  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? '');
    if (typing) return;
    if (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key === 'k')) {
      e.preventDefault();
      open();
    }
  });
}
