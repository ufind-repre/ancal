(function () {
  'use strict';

  let editor = null;
  function currentEditor() {
    if (editor && (!editor.cell.isConnected || !app.contains(editor.cell))) editor = null;
    return editor;
  }
  function editable(cell) {
    return !portalMode && cell?.isConnected && app.contains(cell) && !cell.closest('[inert]');
  }
  function recordFor(cell) { return records.find(record => record.id === cell.dataset.workplaceCell); }
  function restore(cell, record) {
    cell.classList.remove('is-editing');
    cell.innerHTML = orderWorkplaceControl(record);
  }
  function cancel(restoreFocus = true) {
    const active = currentEditor();
    if (!active || !editable(active.cell)) return;
    const record = recordFor(active.cell);
    if (!record) return;
    restore(active.cell, record);
    editor = null;
    if (restoreFocus) active.cell.querySelector('[data-workplace-action="edit"]')?.focus({ preventScroll: true });
  }
  function start(cell) {
    if (!editable(cell)) return;
    const record = recordFor(cell);
    if (!record || !isOpenServiceOrder(record)) return;
    const active = currentEditor();
    if (active?.cell === cell) { active.form.querySelector('input')?.focus(); return; }
    if (active) cancel(false);
    const value = typeof record.workplace === 'string' ? record.workplace.trim() : '';
    const inputId = 'workplace-edit-' + record.id;
    const errorId = inputId + '-error';
    cell.classList.add('is-editing');
    cell.innerHTML = `<form class="workplace-inline-form" data-workplace-order="${escapeHtml(record.id)}" novalidate><label for="${escapeHtml(inputId)}">Local de trabalho</label><input id="${escapeHtml(inputId)}" name="workplace" type="text" required maxlength="120" value="${escapeHtml(value)}" autocomplete="off" aria-describedby="${escapeHtml(errorId)}" placeholder="Informe o local"><div class="workplace-inline-actions"><button type="submit" class="btn btn-primary">Salvar</button><button type="button" class="btn" data-workplace-action="cancel">Cancelar</button></div><small>Enter salva · Esc cancela</small><p id="${escapeHtml(errorId)}" class="workplace-inline-error" role="alert" hidden></p></form>`;
    const form = cell.querySelector('.workplace-inline-form');
    editor = { cell, form, id: record.id };
    const input = form.querySelector('input');
    input.focus({ preventScroll: true });
    input.select();
  }
  function commit(form) {
    const active = currentEditor();
    if (!active || active.form !== form || !editable(active.cell) || form.dataset.workplaceOrder !== active.id) return;
    const record = recordFor(active.cell);
    if (!record || record.id !== active.id) return;
    if (!isOpenServiceOrder(record)) { restore(active.cell,record); editor=null; showToast('OS finalizada: os dados estão disponíveis somente para consulta.'); return; }
    const input = form.querySelector('input[name="workplace"]');
    const value = input.value.trim();
    const error = form.querySelector('.workplace-inline-error');
    if (!value || value.length > 120) {
      error.textContent = 'Informe o local com até 120 caracteres.';
      error.hidden = false;
      input.setAttribute('aria-invalid', 'true');
      input.focus({ preventScroll: true });
      return;
    }
    record.workplace = value;
    saveDemo();
    const cell = active.cell;
    restore(cell, record);
    editor = null;
    const row = cell.closest('tr');
    row.dataset.search = [record.id, record.client, record.equipment, record.tag, orderWorkplace(record)].join(' ').toLowerCase();
    const panel = cell.closest('.panel');
    const search = panel?.querySelector('.search');
    if (search) filterRows(search);
    const destination = row.hidden ? search : cell.querySelector('[data-workplace-action="edit"]');
    destination?.focus({ preventScroll: true });
    showToast('Local de trabalho atualizado.');
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-workplace-action]');
    if (!button || portalMode) return;
    const cell = button.closest('[data-workplace-cell]');
    if (!editable(cell)) return;
    if (button.dataset.workplaceAction === 'edit') start(cell);
    else if (button.dataset.workplaceAction === 'cancel' && currentEditor()?.cell === cell) cancel();
  });
  document.addEventListener('submit', event => {
    if (!event.target.matches('.workplace-inline-form')) return;
    event.preventDefault();
    if (!portalMode) commit(event.target);
  });
  document.addEventListener('keydown', event => {
    const active = currentEditor();
    if (!active || portalMode || !active.form.contains(event.target)) return;
    if (event.key === 'Escape') { event.preventDefault(); cancel(); }
    else if (event.key === 'Enter' && !event.isComposing && event.target.matches('input[name="workplace"]')) { event.preventDefault(); commit(active.form); }
  });
  document.addEventListener('input', event => {
    const active = currentEditor();
    if (!active || portalMode || !active.form.contains(event.target)) return;
    active.form.querySelector('.workplace-inline-error').hidden = true;
    event.target.removeAttribute('aria-invalid');
  });
})();
