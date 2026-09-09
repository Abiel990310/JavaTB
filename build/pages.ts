import { escapeHtml } from './markdown.ts';
import { url } from './base.ts';
import { shell, readingMinutes, type Assets } from './render.ts';
import type { Book, Exercise } from './types.ts';

const DIFFICULTY_LABEL: Record<Exercise['difficulty'], string> = {
  intro: 'Warm-up',
  core: 'Core',
  stretch: 'Stretch',
  deep: 'Deep end',
};

/** "1 chapter", "12 chapters" — the book starts small and the front page says so. */
const plural = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? '' : 's'}`;

export function renderHome(book: Book, assets: Assets): string {
  const chapters = book.parts.flatMap((p) => p.chapters);
  const complete = chapters.filter((c) => c.status === 'complete').length;

  const partList = book.parts
    .map(
      (part) => `<li class="toc-part">
        <div class="toc-part__head">
          <span class="toc-part__num">Part ${part.order}</span>
          <h3><a href="${url(`${part.slug}/`)}">${escapeHtml(part.title)}</a></h3>
          <p>${escapeHtml(part.summary)}</p>
        </div>
        <ol class="toc-part__chapters">
          ${part.chapters
            .map(
              (ch) =>
                `<li><a href="${url(`${part.slug}/${ch.slug}/`)}"><span class="toc-num">${part.order}.${ch.order}</span> ${escapeHtml(ch.navTitle)}</a>${
                  ch.status === 'draft' ? '<span class="nav__badge">outline</span>' : ''
                }</li>`,
            )
            .join('')}
        </ol>
      </li>`,
    )
    .join('');

  // Linked by position rather than by slug: the outline is still moving, and a
  // hardcoded chapter URL on the front page is a 404 waiting for a rename.
  const firstChapter = book.parts[0]?.chapters[0];
  const secondPart = book.parts[1] ?? book.parts[0];
  const secondChapter = secondPart?.chapters[0];
  const startHref = firstChapter ? url(`${firstChapter.partSlug}/${firstChapter.slug}/`) : url('');
  const secondHref = secondChapter
    ? url(`${secondChapter.partSlug}/${secondChapter.slug}/`)
    : startHref;

  const main = `<article class="prose prose--wide home">
    <section class="hero">
      <h1>Java, all the way down</h1>
      <p class="hero__lede">Every code sample on this site compiles and runs in your browser. Every idea that usually gets waved at &mdash; what the JVM actually does, why generics forget their types, what a stream is really doing &mdash; comes with a program you can change, and problems that check your answer by running it.</p>
      <div class="hero__actions">
        <a class="button button--primary" href="${startHref}">Start at the beginning</a>
        <a class="button" href="${url('practice/')}">Jump to problems</a>
        <button class="button" id="resume-button" hidden>Resume where you left off</button>
      </div>
      <p class="hero__stats">${plural(chapters.length, 'chapter')} · ${complete} written · ${plural(book.exercises.length, 'problem')}</p>
    </section>

    <section class="paths">
      <h2>Three ways to read this</h2>
      <div class="paths__grid">
        <div class="path">
          <h3>New to programming</h3>
          <p>Read the early parts in order. They assume nothing: no JDK installed, no terminal experience, no maths beyond arithmetic.</p>
          <a href="${startHref}">Begin &rarr;</a>
        </div>
        <div class="path">
          <h3>You know another language</h3>
          <p>Skim the first part, then slow down where Java stops behaving like what you already know: references and equality, checked exceptions, and generics that are erased before they run.</p>
          <a href="${secondHref}">Skip ahead &rarr;</a>
        </div>
        <div class="path">
          <h3>You want the problems</h3>
          <p>The problem bank is filterable by topic and difficulty, and each problem compiles and tests your submission. Your progress is saved in this browser.</p>
          <a href="${url('practice/')}">Open the bank &rarr;</a>
        </div>
      </div>
    </section>

    <section class="contents">
      <h2>Contents</h2>
      <ol class="toc">${partList}</ol>
    </section>
  </article>`;

  return shell({
    title: `${book.title} — an interactive Java book`,
    description:
      'An interactive Java textbook: runnable examples, diagrams of what the JVM is doing, and auto-graded practice problems, from first program to generics and concurrency.',
    main,
    book,
    assets,
    bodyClass: 'is-home',
  });
}

export function renderPractice(book: Book, assets: Assets): string {
  const chapterTitle = new Map(
    book.parts.flatMap((p) => p.chapters.map((c) => [c.slug, c.title] as const)),
  );
  const topics = [...new Set(book.exercises.flatMap((e) => e.topics))].sort();

  const rows = book.exercises
    .map(
      (ex) => `<li class="problem" data-difficulty="${ex.difficulty}" data-topics="${escapeHtml(ex.topics.join(' '))}" data-id="${escapeHtml(ex.id)}">
        <a href="${url(`practice/${escapeHtml(ex.id)}/`)}">
          <span class="problem__status" data-status-for="${escapeHtml(ex.id)}"></span>
          <span class="problem__title">${escapeHtml(ex.title)}</span>
          <span class="problem__chapter">${escapeHtml(chapterTitle.get(ex.chapter) ?? ex.chapter)}</span>
          <span class="problem__difficulty problem__difficulty--${ex.difficulty}">${DIFFICULTY_LABEL[ex.difficulty]}</span>
        </a>
      </li>`,
    )
    .join('');

  const topicChips = topics
    .map(
      (t) =>
        `<button class="chip" data-filter-topic="${escapeHtml(t)}">${escapeHtml(t)}</button>`,
    )
    .join('');

  const main = `<article class="prose prose--wide">
    <h1>Practice problems</h1>
    <p class="chapter-lede">Each problem gives you a starting file and a hidden test that compiles against your code. Write, run, and the page tells you exactly which assertion failed. Progress is stored in this browser.</p>

    <div class="filters">
      <div class="filters__row">
        <span class="filters__label">Difficulty</span>
        <button class="chip is-on" data-filter-difficulty="all">All</button>
        ${(['intro', 'core', 'stretch', 'deep'] as const)
          .map(
            (d) =>
              `<button class="chip" data-filter-difficulty="${d}">${DIFFICULTY_LABEL[d]}</button>`,
          )
          .join('')}
      </div>
      <div class="filters__row">
        <span class="filters__label">Topic</span>
        <button class="chip is-on" data-filter-topic="all">All</button>
        ${topicChips}
      </div>
    </div>

    <ul class="problems" id="problem-list">${rows}</ul>
    <p class="problems__empty" id="problem-empty" hidden>No problems match those filters yet.</p>
  </article>`;

  return shell({
    title: `Practice problems · ${book.title}`,
    description: 'Auto-graded Java practice problems, filterable by topic and difficulty.',
    main,
    book,
    assets,
  });
}

export function renderExercisePage(book: Book, exercise: Exercise, assets: Assets): string {
  const main = `<article class="prose" data-exercise-page="${escapeHtml(exercise.id)}">
    <p class="chapter-eyebrow"><a href="${url('practice/')}">Practice</a> · ${DIFFICULTY_LABEL[exercise.difficulty]}</p>
    <h1>${escapeHtml(exercise.title)}</h1>
    <tb-exercise data-id="${escapeHtml(exercise.id)}" data-standalone="1"></tb-exercise>
  </article>`;

  return shell({
    title: `${exercise.title} · Practice · ${book.title}`,
    description: `Java practice problem: ${exercise.title}`,
    main,
    book,
    assets,
  });
}

/**
 * Progress at a glance, generated from chapter front-matter.
 *
 * This is the page to open to see how far the book has come: it needs no
 * maintenance, because a chapter counts as written the moment its front-matter
 * says `status: complete`.
 */
export function renderStatus(book: Book, assets: Assets): string {
  const chapters = book.parts.flatMap((p) => p.chapters);
  const written = chapters.filter((c) => c.status === 'complete');
  const words = written.reduce((sum, c) => sum + c.words, 0);
  const pct = Math.round((written.length / Math.max(chapters.length, 1)) * 100);

  const bar = (done: number, total: number) => {
    const percent = Math.round((done / Math.max(total, 1)) * 100);
    return `<div class="meter" role="img" aria-label="${done} of ${total} written">
      <div class="meter__fill" style="width:${percent}%"></div>
    </div>`;
  };

  const parts = book.parts
    .map((part) => {
      const done = part.chapters.filter((c) => c.status === 'complete').length;
      const rows = part.chapters
        .map((ch) => {
          const state =
            ch.status === 'complete'
              ? '<span class="state state--done">written</span>'
              : '<span class="state state--todo">outline</span>';
          return `<tr>
            <td><a href="${url(`${part.slug}/${ch.slug}/`)}">${escapeHtml(ch.navTitle)}</a></td>
            <td>${state}</td>
            <td class="num">${ch.status === 'complete' ? ch.words.toLocaleString('en') : '—'}</td>
            <td class="num">${ch.exercises.length || '—'}</td>
          </tr>`;
        })
        .join('');

      return `<section class="status-part">
        <div class="status-part__head">
          <h2>Part ${part.order} · ${escapeHtml(part.title)}</h2>
          <span class="status-part__count">${done} of ${part.chapters.length}</span>
        </div>
        ${bar(done, part.chapters.length)}
        <table class="status-table">
          <thead><tr><th>Chapter</th><th>State</th><th class="num">Words</th><th class="num">Problems</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </section>`;
    })
    .join('');

  const main = `<article class="prose prose--wide">
    <h1>Progress</h1>
    <p class="chapter-lede">This book is being written a chapter at a time. Every chapter below is already outlined with its objectives fixed; the ones marked <em>written</em> have their prose, runnable examples, and diagrams in place.</p>

    <div class="status-summary">
      <div class="stat"><span class="stat__num">${written.length}<span class="stat__of">/${chapters.length}</span></span><span class="stat__label">chapters written</span></div>
      <div class="stat"><span class="stat__num">${pct}%</span><span class="stat__label">of the book</span></div>
      <div class="stat"><span class="stat__num">${words.toLocaleString('en')}</span><span class="stat__label">words</span></div>
      <div class="stat"><span class="stat__num">${book.exercises.length}</span><span class="stat__label">problems</span></div>
    </div>

    ${parts}
  </article>`;

  return shell({
    title: `Progress · ${book.title}`,
    description: 'Which chapters of the book are written, and which are still outlines.',
    main,
    book,
    assets,
  });
}

/** A cheat-sheet page assembled from chapter metadata, not hand-maintained. */
export function renderReference(book: Book, assets: Assets): string {
  const sections = book.parts
    .map(
      (part) => `<section class="ref-part">
        <h2>${escapeHtml(part.title)}</h2>
        <table class="ref-table">
          <thead><tr><th>Chapter</th><th>You should be able to</th><th>Standard</th></tr></thead>
          <tbody>
            ${part.chapters
              .map(
                (ch) => `<tr>
                  <td><a href="${url(`${part.slug}/${ch.slug}/`)}">${escapeHtml(ch.navTitle)}</a></td>
                  <td><ul>${ch.objectives.map((o) => `<li>${escapeHtml(o)}</li>`).join('') || '<li class="muted">—</li>'}</ul></td>
                  <td><code>${escapeHtml(ch.standard)}</code></td>
                </tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </section>`,
    )
    .join('');

  const main = `<article class="prose prose--wide">
    <h1>Quick reference</h1>
    <p class="chapter-lede">Every chapter's objectives in one place. Use it to find where you are: scan for the first row you cannot honestly claim, and start there.</p>
    ${sections}
  </article>`;

  return shell({
    title: `Quick reference · ${book.title}`,
    description: 'Every chapter objective in one scannable table — find your level and continue.',
    main,
    book,
    assets,
  });
}

export { readingMinutes };
