import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';
import { createHighlighter, type Highlighter } from 'shiki';
import type { Heading } from './types.ts';
import { LANGUAGE } from './language.ts';

/** Languages we highlight at build time. */
const LANGS: string[] = [...LANGUAGE.grammars];

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= createHighlighter({
    themes: ['vitesse-light', 'vitesse-dark'],
    langs: LANGS,
  });
  return highlighterPromise;
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Flags on a fenced code block, written after the language:
 *
 *     ```java run std=java21 title="Hello, world"
 *
 * `run` adds a compile-and-run panel, `bytecode` adds a javap panel, and
 * `hidden` marks lines that are compiled but not shown (see stripHidden).
 */
interface FenceMeta {
  lang: string;
  run: boolean;
  bytecode: boolean;
  title: string;
  standard: string;
  flags: Set<string>;
}

function parseFenceInfo(info: string): FenceMeta {
  const parts = info.trim().match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
  const lang = parts.shift() ?? 'text';
  const meta: FenceMeta = {
    lang,
    run: false,
    bytecode: false,
    title: '',
    standard: '',
    flags: new Set(),
  };
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq === -1) {
      meta.flags.add(part);
      continue;
    }
    const key = part.slice(0, eq);
    const value = part.slice(eq + 1).replace(/^"|"$/g, '');
    if (key === 'title') meta.title = value;
    else if (key === 'std') meta.standard = value;
  }
  meta.run = meta.flags.has(LANGUAGE.flags.run);
  meta.bytecode = meta.flags.has(LANGUAGE.flags.disassemble);
  return meta;
}

/**
 * Lines ending in `// [hidden]` are sent to the compiler but hidden from the
 * reader, so an example can stay focused without failing to compile.
 */
function splitHidden(source: string): { shown: string; full: string } {
  const lines = source.split('\n');
  const shown = lines.filter((l) => !/\/\/\s*\[hidden\]\s*$/.test(l));
  const full = lines.map((l) => l.replace(/\s*\/\/\s*\[hidden\]\s*$/, ''));
  return { shown: shown.join('\n').replace(/\n+$/, ''), full: full.join('\n').replace(/\n+$/, '') };
}

/**
 * A generic `:::name args … :::` block. Prose containers get their body parsed
 * as Markdown; raw containers (memviz, exercise) keep their body verbatim so
 * the client can parse it.
 */
const RAW_CONTAINERS = new Set(['memviz', 'exercise', 'quiz']);
const PROSE_CONTAINERS: Record<string, { label: string; cls: string }> = {
  note: { label: 'Note', cls: 'note' },
  tip: { label: 'Tip', cls: 'tip' },
  pitfall: { label: 'Pitfall', cls: 'pitfall' },
  warning: { label: 'Undefined behaviour', cls: 'warning' },
  standards: { label: 'From the standard', cls: 'standards' },
  history: { label: 'How we got here', cls: 'history' },
  practice: { label: 'Practice', cls: 'practice' },
  recap: { label: 'Recap', cls: 'recap' },
};

