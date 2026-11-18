(function () {
  'use strict';

  const storageKey = 'ancal-calibration-expiry-v1';
  const dayMilliseconds = 86400000;
  const h = value => escapeHtml(value);
  const copy = value => JSON.parse(JSON.stringify(value));
  const digits = value => window.ancalIdentity ? window.ancalIdentity.key(value) : String(value || '').replace(/\D/g, '');
  const validOwner = value => window.ancalIdentity ? window.ancalIdentity.validDocument(value) : [11,14].includes(digits(value).length);
  const tagKey = value => String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const canonicalId = item => digits(item.cnpj) + '-' + tagKey(item.tag);
  const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  let dates = {};
  let activeTooltip = null;

  function daysInMonth(year, month) { return new Date(Date.UTC(year, month, 0)).getUTCDate(); }
  function validISO(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    return year >= 1000 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
  }
  function validMonthISO(value) {
    if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return false;
    return Number(value.slice(0, 4)) >= 1000;
  }
  function validScheduleISO(value) { return validISO(value) || validMonthISO(value); }
  function iso(year, month, day) { return String(year).padStart(4, '0') + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0'); }
  function todayISO() {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const part = key => parts.find(value => value.type === key).value;
    return part('year') + '-' + part('month') + '-' + part('day');
  }
  function horizonISO() {
    const [year, month, day] = todayISO().split('-').map(Number);
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    return iso(nextYear, nextMonth, Math.min(day, daysInMonth(nextYear, nextMonth)));
  }
  function ordinal(value) {
    const [year, month, day] = value.split('-').map(Number);
    return Math.floor(Date.UTC(year, month - 1, day) / dayMilliseconds);
  }
  function addDays(value, count) { return new Date((ordinal(value) + count) * dayMilliseconds).toISOString().slice(0, 10); }
  function formatDate(value) { return validMonthISO(value) ? value.slice(5, 7) + '/' + value.slice(0, 4) : validISO(value) ? value.slice(8, 10) + '/' + value.slice(5, 7) + '/' + value.slice(0, 4) : 'A definir'; }
  function isPortal() { return typeof portalMode !== 'undefined' && portalMode === true; }
  function companyList() { return window.ancalAccess?.getCompanies() || clients.map(client => ({ name: client[0], cnpj: client[1], city: '' })); }
  function mayView(cnpj) {
    if (!isPortal()) return validOwner(cnpj);
    const account = window.ancalAccess?.getPreviewAccount();
    if (!account || account.status !== 'active') return false;
    const allowed = window.ancalAccess.getAllowedCompanies(account.id);
    const selected = document.querySelector('#clientCompanySelect')?.value;
    const company = allowed.find(item => item.id === selected);
    return Boolean(company && digits(company.cnpj) === digits(cnpj));
  }
  function catalog() {
    const seen = new Set();
    const account = isPortal() ? window.ancalAccess?.getPreviewAccount() : null;
    const selected = isPortal() ? document.querySelector('#clientCompanySelect')?.value : '';
    const company = account ? window.ancalAccess.getAllowedCompanies(account.id).find(item => item.id === selected) : null;
    const items = isPortal() ? window.ancalEquipment?.forCompany(company?.cnpj) : window.ancalEquipment?.getAll();
    return (items || []).filter(item => {
      if (!item || item.incomplete || !validOwner(item.cnpj) || !item.name || !tagKey(item.tag)) return false;
      const id = canonicalId(item);
      if (seen.has(id)) return false;
      seen.add(id); return true;
    });
  }
  function persist() { try { localStorage.setItem(storageKey, JSON.stringify({ dates })); } catch (_) { /* Keep the calendar snapshot usable for this session. */ } }
  function initialize() {
    let stored = false;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (saved && saved.dates && typeof saved.dates === 'object' && !Array.isArray(saved.dates)) {
        stored = true;
        Object.entries(saved.dates).forEach(([id, value]) => { if (validScheduleISO(value)) dates[id] = value; });
      }
    } catch (_) { /* Initialize a new illustrative snapshot when storage cannot be read. */ }
    if (!stored) {
      const offsets = {
        '12345678000190-bal-024': 10,
        '12345678000190-auto-012': 25,
        '12345678000190-term-045': 90,
        '45890123000117-pip-118': 5,
        '45890123000117-cent-018': 80,
        '08765432000155-th-036': 20,
        '23456789000122-term-057': -7,
        '44371412000130-ph-009': 120
      };
      const today = todayISO();
      catalog().forEach(item => {
        const id = canonicalId(item);
        if (Object.hasOwn(offsets, id)) dates[id] = addDays(today, offsets[id]);
      });
    }
    catalog().forEach(item => {
      if (Object.hasOwn(item, 'nextCalibrationISO')) {
        if (validScheduleISO(item.nextCalibrationISO)) dates[canonicalId(item)] = item.nextCalibrationISO;
        else delete dates[canonicalId(item)];
      }
    });
    persist();
  }
  function schedule(item) {
    const id = canonicalId(item);
    let next = dates[id] || '';
    if (Object.hasOwn(item, 'nextCalibrationISO')) {
      next = validScheduleISO(item.nextCalibrationISO) ? item.nextCalibrationISO : '';
      if (next && dates[id] !== next) { dates[id] = next; persist(); }
      else if (!next && Object.hasOwn(dates, id)) { delete dates[id]; persist(); }
    }
    if (!validScheduleISO(next)) return { nextCalibrationISO: '', state: 'unknown', daysRemaining: null };
    if (validMonthISO(next)) return { nextCalibrationISO: next, state: next < todayISO().slice(0, 7) ? 'expired' : next <= horizonISO().slice(0, 7) ? 'soon' : 'ok', precision: 'month', daysRemaining: null, label: 'Mês/ano informado' };
    const remaining = ordinal(next) - ordinal(todayISO());
    return { nextCalibrationISO: next, state: remaining < 0 ? 'expired' : ordinal(next) <= ordinal(horizonISO()) ? 'soon' : 'ok', precision: 'day', daysRemaining: remaining };
  }
  function scheduleFor(cnpj, tag) {
    if (!mayView(cnpj)) return { nextCalibrationISO: '', state: 'unknown', daysRemaining: null };
    const item = catalog().find(entry => digits(entry.cnpj) === digits(cnpj) && tagKey(entry.tag) === tagKey(tag));
    return item ? copy(schedule(item)) : { nextCalibrationISO: '', state: 'unknown', daysRemaining: null };
  }
  function withSchedule(item) {
    return {
      id: canonicalId(item), cnpj: item.cnpj, client: String(item.client || ''), name: String(item.name || ''),
      tag: String(item.tag || ''), serial: String(item.serial || ''), ...schedule(item)
    };
  }
  function orderAlerts(items) { return items.sort((a, b) => a.nextCalibrationISO.localeCompare(b.nextCalibrationISO) || a.name.localeCompare(b.name, 'pt-BR')); }
  function forCompany(cnpj) {
    if (!mayView(cnpj)) return [];
    return copy(orderAlerts(catalog().filter(item => digits(item.cnpj) === digits(cnpj)).map(withSchedule).filter(item => item.state === 'soon')));
  }
  function all() {
    if (isPortal()) return [];
    return copy(orderAlerts(catalog().map(withSchedule).filter(item => item.state === 'soon')));
  }
  function daysLabel(item) {
    if (item.state === 'unknown') return 'Data não informada';
    if (validMonthISO(item.nextCalibrationISO)) return 'Mês/ano informado';
    if (item.daysRemaining === 0) return 'Vence hoje';
    if (item.daysRemaining < 0) return `Vencido há ${Math.abs(item.daysRemaining)} ${item.daysRemaining === -1 ? 'dia' : 'dias'}`;
    return `Em ${item.daysRemaining} ${item.daysRemaining === 1 ? 'dia' : 'dias'}`;
  }
  function badge(cnpj) {
    if (!forCompany(cnpj).length) return '';
    const tooltipId = 'expiry-tip-' + digits(cnpj);
    return `<button type="button" class="expiry-client-indicator" title="Calibração vencendo" aria-label="Calibração vencendo" aria-describedby="${tooltipId}" data-expiry-action="open" data-expiry-company="${h(cnpj)}" data-expiry-cnpj="${h(cnpj)}"><span class="expiry-indicator-dot" aria-hidden="true"></span><span class="expiry-tooltip" id="${tooltipId}" role="tooltip">Calibração vencendo</span></button>`;
  }
  function banner(cnpj) {
    if (cnpj ? !mayView(cnpj) : isPortal()) return '';
    const items = cnpj ? forCompany(cnpj) : all();
    return `<section class="expiry-banner${items.length ? '' : ' is-empty'}" data-expiry-from="${todayISO()}" data-expiry-through="${horizonISO()}"><span class="expiry-banner-icon" aria-hidden="true">◷</span><div class="expiry-banner-copy"><strong>${items.length} ${items.length === 1 ? 'equipamento com calibração vencendo' : 'equipamentos com calibração vencendo'}</strong><span>Próximo 1 mês calendário · ${formatDate(todayISO())} a ${formatDate(horizonISO())}, incluindo hoje.</span></div><button type="button" class="btn" data-expiry-action="open" ${cnpj ? `data-expiry-cnpj="${h(cnpj)}"` : ''}>Ver alertas →</button></section>`;
  }
  function modalList(items) {
    return items.length ? `<ul class="expiry-modal-list">${items.map(item => `<li><div class="expiry-list-instrument"><strong>${h(item.name)}</strong><span>${h(item.tag)} · ${h(item.client)}</span></div><div class="expiry-list-date"><strong>${formatDate(item.nextCalibrationISO)}</strong><span>${h(daysLabel(item))}</span></div></li>`).join('')}</ul>` : '<div class="expiry-modal-empty"><strong>Nenhuma calibração vencendo neste período.</strong><span>Os alertas incluem hoje e vão até um mês calendário à frente.</span></div>';
  }
  function openCompany(cnpj) {
    if (!mayView(cnpj)) return;
    hideTooltip();
    const company = companyList().find(item => digits(item.cnpj) === digits(cnpj));
    const items = forCompany(cnpj);
    openModal('Calibrações vencendo', (company?.name || cnpj) + ' · até ' + formatDate(horizonISO()), `${modalList(items)}<p class="expiry-data-note">Datas ilustrativas de calibração para esta demonstração. O prazo de uma OS é acompanhado separadamente.</p><div class="modal-actions"><button type="button" class="btn btn-primary" data-expiry-action="close">Entendi</button></div>`);
  }
  function openAll() {
    if (isPortal()) return;
    hideTooltip();
    openModal('Calibrações vencendo', 'Equipamentos do laboratório · até ' + formatDate(horizonISO()), `${modalList(all())}<p class="expiry-data-note">Datas ilustrativas de calibração para esta demonstração. O período inclui hoje e exclui datas já vencidas.</p><div class="modal-actions"><button type="button" class="btn btn-primary" data-expiry-action="close">Entendi</button></div>`);
  }
  function companyDetail(cnpj) {
    if (isPortal()) return;
    hideTooltip();
    const company = companyList().find(item => digits(item.cnpj) === digits(cnpj));
    if (!company) return;
    openModal('Cadastro da empresa', company.name, `<div class="record-detail"><div><span>Empresa</span><strong>${h(company.name)}</strong></div><div><span>CNPJ</span><strong>${h(company.cnpj)}</strong></div><div><span>Cidade</span><strong>${h(company.city || 'A informar')}</strong></div></div>${banner(company.cnpj)}<div class="modal-actions"><button type="button" class="btn" data-expiry-action="close">Fechar</button></div>`);
  }
  function devNote() {
    return '<aside class="expiry-dev-note"><span class="expiry-dev-label">NOTA DE DESENVOLVIMENTO</span><strong>Alerta antecipado dos padrões de referência</strong><p>Na versão definitiva, enviar e-mails de alerta sobre os padrões de referência dois meses antes do vencimento.</p><small>Fluxo previsto. Nenhum e-mail é enviado neste protótipo.</small></aside>';
  }
  function stateLabel(item) {
    const label = { soon: 'Vencendo em 1 mês', expired: 'Já vencido', ok: 'Em dia', unknown: 'Sem data informada' }[item.state];
    return `<span class="expiry-status expiry-status-${item.state}"><i aria-hidden="true"></i>${label}</span>`;
  }
  function renderCalibrations() {
    if (isPortal()) return '';
    const items = catalog().map(withSchedule);
    return `${heading('Calibrações', 'Acompanhe a próxima calibração de cada instrumento do catálogo.', '<button type="button" class="btn btn-primary" data-expiry-action="open">Ver alertas de vencimento</button>')}${banner()}
      <section class="panel table-panel expiry-panel"><div class="expiry-section-head"><div><h2>Agenda de calibração dos equipamentos</h2><p>Uma linha por instrumento · datas de calibração independentes do prazo da OS</p></div><div class="expiry-tools"><input type="search" class="expiry-search" aria-label="Buscar equipamento, cliente ou identificação" placeholder="Buscar equipamento ou cliente"><select id="calibrationExpiryFilter" class="expiry-filter" name="calibrationExpiryFilter" aria-label="Filtrar vencimento"><option value="all">Todos os equipamentos</option><option value="soon">Vencendo em 1 mês</option><option value="expired">Já vencidos</option><option value="unknown">Sem data informada</option></select></div></div><div class="table-scroll"><table class="expiry-table"><thead><tr><th>CLIENTE / CNPJ</th><th>EQUIPAMENTO / IDENTIFICAÇÃO</th><th>PRÓXIMA CALIBRAÇÃO</th><th>CONTAGEM</th><th>SITUAÇÃO</th></tr></thead><tbody>${items.map(item => `<tr data-expiry-state="${item.state}" data-expiry-search="${h(fold([item.client, item.cnpj, item.name, item.tag, item.serial].join(' ')))}"><td class="client-cell"><strong>${h(item.client || 'A informar')}</strong><span>${h(item.cnpj)}</span></td><td class="client-cell"><strong>${h(item.name)}</strong><span>${h(item.tag)}</span></td><td>${formatDate(item.nextCalibrationISO)}</td><td>${h(daysLabel(item))}</td><td>${stateLabel(item)}</td></tr>`).join('')}</tbody></table></div><div class="expiry-empty" ${items.length ? 'hidden' : ''}><strong>Nenhum equipamento encontrado.</strong><span>Revise a busca ou o filtro de vencimento.</span></div><div class="expiry-table-footer"><span data-expiry-result aria-live="polite">${items.length} ${items.length === 1 ? 'equipamento' : 'equipamentos'}</span><span>Calendário de calibração</span></div></section><p class="expiry-data-note">Datas ilustrativas, salvas neste navegador. Equipamentos novos sem uma data explícita são exibidos como “Sem data informada”.</p>`;
  }
  function filterRows(control) {
    if (isPortal()) return;
    const panel = control.closest('.expiry-panel');
    if (!panel) return;
    const query = fold(panel.querySelector('.expiry-search')?.value.trim());
    const state = panel.querySelector('#calibrationExpiryFilter')?.value || 'all';
    let visible = 0;
    panel.querySelectorAll('tbody tr').forEach(row => {
      row.hidden = !row.dataset.expirySearch.includes(query) || (state !== 'all' && row.dataset.expiryState !== state);
      if (!row.hidden) visible++;
    });
    const empty = panel.querySelector('.expiry-empty'), result = panel.querySelector('[data-expiry-result]');
    if (empty) empty.hidden = visible > 0;
    if (result) result.textContent = `${visible} ${visible === 1 ? 'equipamento' : 'equipamentos'}`;
  }
  function hideTooltip() {
    if (!activeTooltip) return;
    const { button, tooltip } = activeTooltip;
    tooltip.classList.remove('is-floating', 'is-below');
    tooltip.style.left = ''; tooltip.style.top = '';
    if (button.isConnected) button.appendChild(tooltip); else tooltip.remove();
    activeTooltip = null;
  }
  function showTooltip(button) {
    if (activeTooltip?.button === button) return;
    hideTooltip();
    const tooltip = button.querySelector('.expiry-tooltip');
    if (!tooltip || typeof button.getBoundingClientRect !== 'function') return;
    const rect = button.getBoundingClientRect();
    // Mount in the document layer so table scrolling cannot clip the tooltip.
    document.body.appendChild(tooltip);
    tooltip.classList.add('is-floating');
    const bounds = tooltip.getBoundingClientRect();
    const width = bounds.width || 160, height = bounds.height || 30;
    const center = Math.max(width / 2 + 10, Math.min(window.innerWidth - width / 2 - 10, rect.left + rect.width / 2));
    const below = rect.top < height + 12;
    tooltip.style.left = center + 'px';
    tooltip.style.top = (below ? rect.bottom + 9 : rect.top - height - 9) + 'px';
    tooltip.classList.toggle('is-below', below);
    activeTooltip = { button, tooltip };
  }

  document.addEventListener('click', event => {
    const control = event.target.closest('[data-expiry-action]') || event.target.closest('[data-expiry-company]');
    if (!control) return;
    const cnpj = control.dataset.expiryCnpj || control.dataset.expiryCompany;
    switch (control.dataset.expiryAction || 'open') {
      case 'open': if (cnpj) openCompany(cnpj); else openAll(); break;
      case 'company': if (cnpj) companyDetail(cnpj); break;
      case 'close': closeModal(); break;
    }
  });
  document.addEventListener('input', event => { if (event.target.matches('.expiry-search')) filterRows(event.target); });
  document.addEventListener('change', event => { if (event.target.matches('#calibrationExpiryFilter')) filterRows(event.target); });
  document.addEventListener('pointerover', event => { const button = event.target.closest('.expiry-client-indicator'); if (button) showTooltip(button); });
  document.addEventListener('focusin', event => { const button = event.target.closest('.expiry-client-indicator'); if (button) showTooltip(button); });
  document.addEventListener('pointerout', event => {
    if (activeTooltip && !activeTooltip.button.contains(event.relatedTarget) && !activeTooltip.button.matches(':focus-visible')) hideTooltip();
  });
  document.addEventListener('focusout', event => { if (activeTooltip && !activeTooltip.button.contains(event.relatedTarget)) hideTooltip(); });
  window.addEventListener?.('scroll', hideTooltip, true);
  window.addEventListener?.('resize', hideTooltip);

  initialize();
  window.ancalExpiry = { todayISO, horizonISO, forCompany, all, scheduleFor, badge, banner, openCompany, openAll, companyDetail, devNote, renderCalibrations };
})();
