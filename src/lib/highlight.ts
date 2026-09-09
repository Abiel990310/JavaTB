/**
 * A small Java tokenizer for text the reader types.
 *
 * Chapter prose is highlighted at build time by Shiki, which is far more
 * accurate. This exists for the live editor and the bytecode panel, where the
 * text changes as you type and a 2 MB grammar engine would not pay for itself.
 */

const KEYWORDS = new Set(
  `abstract assert boolean break byte case catch char class const continue default do double
   else enum extends final finally float for goto if implements import instanceof int
   interface long native new package private protected public return short static strictfp
   super switch synchronized this throw throws transient try void volatile while
   false null true
   var yield record sealed permits non-sealed`.split(/\s+/),
);

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const span = (cls: string, text: string): string => `<span class="t-${cls}">${escapeHtml(text)}</span>`;

/** Ordered: the first pattern that matches at the cursor wins. */
const RULES: ReadonlyArray<{ re: RegExp; cls: string | null }> = [
  { re: /^\/\/[^\n]*/, cls: 'comment' },
  { re: /^\/\*[\s\S]*?(?:\*\/|$)/, cls: 'comment' },
  { re: /^@[A-Za-z_]\w*/, cls: 'preproc' },
  { re: /^"""[\s\S]*?(?:"""|$)/, cls: 'string' },
  { re: /^"(?:[^"\\\n]|\\.)*"?/, cls: 'string' },
  { re: /^'(?:[^'\\\n]|\\.)*'?/, cls: 'string' },
  { re: /^\b\d[\d'a-zA-Z.+-]*\b/, cls: 'number' },
  { re: /^[A-Za-z_]\w*(?=\s*\()/, cls: 'fn' },
  { re: /^[A-Za-z_]\w*/, cls: null }, // resolved below: keyword, type, or plain
  { re: /^[{}()[\]<>;,.:?~!%^&*+\-/=|]+/, cls: 'punct' },
  { re: /^\s+/, cls: null },
];

export function highlightSource(code: string): string {
  let out = '';
  let rest = code;

  while (rest.length > 0) {
    let matched = false;

    for (const rule of RULES) {
      const m = rule.re.exec(rest);
      if (!m || m[0].length === 0) continue;
      const text = m[0];

      if (rule.cls) {
        out += span(rule.cls, text);
      } else if (/^[A-Za-z_]/.test(text)) {
        if (KEYWORDS.has(text)) out += span('kw', text);
        else if (/^[A-Z]/.test(text)) out += span('type', text);
        else out += escapeHtml(text);
      } else {
        out += escapeHtml(text);
      }

      rest = rest.slice(text.length);
      matched = true;
      break;
    }

    if (!matched) {
      out += escapeHtml(rest[0]);
      rest = rest.slice(1);
    }
  }
  return out;
}

/**
 * javap output is simple enough to colour with three passes: an offset, a
 * mnemonic, a constant-pool reference, and a trailing `//` comment naming what
 * the reference resolves to.
 */
export function highlightBytecode(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const comment = line.indexOf('//');
      const code = comment === -1 ? line : line.slice(0, comment);
      const trailing = comment === -1 ? '' : span('comment', line.slice(comment));

      const body = escapeHtml(code)
        // "  12: " — the offset of an instruction within its method.
        .replace(/^(\s*)(\d+):/, '$1<span class="t-label">$2:</span>')
        // The mnemonic itself: aload_0, invokevirtual, ifeq, goto.
        .replace(/^(\s*(?:<span class="t-label">\d+:<\/span>)?\s+)([a-z][a-z0-9_]*)/, '$1<span class="t-kw">$2</span>')
        // Constant-pool entries and immediate operands.
        .replace(/(#\d+|\b\d+\b)/g, '<span class="t-number">$1</span>');

      return body + trailing;
    })
    .join('\n');
}
