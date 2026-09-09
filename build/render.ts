import { escapeHtml } from './markdown.ts';
import { url } from './base.ts';
import type { Book, Chapter, NavEntry, Part } from './types.ts';

export interface Assets {
  /** Script tags/paths to inject; differs between dev and build. */
  readonly js: readonly string[];
  readonly css: readonly string[];
}

interface ShellOptions {
  title: string;
  description: string;
  /** Body of <main>, already rendered. */
  main: string;
  book: Book;
  assets: Assets;
  /** Chapter slug currently open, for sidebar highlighting. */
  currentSlug?: string;
  /** Extra classes on <body>, e.g. for wide layouts. */
  bodyClass?: string;
  /** Right-hand rail markup, if the page has one. */
  rail?: string;
}

const READING_WPM = 190;

export function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / READING_WPM));
}

/** Set the theme before first paint so the page never flashes the wrong one. */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('tb-theme');if(!t){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.dataset.theme=t;}catch(e){}})();`;

function sidebar(book: Book, currentSlug?: string): string {
  const parts = book.parts
    .map((part) => {
      const open = part.chapters.some((c) => c.slug === currentSlug) ? ' open' : '';
      const items = part.chapters
        .map((ch) => {
          const active = ch.slug === currentSlug ? ' class="is-active" aria-current="page"' : '';
          const draft = ch.status === 'draft' ? '<span class="nav__badge">draft</span>' : '';
          return `<li><a href="${url(`${part.slug}/${ch.slug}/`)}"${active}><span class="nav__num">${part.order}.${ch.order}</span><span class="nav__text">${escapeHtml(ch.navTitle)}</span>${draft}</a></li>`;
        })
        .join('');
      return `<details class="nav__part"${open}><summary><span class="nav__part-num">Part ${part.order}</span>${escapeHtml(part.title)}</summary><ul class="nav__list">${items}</ul></details>`;
    })
    .join('');

  return `<nav class="sidebar" id="sidebar" aria-label="Book contents">
  <div class="sidebar__inner">
    <a class="sidebar__link" href="${url('')}">Start here</a>
    <a class="sidebar__link" href="${url('practice/')}">Practice problems</a>
    <a class="sidebar__link" href="${url('reference/')}">Quick reference</a>
    <a class="sidebar__link" href="${url('progress/')}">Progress</a>
    <hr class="sidebar__rule">
    ${parts}
  </div>
</nav>`;
}

function header(book: Book): string {
  return `<header class="topbar">
  <button class="topbar__menu" id="menu-toggle" aria-label="Toggle contents" aria-expanded="false">
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round"/></svg>
  </button>
  <a class="topbar__brand" href="${url('')}">${escapeHtml(book.title)}</a>
  <div class="topbar__spacer"></div>
  <button class="search-trigger" id="search-trigger" aria-label="Search the book">
    <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><circle cx="9" cy="9" r="5.5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M13 13l4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
    <span>Search</span><kbd>/</kbd>
  </button>
  <button class="icon-button" id="theme-toggle" aria-label="Switch theme" title="Switch theme">
    <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true"><path d="M10 2.5a7.5 7.5 0 1 0 7.5 7.5A6 6 0 0 1 10 2.5Z" fill="currentColor"/></svg>
  </button>
</header>`;
}

export function shell(o: ShellOptions): string {
  const css = o.assets.css.map((h) => `<link rel="stylesheet" href="${h}">`).join('\n  ');
  const js = o.assets.js.map((s) => `<script type="module" src="${s}"></script>`).join('\n  ');

  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(o.title)}</title>
  <meta name="description" content="${escapeHtml(o.description)}">
  <meta name="color-scheme" content="light dark">
  <link rel="icon" href="${url('favicon.svg')}" type="image/svg+xml">
  <script>${THEME_SCRIPT}</script>
  ${css}
</head>
<body class="${o.bodyClass ?? ''}">
  ${header(o.book)}
  <div class="layout">
    ${sidebar(o.book, o.currentSlug)}
    <main class="content" id="content">
      ${o.main}
    </main>
    ${o.rail ?? '<div class="rail" aria-hidden="true"></div>'}
  </div>
  <div class="scrim" id="scrim" hidden></div>
  ${js}
</body>
</html>`;
}

