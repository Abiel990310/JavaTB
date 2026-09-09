import { compile, currentBackend, type CompileResult } from '../lib/compile-client.ts';
import { CodeEditor } from '../lib/editor.ts';
import { highlightBytecode } from '../lib/highlight.ts';

const STANDARDS = ['java17', 'java21'] as const;

/** "java21" as a reader reads it. */
const standardLabel = (std: string): string => std.replace(/^java/, 'Java ');

/**
 * `<tb-runner>` — a code sample the reader can run, edit, and disassemble.
 *
 * The build pipeline puts Shiki-highlighted markup in `[data-role=rendered]`
 * and the true source (including any `// [hidden]` lines) in
 * `[data-role=source]`. Until the reader presses a button this is inert: the
 * highlighted code is just HTML, so the page reads fine without JavaScript.
 */
export class TbRunner extends HTMLElement {
  private source = '';
  private editor: CodeEditor | null = null;
  private output!: HTMLElement;
  private status!: HTMLElement;
  private runButton!: HTMLButtonElement;
  private rendered!: HTMLElement;
  private busy = false;
  private standard = 'java21';

  connectedCallback(): void {
    const template = this.querySelector<HTMLTemplateElement>('template[data-role="source"]');
    this.source = template?.content.textContent ?? '';
    this.standard = this.dataset.std || 'java21';

    this.rendered =
      this.querySelector<HTMLElement>('[data-role="rendered"]') ?? document.createElement('div');

    this.append(this.buildToolbar(), this.buildOutput());
  }

  private buildToolbar(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'runner__bar';

    this.runButton = document.createElement('button');
    this.runButton.className = 'runner__btn runner__btn--primary';
    this.runButton.type = 'button';
    this.runButton.innerHTML = '<span class="runner__play"></span>Run';
    this.runButton.addEventListener('click', () => void this.execute('run'));

    const edit = document.createElement('button');
    edit.className = 'runner__btn';
    edit.type = 'button';
    edit.textContent = 'Edit';
    edit.addEventListener('click', () => {
      this.enterEditMode();
      edit.remove();
    });

    bar.append(this.runButton, edit);

    if (this.dataset.bytecode === '1') {
      const disassemble = document.createElement('button');
      disassemble.className = 'runner__btn';
      disassemble.type = 'button';
      disassemble.textContent = 'Bytecode';
      disassemble.addEventListener('click', () => void this.execute('bytecode'));
      bar.append(disassemble);
    }

    const stdSelect = document.createElement('select');
    stdSelect.className = 'runner__select';
    stdSelect.setAttribute('aria-label', 'Language standard');
    for (const std of STANDARDS) {
      const option = document.createElement('option');
      option.value = std;
      option.textContent = standardLabel(std);
      option.selected = std === this.standard;
      stdSelect.append(option);
    }
    stdSelect.addEventListener('change', () => {
      this.standard = stdSelect.value;
    });

    const spacer = document.createElement('span');
    spacer.className = 'runner__spacer';

    this.status = document.createElement('span');
    this.status.className = 'runner__status';

    bar.append(spacer, this.status, stdSelect);
    return bar;
  }

  private buildOutput(): HTMLElement {
    this.output = document.createElement('div');
    this.output.className = 'runner__output';
    this.output.hidden = true;
    return this.output;
  }

  private enterEditMode(): void {
    if (this.editor) return;
    this.editor = new CodeEditor(this.source);
    this.editor.onRunRequested(() => void this.execute('run'));
    this.rendered.replaceWith(this.editor.root);
    this.editor.focus();
  }

  private get currentSource(): string {
    return this.editor ? this.editor.value : this.source;
  }

  private setBusy(busy: boolean, label: string): void {
    this.busy = busy;
    this.runButton.disabled = busy;
    this.status.textContent = label;
    this.status.classList.toggle('is-busy', busy);
  }

  private async execute(action: 'run' | 'bytecode'): Promise<void> {
    if (this.busy) return;
    this.setBusy(true, action === 'bytecode' ? 'Compiling…' : 'Compiling and running…');
    this.output.hidden = false;
    this.output.innerHTML = '<div class="runner__spinner" role="status">Working…</div>';

    try {
      const result = await compile({
        source: this.currentSource,
        standard: this.standard,
        action,
      });
      this.render(result, action);
      const backend = await currentBackend();
      this.setBusy(
        false,
        `${result.durationMs} ms · ${backend === 'local' ? 'local compiler' : 'Compiler Explorer'}`,
      );
    } catch (error) {
      this.output.innerHTML = '';
      this.output.append(
        this.panel(
          'error',
          'Could not reach a compiler',
          `${error instanceof Error ? error.message : String(error)}\n\nRun the site with \`npm run dev\` for a local compiler, or check your connection — the hosted fallback needs network access.`,
        ),
      );
      this.setBusy(false, 'failed');
    }
  }

  private panel(kind: string, title: string, body: string, html = false): HTMLElement {
    const panel = document.createElement('div');
    panel.className = `panel panel--${kind}`;
    const heading = document.createElement('p');
    heading.className = 'panel__title';
    heading.textContent = title;
    const pre = document.createElement('pre');
    pre.className = 'panel__body';
    if (html) pre.innerHTML = body;
    else pre.textContent = body;
    panel.append(heading, pre);
    return panel;
  }

  private render(result: CompileResult, action: 'run' | 'bytecode'): void {
    this.output.innerHTML = '';
    const expectsError = this.dataset.expectError === '1';

    if (!result.compiled) {
      this.output.append(
        this.panel(
          expectsError ? 'expected' : 'error',
          expectsError
            ? 'It does not compile — which is the point'
            : 'The compiler rejected this',
          result.diagnostics || 'No diagnostics were produced.',
        ),
      );
      return;
    }

    if (action === 'bytecode') {
      this.output.append(
        this.panel('asm', 'Bytecode (javap -c)', highlightBytecode(result.bytecode ?? ''), true),
      );
      return;
    }

    if (result.timedOut) {
      this.output.append(
        this.panel('error', 'Stopped after the time limit', 'The program was still running when the limit ran out. An infinite loop, or waiting on input that never arrives?'),
      );
      return;
    }

    if (result.diagnostics.trim()) {
      this.output.append(this.panel('warn', 'Compiler warnings', result.diagnostics));
    }
    if (result.stdout) {
      this.output.append(this.panel('out', 'Output', result.stdout));
    }
    if (result.stderr.trim()) {
      const looksLikeSanitizer = /Sanitizer|runtime error:|LeakSanitizer/.test(result.stderr);
      const expected = this.dataset.expectUb === '1' && looksLikeSanitizer;
      this.output.append(
        this.panel(
          expected ? 'expected' : looksLikeSanitizer ? 'error' : 'warn',
          expected
            ? 'The sanitizers caught it — which is the point'
            : looksLikeSanitizer
              ? 'The sanitizers caught something'
              : 'Standard error',
          result.stderr,
        ),
      );
    }
    if (!result.stdout && !result.stderr.trim()) {
      this.output.append(this.panel('out', 'Output', '(the program printed nothing)'));
    }

    const exit = document.createElement('p');
    exit.className = `runner__exit ${result.exitCode === 0 ? 'is-ok' : 'is-bad'}`;
    exit.textContent = `exit code ${result.exitCode ?? 'killed'}`;
    this.output.append(exit);
  }
}