function containerPlugin(md: MarkdownIt): void {
  md.block.ruler.before('fence', 'container', (state, startLine, endLine, silent) => {
    const start = state.bMarks[startLine] + state.tShift[startLine];
    const max = state.eMarks[startLine];
    if (start + 3 > max) return false;
    if (state.src.slice(start, start + 3) !== ':::') return false;

    const info = state.src.slice(start + 3, max).trim();
    const spaceAt = info.indexOf(' ');
    const name = (spaceAt === -1 ? info : info.slice(0, spaceAt)).toLowerCase();
    const args = spaceAt === -1 ? '' : info.slice(spaceAt + 1).trim();
    if (!name || (!RAW_CONTAINERS.has(name) && !(name in PROSE_CONTAINERS))) return false;
    if (silent) return true;

    // Find the closing fence, tracking nesting so containers can hold containers.
    let depth = 1;
    let line = startLine;
    while (line < endLine - 1) {
      line += 1;
      const from = state.bMarks[line] + state.tShift[line];
      const to = state.eMarks[line];
      const text = state.src.slice(from, to).trim();
      if (text.startsWith(':::')) {
        if (text === ':::') depth -= 1;
        else depth += 1;
        if (depth === 0) break;
      }
    }

    const token = state.push('container_open', 'div', 1);
    token.markup = ':::';
    token.info = name;
    token.meta = { name, args };
    token.map = [startLine, line];

    if (RAW_CONTAINERS.has(name)) {
      const body: string[] = [];
      for (let i = startLine + 1; i < line; i += 1) {
        body.push(state.getLines(i, i + 1, 0, false));
      }
      token.meta.body = body.join('\n');
    } else {
      state.md.block.tokenize(state, startLine + 1, line);
    }

    const close = state.push('container_close', 'div', -1);
    close.markup = ':::';
    close.info = name;
    close.meta = { name };

    state.line = line + 1;
    return true;
  });

  md.renderer.rules.container_open = (tokens, idx) => {
    const { name, args, body } = tokens[idx].meta as { name: string; args: string; body?: string };
    if (name === 'memviz') {
      return `<figure class="widget"><tb-memviz><template data-role="spec">${escapeHtml(body ?? '')}</template></tb-memviz></figure>\n`;
    }
    if (name === 'exercise') {
      return `<tb-exercise data-id="${escapeHtml(args)}"></tb-exercise>\n`;
    }
    if (name === 'quiz') {
      return `<tb-quiz><template data-role="spec">${escapeHtml(body ?? '')}</template></tb-quiz>\n`;
    }
    const kind = PROSE_CONTAINERS[name];
    const label = args || kind.label;
    return `<aside class="callout callout--${kind.cls}"><p class="callout__label">${escapeHtml(label)}</p>\n`;
  };

  md.renderer.rules.container_close = (tokens, idx) => {
    const { name } = tokens[idx].meta as { name: string };
    return RAW_CONTAINERS.has(name) ? '' : '</aside>\n';
  };
}

export interface RenderResult {
  html: string;
  headings: Heading[];
  exercises: string[];
  text: string;
}

export async function createRenderer(): Promise<(src: string) => RenderResult> {
  const highlighter = await getHighlighter();

  const md = new MarkdownIt({ html: true, linkify: true, typographer: true });
  md.use(containerPlugin);

  let headings: Heading[] = [];
  md.use(anchor, {
    level: [2, 3],
    slugify: (s: string) =>
      s
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-'),
    callback: (token, info) => {
      const level = Number(token.tag.slice(1));
      if (level === 2 || level === 3) {
        headings.push({ id: info.slug, text: info.title, level: level as 2 | 3 });
      }
    },
  });

  const highlight = (code: string, lang: string): string =>
    highlighter.codeToHtml(code, {
      lang: LANGS.includes(lang) ? lang : 'text',
      themes: { light: 'vitesse-light', dark: 'vitesse-dark' },
      defaultColor: false,
      cssVariablePrefix: '--sh-',
    });

  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx];
    const meta = parseFenceInfo(token.info);
    const { shown, full } = splitHidden(token.content);
    const highlighted = highlight(shown, meta.lang);

    const caption = meta.title
      ? `<figcaption class="code__title">${escapeHtml(meta.title)}</figcaption>`
      : '';

    if (!meta.run && !meta.bytecode) {
      return `<figure class="code">${caption}${highlighted}</figure>\n`;
    }

    const attrs = [
      meta.run ? 'data-run="1"' : '',
      meta.bytecode ? 'data-bytecode="1"' : '',
      meta.standard ? `data-std="${escapeHtml(meta.standard)}"` : '',
      meta.flags.has('autorun') ? 'data-autorun="1"' : '',
      meta.flags.has(LANGUAGE.flags.expectError) ? 'data-expect-error="1"' : '',
      meta.flags.has(LANGUAGE.flags.expectThrow) ? 'data-expect-throw="1"' : '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      `<figure class="widget"><tb-runner ${attrs}>` +
      `${caption}` +
      `<div data-role="rendered">${highlighted}</div>` +
      `<template data-role="source">${escapeHtml(full)}</template>` +
      `</tb-runner></figure>\n`
    );
  };

  return (src: string): RenderResult => {
    headings = [];
    const env = {};
    const html = md.render(src, env);
    const exercises = [...src.matchAll(/^:::exercise\s+(\S+)/gm)].map((m) => m[1]);
    const text = src
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/[#*_>`\[\]()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return { html, headings: [...headings], exercises, text };
  };
}

export { escapeHtml };
