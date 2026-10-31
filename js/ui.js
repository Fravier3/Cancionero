// Componentes de interfaz reutilizables: ventanas de diálogo y avisos.
import { esc } from './util.js';

const root = () => document.getElementById('modal-root');

/**
 * Muestra un diálogo y devuelve { value, text } con el botón pulsado y el texto escrito.
 * Si se cierra con Escape o tocando fuera, value es 'cancel'.
 */
export function modal({ title, message = '', input = null, buttons }) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    const inputHtml = input
      ? `<input class="modal-input" type="text" maxlength="${input.maxLength ?? 60}"
           placeholder="${esc(input.placeholder ?? '')}" value="${esc(input.value ?? '')}"
           autocomplete="off" autocapitalize="sentences" enterkeyhint="done" aria-label="${esc(input.label ?? title)}">`
      : '';
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h2 id="modal-title">${esc(title)}</h2>
        ${message ? `<p>${esc(message)}</p>` : ''}
        ${inputHtml}
        <div class="modal-actions">
          ${buttons
            .map((b) => `<button type="button" class="btn ${esc(b.kind ?? 'ghost')}" data-value="${esc(b.value)}">${esc(b.label)}</button>`)
            .join('')}
        </div>
      </div>`;
    root().appendChild(backdrop);
    const field = backdrop.querySelector('.modal-input');
    const primary = buttons.find((b) => b.kind === 'primary' || b.kind === 'danger') ?? buttons[0];

    const finish = (value) => {
      document.removeEventListener('keydown', onKey, true);
      backdrop.remove();
      resolve({ value, text: field ? field.value.trim() : '' });
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        finish('cancel');
      } else if (e.key === 'Enter' && field && document.activeElement === field) {
        e.preventDefault();
        finish(primary.value);
      }
    };
    document.addEventListener('keydown', onKey, true);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) finish('cancel');
      const btn = e.target.closest('button[data-value]');
      if (btn) finish(btn.dataset.value);
    });
    requestAnimationFrame(() => (field ?? backdrop.querySelector('button.primary, button.danger, button'))?.focus());
  });
}

export async function confirmBox({ title, message, okLabel = 'Aceptar', danger = false, cancelLabel = 'Cancelar' }) {
  const { value } = await modal({
    title,
    message,
    buttons: [
      { label: cancelLabel, value: 'cancel', kind: 'ghost' },
      { label: okLabel, value: 'ok', kind: danger ? 'danger' : 'primary' },
    ],
  });
  return value === 'ok';
}

/** Pide un texto corto. Devuelve el texto o null si se cancela. */
export async function askText({ title, message, placeholder, value, okLabel = 'Guardar', label, maxLength=60 }) {
  const result = await modal({
    title,
    message,
    input: { placeholder, value, label, maxLength },
    buttons: [
      { label: 'Cancelar', value: 'cancel', kind: 'ghost' },
      { label: okLabel, value: 'ok', kind: 'primary' },
    ],
  });
  return result.value === 'ok' ? result.text : null;
}

let toastTimer = 0;

export function toast(message, ms = 2600) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}
