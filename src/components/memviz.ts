/**
 * `<tb-memviz>` — a stepped diagram of what a program does to memory.
 *
 * Authored in Markdown as a JSON spec inside a `:::memviz` block. Boxes are
 * laid out as HTML; arrows are drawn afterwards into an SVG overlay from the
 * measured positions, so they stay correct at any width or zoom.
 */

interface Field {
  k: string;
  v: string;
  /** Anchor id an arrow can start from, e.g. "s.ptr". */
  anchor?: string;
}

interface Box {
  id: string;
  name?: string;
  type?: string;
  value?: string;
  fields?: Field[];
  /** Visual state: normal, just-created, moved-from, or freed. */
  state?: 'new' | 'moved' | 'freed' | 'danger';
  note?: string;
}

interface Arrow {
  from: string;
  to: string;
  state?: 'normal' | 'dangling';
  label?: string;
}

interface Step {
  caption: string;
  line?: number;
  stack?: Box[];
  heap?: Box[];
  arrows?: Arrow[];
  note?: string;
}

interface Spec {
  title?: string;
  code?: string;
  steps: Step[];
}

const escape = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export class TbMemviz extends HTMLElement {
  private spec!: Spec;
  private index = 0;
  private stage!: HTMLElement;
  private overlay!: SVGSVGElement;
  private caption!: HTMLElement;
  private codeLines: HTMLElement[] = [];
  private stepButtons: HTMLButtonElement[] = [];

  connectedCallback(): void {
    const template = this.querySelector<HTMLTemplateElement>('template[data-role="spec"]');
    try {
      this.spec = JSON.parse(template?.content.textContent ?? '{}') as Spec;
    } catch (error) {
      this.innerHTML = `<p class="memviz__error">This diagram's spec is not valid JSON: ${
        error instanceof Error ? error.message : 'parse error'
      }</p>`;
      return;
    }
    if (!this.spec.steps?.length) return;
    this.build();
    this.show(0);

    // Arrows depend on measured geometry, so redraw when the box resizes.
    new ResizeObserver(() => this.drawArrows()).observe(this);
  }

  private build(): void {
    this.innerHTML = '';
    this.className = 'memviz';

    if (this.spec.title) {
      const title = document.createElement('p');
      title.className = 'memviz__title';
      title.textContent = this.spec.title;
      this.append(title);
    }

    const body = document.createElement('div');
    body.className = `memviz__body ${this.spec.code ? 'has-code' : ''}`;

    if (this.spec.code) {
      const codeBox = document.createElement('pre');
      codeBox.className = 'memviz__code';
      this.codeLines = this.spec.code.split('\n').map((line, i) => {
        const el = document.createElement('span');
        el.className = 'memviz__line';
        el.dataset.line = String(i + 1);
        el.textContent = line || ' ';
        return el;
      });
      codeBox.append(...this.codeLines);
      body.append(codeBox);
    }

    this.stage = document.createElement('div');
    this.stage.className = 'memviz__stage';

    this.overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.overlay.setAttribute('class', 'memviz__arrows');
    this.overlay.innerHTML = `<defs>
      <marker id="mv-head" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
        <path d="M0 0 L8 4 L0 8 z" fill="currentColor"/>
      </marker>
    </defs>`;
    this.stage.append(this.overlay);
    body.append(this.stage);
    this.append(body);

    this.caption = document.createElement('p');
    this.caption.className = 'memviz__caption';

    const controls = document.createElement('div');
    controls.className = 'memviz__controls';

    const prev = document.createElement('button');
    prev.className = 'memviz__nav';
    prev.type = 'button';
    prev.setAttribute('aria-label', 'Previous step');
    prev.textContent = '←';
    prev.addEventListener('click', () => this.show(this.index - 1));

    const next = document.createElement('button');
    next.className = 'memviz__nav';
    next.type = 'button';
    next.setAttribute('aria-label', 'Next step');
    next.textContent = '→';
    next.addEventListener('click', () => this.show(this.index + 1));

    const dots = document.createElement('div');
    dots.className = 'memviz__dots';
    this.stepButtons = this.spec.steps.map((_, i) => {
      const dot = document.createElement('button');
      dot.className = 'memviz__dot';
      dot.type = 'button';
      dot.setAttribute('aria-label', `Step ${i + 1}`);
      dot.addEventListener('click', () => this.show(i));
      dots.append(dot);
      return dot;
    });

    controls.append(prev, dots, next);
    this.append(this.caption, controls);
  }

  private renderBox(box: Box): HTMLElement {
    const el = document.createElement('div');
    el.className = `mv-box ${box.state ? `mv-box--${box.state}` : ''}`;
    el.dataset.box = box.id;

    if (box.name || box.type) {
      const head = document.createElement('div');
      head.className = 'mv-box__head';
      head.innerHTML = `${box.name ? `<span class="mv-box__name">${escape(box.name)}</span>` : ''}${
        box.type ? `<span class="mv-box__type">${escape(box.type)}</span>` : ''
      }`;
      el.append(head);
    }

    if (box.fields?.length) {
      const table = document.createElement('div');
      table.className = 'mv-box__fields';
      for (const field of box.fields) {
        const row = document.createElement('div');
        row.className = 'mv-field';
        if (field.anchor) row.dataset.anchor = field.anchor;
        row.innerHTML = `<span class="mv-field__k">${escape(field.k)}</span><span class="mv-field__v">${escape(field.v)}</span>`;
        table.append(row);
      }
      el.append(table);
    } else if (box.value !== undefined) {
      const value = document.createElement('div');
      value.className = 'mv-box__value';
      value.dataset.anchor = box.id;
      value.textContent = box.value;
      el.append(value);
    }

    if (box.note) {
      const note = document.createElement('div');
      note.className = 'mv-box__note';
      note.textContent = box.note;
      el.append(note);
    }
    return el;
  }

  private region(label: string, boxes: Box[] | undefined): HTMLElement {
    const region = document.createElement('div');
    region.className = `mv-region mv-region--${label.toLowerCase()}`;
    const heading = document.createElement('p');
    heading.className = 'mv-region__label';
    heading.textContent = label;
    region.append(heading);
    for (const box of boxes ?? []) region.append(this.renderBox(box));
    if (!boxes?.length) {
      const empty = document.createElement('p');
      empty.className = 'mv-region__empty';
      empty.textContent = 'empty';
      region.append(empty);
    }
    return region;
  }

  private show(index: number): void {
    const clamped = Math.max(0, Math.min(index, this.spec.steps.length - 1));
    this.index = clamped;
    const step = this.spec.steps[clamped];

    for (const child of [...this.stage.children]) {
      if (child !== this.overlay) child.remove();
    }
    this.stage.append(this.region('Stack', step.stack), this.region('Heap', step.heap));

    this.caption.innerHTML = `<span class="memviz__step">${clamped + 1}/${this.spec.steps.length}</span> ${escape(step.caption)}${
      step.note ? `<span class="memviz__note">${escape(step.note)}</span>` : ''
    }`;

    this.stepButtons.forEach((dot, i) => dot.classList.toggle('is-on', i === clamped));
    this.codeLines.forEach((line, i) => line.classList.toggle('is-current', i + 1 === step.line));

    requestAnimationFrame(() => this.drawArrows());
  }

  private drawArrows(): void {
    const step = this.spec.steps[this.index];
    const defs = this.overlay.querySelector('defs');
    this.overlay.replaceChildren(...(defs ? [defs] : []));

    const stageRect = this.stage.getBoundingClientRect();
    this.overlay.setAttribute('viewBox', `0 0 ${stageRect.width} ${stageRect.height}`);

    for (const arrow of step.arrows ?? []) {
      const fromEl = this.stage.querySelector<HTMLElement>(`[data-anchor="${CSS.escape(arrow.from)}"]`);
      const toEl = this.stage.querySelector<HTMLElement>(`[data-box="${CSS.escape(arrow.to)}"]`);
      if (!fromEl || !toEl) continue;

      const a = fromEl.getBoundingClientRect();
      const b = toEl.getBoundingClientRect();
      const y1 = a.top + a.height / 2 - stageRect.top;
      const y2 = b.top + Math.min(b.height / 2, 18) - stageRect.top;

      // When the target sits to the right (the usual stack→heap case) the arrow
      // leaves the right edge and enters the left. When it is in the same
      // column — a pointer to another stack object — that would double back
      // over the boxes, so route out to the left of both instead.
      const goesRight = b.left - a.right > 12;
      const x1 = goesRight ? a.right - stageRect.left - 4 : a.left - stageRect.left + 2;
      const x2 = goesRight ? b.left - stageRect.left - 2 : b.left - stageRect.left - 3;
      const control = goesRight
        ? x1 + Math.max(24, (x2 - x1) / 2)
        : Math.min(x1, x2) - 22;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${x1} ${y1} C ${control} ${y1}, ${control} ${y2}, ${x2} ${y2}`);
      path.setAttribute('class', `mv-arrow ${arrow.state === 'dangling' ? 'mv-arrow--dangling' : ''}`);
      path.setAttribute('marker-end', 'url(#mv-head)');
      this.overlay.append(path);

      if (arrow.label) {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', String(control));
        text.setAttribute('y', String((y1 + y2) / 2 - 6));
        text.setAttribute('class', 'mv-arrow__label');
        text.setAttribute('text-anchor', 'middle');
        text.textContent = arrow.label;
        this.overlay.append(text);
      }
    }
  }
}