function objectiveList(chapter: Chapter): string {
  if (chapter.objectives.length === 0) return '';
  const items = chapter.objectives.map((o) => `<li>${escapeHtml(o)}</li>`).join('');
  return `<section class="objectives">
    <h2 class="objectives__title">By the end of this chapter you can</h2>
    <ul>${items}</ul>
  </section>`;
}

function prevNext(nav: readonly NavEntry[], slug: string): string {
  const i = nav.findIndex((n) => n.slug === slug);
  const prev = i > 0 ? nav[i - 1] : null;
  const next = i >= 0 && i < nav.length - 1 ? nav[i + 1] : null;
  const link = (entry: NavEntry | null, dir: 'prev' | 'next') =>
    entry
      ? `<a class="pager__link pager__link--${dir}" href="${entry.url}">
           <span class="pager__dir">${dir === 'prev' ? 'Previous' : 'Next'}</span>
           <span class="pager__title">${escapeHtml(entry.title)}</span>
         </a>`
      : '<span></span>';
  return `<nav class="pager" aria-label="Chapter navigation">${link(prev, 'prev')}${link(next, 'next')}</nav>`;
}

function rail(chapter: Chapter): string {
  const items = chapter.headings
    .map(
      (h) =>
        `<li class="rail__item rail__item--h${h.level}"><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`,
    )
    .join('');
  const toc = items
    ? `<p class="rail__title">On this page</p><ul class="rail__list" id="rail-list">${items}</ul>`
    : '';
  return `<aside class="rail">
    <div class="rail__inner">
      ${toc}
      <div class="rail__meta">
        <p><span>Standard</span><code>${escapeHtml(chapter.standard)}</code></p>
        <p><span>Reading</span>${readingMinutes(chapter.words)} min</p>
        ${chapter.exercises.length ? `<p><span>Problems</span>${chapter.exercises.length}</p>` : ''}
      </div>
      <button class="rail__done" data-chapter="${escapeHtml(chapter.slug)}" id="mark-done">Mark as read</button>
    </div>
  </aside>`;
}

export function renderChapter(
  book: Book,
  nav: readonly NavEntry[],
  part: Part,
  chapter: Chapter,
  assets: Assets,
): string {
  const draft =
    chapter.status === 'draft'
      ? '<p class="draft-banner">This chapter is an outline: the objectives and structure are settled, the prose is still being written.</p>'
      : '';

  const main = `<article class="prose" data-chapter="${escapeHtml(chapter.slug)}">
    <div class="chapter-head">
      <p class="chapter-eyebrow"><a href="${url(`${part.slug}/`)}">Part ${part.order} · ${escapeHtml(part.title)}</a></p>
      <h1>${escapeHtml(chapter.title)}</h1>
      ${chapter.summary ? `<p class="chapter-lede">${escapeHtml(chapter.summary)}</p>` : ''}
    </div>
    ${draft}
    ${objectiveList(chapter)}
    ${chapter.html}
    ${prevNext(nav, chapter.slug)}
  </article>`;

  return shell({
    title: `${chapter.title} · ${book.title}`,
    description: chapter.summary,
    main,
    book,
    assets,
    currentSlug: chapter.slug,
    rail: rail(chapter),
  });
}

export function renderPart(book: Book, part: Part, assets: Assets): string {
  const cards = part.chapters
    .map(
      (ch) => `<li class="card">
        <a href="${url(`${part.slug}/${ch.slug}/`)}">
          <span class="card__num">${part.order}.${ch.order}</span>
          <h3>${escapeHtml(ch.title)}</h3>
          <p>${escapeHtml(ch.summary)}</p>
          <span class="card__meta">${readingMinutes(ch.words)} min${ch.status === 'draft' ? ' · outline' : ''}</span>
        </a>
      </li>`,
    )
    .join('');

  const main = `<article class="prose prose--wide">
    <p class="chapter-eyebrow">Part ${part.order}</p>
    <h1>${escapeHtml(part.title)}</h1>
    <p class="chapter-lede">${escapeHtml(part.summary)}</p>
    <ul class="cards">${cards}</ul>
  </article>`;

  return shell({
    title: `${part.title} · ${book.title}`,
    description: part.summary,
    main,
    book,
    assets,
  });
}
