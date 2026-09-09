/**
 * `<tb-quiz>` — a check-your-understanding question.
 *
 * Every option carries an explanation, shown after answering whether the
 * reader was right or wrong: being told *why* the tempting wrong answer is
 * wrong is the part that teaches.
 */

interface Option {
  text: string;
  correct?: boolean;
  why?: string;
}

interface Spec {
  question: string;
  options: Option[];
}

const escape = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export class TbQuiz extends HTMLElement {
  connectedCallback(): void {
    const template = this.querySelector<HTMLTemplateElement>('template[data-role="spec"]');
    let spec: Spec;
    try {
      spec = JSON.parse(template?.content.textContent ?? '{}') as Spec;
    } catch {
      this.innerHTML = '<p class="memviz__error">This question\'s spec is not valid JSON.</p>';
      return;
    }
    if (!spec.question || !spec.options?.length) return;

    this.innerHTML = '';
    this.className = 'quiz';

    const question = document.createElement('p');
    question.className = 'quiz__question';
    question.innerHTML = escape(spec.question).replace(/`([^`]+)`/g, '<code>$1</code>');

    const list = document.createElement('ul');
    list.className = 'quiz__options';

    let answered = false;
    spec.options.forEach((option) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.className = 'quiz__option';
      button.type = 'button';
      button.innerHTML = escape(option.text).replace(/`([^`]+)`/g, '<code>$1</code>');

      button.addEventListener('click', () => {
        if (answered) return;
        answered = true;
        this.classList.add('is-answered');

        for (const [i, other] of [...list.querySelectorAll('button')].entries()) {
          const spec_i = spec.options[i];
          other.classList.add(spec_i.correct ? 'is-correct' : 'is-wrong');
          other.disabled = true;
          if (spec_i.why) {
            const why = document.createElement('p');
            why.className = 'quiz__why';
            why.innerHTML = escape(spec_i.why).replace(/`([^`]+)`/g, '<code>$1</code>');
            other.parentElement?.append(why);
          }
        }
        button.classList.add('is-chosen');
      });

      item.append(button);
      list.append(item);
    });

    this.append(question, list);
  }
}
