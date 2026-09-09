import { highlightSource } from './highlight.ts';

/**
 * A textarea with a highlighted layer behind it and a line-number gutter.
 *
 * The two must stay exactly the same size, or a click lands on a different
 * character than the one under the pointer. That is done with layout rather
 * than with JavaScript: the highlight layer is in normal flow and sizes the
 * surface, and the textarea is stretched over it with `inset: 0`. An earlier
 * version measured `scrollHeight` and set the height itself, which read 0
 * because the constructor runs before the editor is in the document — leaving
 * a 32-pixel strip of clickable area over a full-height block of text.
 *
 * Deliberately not a full editor: no autocomplete, no linting, no 800 KB of
 * dependency. What it does have is the handful of behaviours that make typing
 * Java in a browser tolerable — real tabs, indent preservation, bracket
 * closing, and Ctrl/Cmd+Enter to run.
 */
export class CodeEditor {
  readonly root: HTMLElement;
  private readonly textarea: HTMLTextAreaElement;
  private readonly highlightLayer: HTMLElement;
  private readonly gutter: HTMLElement;
  private onRun: (() => void) | null = null;
  private onChange: ((value: string) => void) | null = null;

  constructor(initial: string, options: { minRows?: number } = {}) {
    this.root = document.createElement('div');
    this.root.className = 'editor';

    this.gutter = document.createElement('div');
    this.gutter.className = 'editor__gutter';
    this.gutter.setAttribute('aria-hidden', 'true');

    const surface = document.createElement('div');
    surface.className = 'editor__surface';
    // The highlight layer is in flow and gives the surface its height; the
    // textarea is absolutely positioned on top of it. A minimum keeps a short
    // starter from collapsing to two lines.
    surface.style.minHeight = `calc(${options.minRows ?? 6} * 1.6em + 2rem)`;

    this.highlightLayer = document.createElement('pre');
    this.highlightLayer.className = 'editor__highlight';
    this.highlightLayer.setAttribute('aria-hidden', 'true');

    this.textarea = document.createElement('textarea');
    this.textarea.className = 'editor__input';
    this.textarea.spellcheck = false;
    this.textarea.autocapitalize = 'off';
    this.textarea.autocomplete = 'off';
    this.textarea.setAttribute('aria-label', 'Java source code');
    this.textarea.rows = options.minRows ?? 6;
    this.textarea.value = initial;

    surface.append(this.highlightLayer, this.textarea);
    this.root.append(this.gutter, surface);

    this.textarea.addEventListener('input', () => this.sync());
    this.textarea.addEventListener('scroll', () => this.syncScroll());
    this.textarea.addEventListener('keydown', (e) => this.handleKey(e));
    this.sync();
  }

  get value(): string {
    return this.textarea.value;
  }

  set value(next: string) {
    this.textarea.value = next;
    this.sync();
  }

  focus(): void {
    this.textarea.focus();
  }

  onRunRequested(fn: () => void): void {
    this.onRun = fn;
  }

  onValueChanged(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  private sync(): void {
    const text = this.textarea.value;
    this.highlightLayer.innerHTML = `${highlightSource(text)}\n`;

    const lines = text.split('\n').length;
    if (this.gutter.childElementCount !== lines) {
      this.gutter.replaceChildren(
        ...Array.from({ length: lines }, (_, i) => {
          const n = document.createElement('span');
          n.textContent = String(i + 1);
          return n;
        }),
      );
    }

    this.onChange?.(text);
  }

  private syncScroll(): void {
    this.highlightLayer.scrollTop = this.textarea.scrollTop;
    this.highlightLayer.scrollLeft = this.textarea.scrollLeft;
  }

  private replaceSelection(text: string, caretOffset = text.length): void {
    const { selectionStart: start, selectionEnd: end, value } = this.textarea;
    this.textarea.value = value.slice(0, start) + text + value.slice(end);
    this.textarea.selectionStart = this.textarea.selectionEnd = start + caretOffset;
    this.sync();
  }

  private handleKey(e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      this.onRun?.();
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const { selectionStart: start, selectionEnd: end, value } = this.textarea;
      if (start !== end) {
        // Indent or outdent every line the selection touches.
        const from = value.lastIndexOf('\n', start - 1) + 1;
        const block = value.slice(from, end);
        const shifted = e.shiftKey
          ? block.replace(/^ {1,4}/gm, '')
          : block.replace(/^/gm, '    ');
        this.textarea.value = value.slice(0, from) + shifted + value.slice(end);
        this.textarea.selectionStart = from;
        this.textarea.selectionEnd = from + shifted.length;
        this.sync();
      } else {
        this.replaceSelection('    ');
      }
      return;
    }

    if (e.key === 'Enter') {
      const { selectionStart: start, value } = this.textarea;
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const line = value.slice(lineStart, start);
      const indent = /^[ \t]*/.exec(line)?.[0] ?? '';
      const opensBlock = /[{([]\s*$/.test(line);
      const closesNext = /^\s*[}\])]/.test(value.slice(start));

      if (opensBlock && closesNext) {
        // Put the closing brace on its own line, cursor in the middle.
        e.preventDefault();
        const inner = `\n${indent}    `;
        this.replaceSelection(`${inner}\n${indent}`, inner.length);
      } else if (opensBlock || indent) {
        e.preventDefault();
        this.replaceSelection(`\n${indent}${opensBlock ? '    ' : ''}`);
      }
      return;
    }

    const PAIRS: Record<string, string> = { '(': ')', '[': ']', '{': '}', '"': '"' };
    if (PAIRS[e.key] && this.textarea.selectionStart === this.textarea.selectionEnd) {
      const next = this.textarea.value[this.textarea.selectionStart] ?? '';
      if (next === '' || /[\s)\]};,]/.test(next)) {
        e.preventDefault();
        this.replaceSelection(e.key + PAIRS[e.key], 1);
      }
    }
  }
}
