(function () {
  'use strict';

  const storageKey = 'ancal-equipment-v1';
  const clone = value => JSON.parse(JSON.stringify(value));
  const h = value => escapeHtml(value);
  const digits = value => window.ancalIdentity ? window.ancalIdentity.key(value) : String(value || '').replace(/\D/g, '');
  const validOwner = value => window.ancalIdentity ? window.ancalIdentity.validDocument(value) : [11,14].includes(digits(value).length);
  const clean = value => String(value == null ? '' : value).trim();
  const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value+'T12:00:00Z').getTime()) && new Date(value+'T12:00:00Z').toISOString().slice(0,10) === value;
  const validMonth = value => /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) >= 1000 && validDate(value + '-01');
  const validNextCalibration = value => validDate(value) || validMonth(value);
  const tagKey = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const cnpjText = value => window.ancalIdentity ? window.ancalIdentity.format(value) : digits(value).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  const stableId = (cnpj, tag) => validOwner(cnpj) && tagKey(tag) ? digits(cnpj) + '-' + tagKey(tag) : '';
  const metadata = {
    '12345678000190-bal-024': 'Sartorius',
    '45890123000117-pip-118': 'Eppendorf',
    '08765432000155-th-036': 'Testo',
    '23456789000122-term-057': 'Incoterm',
    '12345678000190-auto-012': 'Phoenix',
    '44371412000130-ph-009': 'Metrohm',
    '12345678000190-term-045': 'Incoterm',
    '45890123000117-cent-018': 'Fanem'
  };
  const optionalText = ['model', 'clientSector', 'className', 'observations', 'certificateObservation'];
  const optionalFields = [...optionalText, 'active', 'calibrationFrequencyMonths', 'measurementRanges', 'additionalFields', 'nextCalibrationISO'];
  const rangeFields = ['tableId', 'label', 'min', 'max', 'unit', 'resolution'];
  const editableFields = ['name', 'manufacturer', 'serial', ...optionalFields];
  const textLimits = { name: 120, tag: 60, manufacturer: 100, serial: 160, model: 160, clientSector: 160, className: 100, observations: 5000, certificateObservation: 5000 };
  let catalog = [];
  let completedLegacyKeys = [];
  let storageExtras = {};
  const formSessions = new WeakMap();

  function companies() {
    return window.ancalAccess?.getCompanies() || clients.map(client => ({ name: client[0], cnpj: client[1] }));
  }
  function isPortal() { return typeof portalMode !== 'undefined' && portalMode === true; }
  function mayView(cnpj) {
    if (!isPortal()) return true;
    const account = window.ancalAccess?.getPreviewAccount();
    if (!account || account.status !== 'active') return false;
    const selected = document.querySelector('#clientCompanySelect')?.value;
    const company = window.ancalAccess.getAllowedCompanies(account.id).find(item => item.id === selected);
    return Boolean(company && digits(company.cnpj) === digits(cnpj));
  }
  function optionalFrom(value) {
    return Object.fromEntries(optionalFields.filter(key => Object.hasOwn(value || {}, key)).map(key => [key, value[key]]));
  }
  function normalize(snapshot, order = {}, preserveUnknown = false) {
    const cnpj = digits(snapshot.cnpj || order.cnpj);
    const tag = clean(snapshot.tag == null ? order.tag : snapshot.tag);
    const id = stableId(cnpj, tag);
    const item = {
      ...(preserveUnknown ? clone(snapshot) : {}),
      id,
      cnpj: validOwner(cnpj) ? cnpjText(cnpj) : '',
      client: clean(snapshot.client == null ? order.client : snapshot.client),
      name: clean(snapshot.name == null ? snapshot.equipment == null ? order.equipment : snapshot.equipment : snapshot.name),
      tag,
      serial: clean(snapshot.serial == null ? order.serial : snapshot.serial),
      manufacturer: clean(snapshot.manufacturer == null ? order.manufacturer : snapshot.manufacturer) || metadata[id] || ''
    };
    optionalText.forEach(key => { if (Object.hasOwn(snapshot, key)) item[key] = ['observations','certificateObservation'].includes(key) ? String(snapshot[key] == null ? '' : snapshot[key]).replace(/\r\n?/g, '\n') : clean(snapshot[key]); });
    if (Object.hasOwn(snapshot, 'active')) item.active = snapshot.active === true;
    if (Object.hasOwn(snapshot, 'calibrationFrequencyMonths')) {
      const frequency = Number(snapshot.calibrationFrequencyMonths);
      if (Number.isInteger(frequency) && frequency >= 0 && frequency <= 1200) item.calibrationFrequencyMonths = frequency;
      else delete item.calibrationFrequencyMonths;
    }
    if (Object.hasOwn(snapshot, 'nextCalibrationISO')) item.nextCalibrationISO = validNextCalibration(clean(snapshot.nextCalibrationISO)) ? clean(snapshot.nextCalibrationISO) : '';
    if (Object.hasOwn(snapshot, 'measurementRanges')) item.measurementRanges = (Array.isArray(snapshot.measurementRanges) ? snapshot.measurementRanges : []).filter(row => row && typeof row === 'object' && !Array.isArray(row)).map(row => ({
      ...(preserveUnknown ? clone(row) : {}), ...Object.fromEntries(rangeFields.map(key => [key, clean(row[key])]))
    }));
    if (Object.hasOwn(snapshot, 'additionalFields')) item.additionalFields = (Array.isArray(snapshot.additionalFields) ? snapshot.additionalFields : []).filter(row => row && typeof row === 'object' && !Array.isArray(row)).map(row => ({
      ...(preserveUnknown ? clone(row) : {}), label: clean(row.label), value: String(row.value == null ? '' : row.value).replace(/\r\n?/g, '\n')
    }));
    return item;
  }
  function complete(item) { return Boolean(item && item.id && validOwner(item.cnpj) && item.name && item.tag && tagKey(item.tag)); }
  function fromOrder(record) {
    if (!record || typeof record !== 'object' || !validOwner(record.cnpj)) return [];
    if (!mayView(record.cnpj)) return [];
    const snapshots = Array.isArray(record.equipments) && record.equipments.length ? record.equipments : [{ name: record.equipment, tag: record.tag, serial: record.serial, manufacturer: record.manufacturer, ...optionalFrom(record) }];
    const seen = new Set(), owner = digits(record.cnpj);
    return snapshots.filter(snapshot => snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)).map(snapshot => normalize(snapshot, record, true)).filter(item => {
      // An order's items share its company; never import another company's snapshot.
      if (digits(item.cnpj) !== owner) return false;
      if (!item.name && !item.tag) return false;
      const key = item.id || [item.cnpj, item.name, item.tag].join('|');
      if (seen.has(key)) return false;
      seen.add(key); return true;
    }).map(item => clone(item));
  }
  function insertComplete(item, replace = false) {
    if (!complete(item)) return;
    const index = catalog.findIndex(existing => !existing.incomplete && existing.id === item.id);
    if (index < 0) catalog.push(item);
    else if (replace) catalog[index] = item;
  }
  function legacyKey(entry, index) {
    const value = [index, entry.name || '', entry.notes || ''].join('|');
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
    return 'legacy-' + index + '-' + (hash >>> 0).toString(36);
  }
  function readLegacy() {
    const entries = typeof demoEntries !== 'undefined' && Array.isArray(demoEntries.equipamentos) ? demoEntries.equipamentos : [];
    entries.forEach((entry, index) => {
      if (!entry || typeof entry !== 'object') return;
      const sourceKey = legacyKey(entry, index);
      if (completedLegacyKeys.includes(sourceKey) || catalog.some(item => item.legacyKey === sourceKey)) return;
      catalog.push({ id: sourceKey, cnpj: '', client: '', name: clean(entry.name), tag: '', serial: '', manufacturer: '', incomplete: true, legacyKey: sourceKey, notes: clean(entry.notes) });
    });
  }
  function seed() {
    records.forEach(record => fromOrder(record).forEach(item => insertComplete(item)));
    [
      { cnpj: '12.345.678/0001-90', client: 'Hospital São Lucas', name: 'Termômetro digital', tag: 'TERM-045', serial: 'Incoterm 7666 · T2045', manufacturer: 'Incoterm' },
      { cnpj: '45.890.123/0001-17', client: 'Lab. Biocenter', name: 'Centrífuga de bancada', tag: 'CENT-018', serial: 'Fanem 280 · F280018', manufacturer: 'Fanem' }
    ].forEach(item => insertComplete(normalize(item)));
  }
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (!saved || !Array.isArray(saved.items)) return;
      storageExtras = clone(saved); delete storageExtras.items; delete storageExtras.completedLegacyKeys;
      completedLegacyKeys = [...new Set((Array.isArray(saved.completedLegacyKeys) ? saved.completedLegacyKeys : []).filter(key => typeof key === 'string' && key.startsWith('legacy-')))];
      saved.items.forEach(item => {
        if (!item || typeof item !== 'object') return;
        if (item.incomplete === true && typeof item.legacyKey === 'string' && item.legacyKey.startsWith('legacy-')) {
          if (!completedLegacyKeys.includes(item.legacyKey) && !catalog.some(existing => existing.id === item.legacyKey)) catalog.push({ ...normalize(item, {}, true), id: item.legacyKey, incomplete: true, legacyKey: item.legacyKey, notes: clean(item.notes) });
        } else insertComplete(normalize(item, {}, true), true);
      });
    } catch (_) { /* Keep the existing seed when browser storage is unavailable. */ }
  }
  function persist() {
    try { localStorage.setItem(storageKey, JSON.stringify({ ...storageExtras, items: catalog, completedLegacyKeys })); } catch (_) { /* The catalog remains usable for this session. */ }
    document.dispatchEvent(new CustomEvent('ancal-equipment-changed'));
  }
  function getAll() { return isPortal() ? [] : clone(catalog); }
  function get(id) {
    const item = catalog.find(entry => entry.id === id);
    return item && (!isPortal() || !item.incomplete) && mayView(item.cnpj) ? clone(item) : null;
  }
  function forCompany(cnpj) {
    const value = digits(cnpj);
    if (!validOwner(cnpj) || !mayView(cnpj)) return [];
    return clone(catalog.filter(item => !item.incomplete && complete(item) && digits(item.cnpj) === value));
  }
  function failure(message) { return { ok: false, error: message }; }
  function decimal(value) {
    if (typeof value !== 'string' || !/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(value.trim())) return null;
    const number = Number(value.trim().replace(',', '.'));
    return Number.isFinite(number) ? number : null;
  }
  function validate(values) {
    for (const [key, limit] of Object.entries(textLimits)) {
      if (Object.hasOwn(values, key) && (typeof values[key] !== 'string' || values[key].length > limit)) return `Revise o campo ${key === 'observations' ? 'observações' : key === 'certificateObservation' ? 'observação do certificado' : key}; o limite é de ${limit} caracteres.`;
    }
    if (!clean(values.name) || !clean(values.tag) || !tagKey(values.tag)) return 'Informe o nome e uma identificação válida para o equipamento.';
    if (Object.hasOwn(values, 'active') && typeof values.active !== 'boolean') return 'Informe uma situação ativa ou inativa válida.';
    if (Object.hasOwn(values, 'calibrationFrequencyMonths') && (typeof values.calibrationFrequencyMonths !== 'number' || !Number.isInteger(values.calibrationFrequencyMonths) || values.calibrationFrequencyMonths < 0 || values.calibrationFrequencyMonths > 1200)) return 'A frequência de calibração deve ser um número inteiro entre 0 e 1.200 meses.';
    if (Object.hasOwn(values, 'nextCalibrationISO') && (typeof values.nextCalibrationISO !== 'string' || (values.nextCalibrationISO && !validNextCalibration(values.nextCalibrationISO)))) return 'Informe uma data ou mês e ano válidos para a próxima calibração.';
    if (Object.hasOwn(values, 'measurementRanges')) {
      if (!Array.isArray(values.measurementRanges) || values.measurementRanges.length > 25) return 'Informe até 25 faixas de medição.';
      for (const row of values.measurementRanges) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) return 'Informe os campos de cada faixa de medição.';
        const limits = { tableId: 120, label: 160, min: 120, max: 120, unit: 40, resolution: 120 };
        for (const [key, limit] of Object.entries(limits)) if (Object.hasOwn(row, key) && (typeof row[key] !== 'string' || row[key].length > limit)) return 'Revise os textos da faixa de medição.';
        if (!clean(row.label) || !clean(row.unit)) return 'Informe o rótulo e a unidade de cada faixa de medição.';
        const min = decimal(row.min), max = decimal(row.max);
        if (min === null || max === null) return 'Informe mínimo e máximo como números decimais finitos; use vírgula ou ponto decimal.';
        if (min > max) return 'O mínimo da faixa não pode ser maior que o máximo.';
      }
    }
    if (Object.hasOwn(values, 'additionalFields')) {
      if (!Array.isArray(values.additionalFields) || values.additionalFields.length > 20) return 'Informe até 20 campos adicionais.';
      for (const field of values.additionalFields) {
        if (!field || typeof field !== 'object' || Array.isArray(field) || typeof field.label !== 'string' || !field.label.trim() || field.label.length > 160 || (Object.hasOwn(field, 'value') && (typeof field.value !== 'string' || field.value.length > 2000))) return 'Informe o rótulo do campo adicional (até 160 caracteres) e um valor de até 2.000 caracteres.';
      }
    }
    return '';
  }
  function create(values) {
    if (isPortal()) return failure('O cadastro de equipamentos é restrito à área interna.');
    if (!values || typeof values !== 'object' || Array.isArray(values)) return failure('Informe os dados do equipamento.');
    const company = companies().find(entry => digits(entry.cnpj) === digits(values.cnpj));
    if (!company || !validOwner(company.cnpj)) return failure('Selecione um cliente cadastrado.');
    const invalid = validate(values);
    if (invalid) return failure(invalid);
    const item = normalize({ ...values, cnpj: company.cnpj, client: company.name });
    if (catalog.some(existing => !existing.incomplete && existing.id === item.id)) return failure('Esta identificação já está cadastrada para a empresa selecionada.');
    catalog.push(item); persist();
    return { ok: true, equipment: clone(item) };
  }
  function update(id, patch) {
    if (isPortal()) return failure('A edição de equipamentos é restrita à área interna.');
    const existing = catalog.find(item => item.id === id);
    if (!existing) return failure('Equipamento não encontrado.');
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return failure('Informe os campos do equipamento.');
    const allowed = ['id', 'cnpj', 'client', 'tag', ...editableFields];
    if (Object.keys(patch).some(key => !allowed.includes(key))) return failure('O cadastro contém campos que não podem ser alterados.');
    if (Object.hasOwn(patch, 'id') && patch.id !== id) return failure('O identificador do equipamento não pode ser alterado.');
    if (!existing.incomplete) {
      if ((Object.hasOwn(patch, 'cnpj') && digits(patch.cnpj) !== digits(existing.cnpj)) || (Object.hasOwn(patch, 'tag') && clean(patch.tag) !== existing.tag) || (Object.hasOwn(patch, 'client') && clean(patch.client) !== existing.client)) return failure('A empresa e a identificação de um equipamento cadastrado são imutáveis. Duplique o cadastro para criar outro instrumento.');
    }
    const values = { ...existing, ...patch };
    const company = companies().find(entry => digits(entry.cnpj) === digits(values.cnpj));
    if (!company || !validOwner(company.cnpj)) return failure('Selecione um cliente cadastrado.');
    const invalid = validate(values);
    if (invalid) return failure(invalid);
    const item = normalize({ ...values, cnpj: existing.incomplete ? company.cnpj : existing.cnpj, client: existing.incomplete ? company.name : existing.client }, {}, true);
    if (catalog.some(other => other !== existing && !other.incomplete && other.id === item.id)) return failure('Esta identificação já está cadastrada para a empresa selecionada.');
    delete item.incomplete; delete item.legacyKey;
    if (existing.incomplete && existing.legacyKey) completedLegacyKeys = [...new Set([...completedLegacyKeys, existing.legacyKey])];
    catalog[catalog.indexOf(existing)] = item; persist();
    return { ok: true, equipment: clone(item) };
  }
  function duplicateDraft(id) {
    if (isPortal()) return null;
    const item = catalog.find(entry => entry.id === id && !entry.incomplete && complete(entry));
    if (!item) return null;
    return clone({ cnpj: item.cnpj, client: item.client, name: item.name, tag: '', manufacturer: item.manufacturer, serial: item.serial, ...optionalFrom(item), active: true });
  }
  function action(label, value, id = '', primary = false) {
    return `<button type="button" class="btn${primary ? ' btn-primary' : ''}" data-equipment-action="${value}" ${id ? `data-equipment-id="${h(id)}"` : ''}>${label}</button>`;
  }
  function renderPage() {
    if (portalMode) return '';
    if (typeof window.ancalEquipmentWorkspace?.render === 'function') return window.ancalEquipmentWorkspace.render();
    const pending = catalog.filter(item => item.incomplete).length;
    return `${heading('Equipamentos', 'Cadastre os instrumentos por empresa para selecioná-los nas ordens de serviço.', action('＋ Novo equipamento', 'new', '', true))}
      ${pending ? `<div class="equipment-pending-note"><strong>${pending} ${pending === 1 ? 'cadastro precisa' : 'cadastros precisam'} ser completado${pending === 1 ? '' : 's'}.</strong><span>Vincule os registros antigos a uma empresa e informe a identificação antes de usá-los em uma OS.</span></div>` : ''}
      <section class="panel table-panel equipment-panel"><div class="panel-heading"><div><h2>Catálogo de equipamentos</h2><p>${catalog.length - pending} equipamentos cadastrados${pending ? ` · ${pending} pendentes` : ''} · um registro por empresa e identificação</p></div><div class="table-tools"><input type="search" class="search equipment-search" placeholder="Buscar equipamento, cliente ou identificação" aria-label="Buscar equipamento, cliente ou identificação"></div></div><div class="table-scroll"><table class="equipment-table"><thead><tr><th>IDENTIFICAÇÃO</th><th>EQUIPAMENTO</th><th>FABRICANTE</th><th>MODELO / Nº SÉRIE</th><th>CLIENTE / CNPJ</th><th>CADASTRO</th><th>AÇÕES</th></tr></thead><tbody>${catalog.map(item => `<tr data-search="${h([item.name, item.tag, item.manufacturer, item.serial, item.client, item.cnpj].join(' ').toLowerCase())}"><td class="os-id">${h(item.tag || 'A informar')}</td><td class="equipment-name">${h(item.name || 'Nome a informar')}</td><td>${h(item.manufacturer || 'A informar')}</td><td>${h(item.serial || 'A informar')}</td><td class="client-cell"><strong>${h(item.client || 'Empresa não vinculada')}</strong><span>${h(item.cnpj || 'Vincule uma empresa para utilizar em OS')}</span></td><td>${pill(item.incomplete ? 'wait' : 'done', item.incomplete ? 'Completar cadastro' : 'Cadastrado')}</td><td><div class="equipment-row-actions">${item.incomplete ? action('Completar cadastro', 'edit', item.id) : action('Ver detalhes', 'detail', item.id) + action('Duplicar', 'duplicate', item.id)}</div></td></tr>`).join('')}</tbody></table><div class="empty-state" hidden><span class="empty-icon">⌕</span><strong>Nenhum equipamento encontrado</strong><span>Altere a busca ou cadastre um novo instrumento.</span></div></div></section><p class="equipment-note">Os equipamentos são vinculados ao CNPJ da empresa. Novas ordens utilizam os registros deste catálogo.</p>`;
  }
  function showError(form, message) {
    const field = form.querySelector('.equipment-error');
    if (field) { field.textContent = message; field.hidden = false; field.focus(); }
  }
  function sourceById(id) { return catalog.find(item => item.id === id && !item.incomplete && complete(item)); }
  function sourceDate(item) { return item && Object.hasOwn(item, 'nextCalibrationISO') && validNextCalibration(clean(item.nextCalibrationISO)) ? clean(item.nextCalibrationISO) : ''; }
  function nextCalibrationPicker(value) {
    const options = { id: 'equipmentNextCalibration', name: 'nextCalibrationISO', label: 'Próxima calibração', value, help: 'Informe mês e ano; selecione o dia somente quando ele for conhecido. Sem preenchimento, ficará sem previsão.' };
    return `<div class="field equipment-field">${window.ancalOptionalDate?.render ? window.ancalOptionalDate.render(options) : `<label for="equipmentNextCalibration">Próxima calibração</label><input id="equipmentNextCalibration" name="nextCalibrationISO" type="text" value="${h(value)}" placeholder="AAAA-MM ou AAAA-MM-DD"><small>${h(options.help)}</small>`}</div>`;
  }
  function copyNote(item) { return item ? `Baseado em ${item.tag}. Revise a identificação, número de série e data da próxima calibração.` : ''; }
  function openForm(id, sourceId = '') {
    if (portalMode) return;
    if (typeof window.ancalEquipmentWorkspace?.openForm === 'function') { window.ancalEquipmentWorkspace.openForm(id, sourceId); return; }
    const item = id ? catalog.find(entry => entry.id === id && entry.incomplete) : null;
    if (id && !item) return;
    const source = sourceId ? sourceById(sourceId) : null;
    if (sourceId && (!source || item)) return;
    const options = companies();
    const sourceCompany = source ? options.find(company => digits(company.cnpj) === digits(source.cnpj)) : null;
    const copyField = item ? '' : `<div class="field full equipment-field equipment-copy-field"><label for="equipmentCopySource">Copiar de equipamento cadastrado <span>(opcional)</span></label><select id="equipmentCopySource" name="equipmentCopySource" aria-describedby="equipmentCopyNote"><option value="">Começar sem cópia</option>${catalog.filter(entry => !entry.incomplete && complete(entry)).map(entry => `<option value="${h(entry.id)}" ${entry.id === source?.id ? 'selected' : ''}>${h(entry.name)} · ${h(entry.tag)} · ${h(entry.client)} · ${h(entry.cnpj)}</option>`).join('')}</select><small>Escolha uma base para preencher os dados e informe uma nova identificação.</small></div><p id="equipmentCopyNote" class="equipment-copy-note" aria-live="polite" ${source ? '' : 'hidden'}>${h(copyNote(source))}</p>`;
    openModal(item ? 'Completar cadastro do equipamento' : 'Novo equipamento', 'Identifique a empresa e o instrumento para utilizá-lo nas ordens de serviço.', `<form id="equipmentForm" data-equipment-edit-id="${h(item?.id || '')}" data-equipment-copy-source-id="${h(source?.id || '')}">${copyField}<div class="field full equipment-field"><label for="equipmentCompany">Empresa</label><select id="equipmentCompany" name="cnpj" required><option value="">Selecione uma empresa</option>${options.map(company => `<option value="${h(company.cnpj)}" ${sourceCompany && digits(company.cnpj) === digits(sourceCompany.cnpj) ? 'selected' : ''}>${h(company.name)} · ${h(company.cnpj)}</option>`).join('')}</select></div><div class="form-grid"><div class="field full equipment-field"><label for="equipmentName">Nome do equipamento</label><input id="equipmentName" name="name" required maxlength="120" value="${h(source?.name || item?.name || '')}" placeholder="Ex.: Balança analítica"></div><div class="field equipment-field"><label for="equipmentTag">Identificação / tag</label><input id="equipmentTag" name="tag" required maxlength="60" value="" placeholder="Ex.: BAL-025"><small>Única para esta empresa.</small></div><div class="field equipment-field"><label for="equipmentManufacturer">Fabricante</label><input id="equipmentManufacturer" name="manufacturer" maxlength="100" value="${h(source?.manufacturer || '')}" placeholder="Ex.: Sartorius"></div><div class="field full equipment-field"><label for="equipmentSerial">Modelo / número de série</label><input id="equipmentSerial" name="serial" maxlength="160" value="${h(source?.serial || '')}" placeholder="Ex.: AS220 · 9234K120"></div></div>${nextCalibrationPicker(sourceDate(source))}<p class="equipment-error" role="alert" tabindex="-1" hidden></p><p class="equipment-note">Cadastro de demonstração salvo neste navegador.</p><div class="modal-actions">${action('Cancelar', 'close')}<button type="submit" class="btn btn-primary">Salvar equipamento</button></div></form>`);
    const form = document.querySelector('#equipmentForm');
    if (form) formSessions.set(form, { editId: item?.id || '', copySourceId: source?.id || '' });
  }
  function selectCopySource(control) {
    if (portalMode) return;
    const form = control.closest('#equipmentForm');
    if (!form) return;
    if (form.hasAttribute?.('data-equipment-workspace-form')) return;
    const session = formSessions.get(form);
    if (!session || session.editId || clean(form.dataset.equipmentEditId)) return;
    const sourceId = clean(control.value);
    const source = sourceId ? sourceById(sourceId) : null;
    if (sourceId && !source) {
      control.value = session.copySourceId;
      showError(form, 'O equipamento-base não foi encontrado ou está com cadastro incompleto.');
      return;
    }
    const company = source ? companies().find(entry => digits(entry.cnpj) === digits(source.cnpj)) : null;
    const values = { equipmentCompany: company?.cnpj || '', equipmentName: source?.name || '', equipmentTag: '', equipmentManufacturer: source?.manufacturer || '', equipmentSerial: source?.serial || '', equipmentNextCalibration: sourceDate(source) };
    Object.entries(values).forEach(([id, value]) => { const field = form.querySelector('#' + id); if (field) field.value = value; });
    const picker = form.querySelector('#equipmentNextCalibration')?.closest('[data-optional-date]');
    if (picker && window.ancalOptionalDate?.render) picker.outerHTML = window.ancalOptionalDate.render({ id: 'equipmentNextCalibration', name: 'nextCalibrationISO', label: 'Próxima calibração', value: sourceDate(source), help: 'Informe mês e ano; selecione o dia somente quando ele for conhecido. Sem preenchimento, ficará sem previsão.' });
    const note = form.querySelector('#equipmentCopyNote');
    if (note) { note.textContent = copyNote(source); note.hidden = !source; }
    const error = form.querySelector('.equipment-error');
    if (error) error.hidden = true;
    session.copySourceId = source?.id || '';
    form.dataset.equipmentCopySourceId = session.copySourceId;
  }
  function showDetail(id) {
    if (portalMode) return;
    if (typeof window.ancalEquipmentWorkspace?.showDetail === 'function') { window.ancalEquipmentWorkspace.showDetail(id); return; }
    const item = catalog.find(entry => entry.id === id && !entry.incomplete);
    if (!item) return;
    const field = (label, value) => `<div><span>${label}</span><strong>${h(value || 'A informar')}</strong></div>`;
    openModal(item.name, 'Identificação: ' + item.tag, `<div class="record-detail">${field('Empresa', item.client)}${field('CNPJ', item.cnpj)}${field('Identificação / tag', item.tag)}${field('Fabricante', item.manufacturer)}${field('Modelo / nº série', item.serial)}</div><p class="equipment-note">Este equipamento pode ser selecionado nas ordens de serviço da empresa vinculada.</p><div class="modal-actions">${action('Duplicar equipamento', 'duplicate', item.id)}${action('Fechar', 'close')}</div>`);
  }
  function submit(form) {
    if (form.hasAttribute?.('data-equipment-workspace-form')) return;
    if (portalMode) return;
    const picker = form.querySelector('#equipmentNextCalibration')?.closest('[data-optional-date]');
    const selectedDate = picker && window.ancalOptionalDate?.sync ? window.ancalOptionalDate.sync(picker) : null;
    if (selectedDate && !selectedDate.ok) return showError(form, selectedDate.error);
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const company = companies().find(entry => digits(entry.cnpj) === digits(data.get('cnpj')));
    const name = clean(data.get('name')), tag = clean(data.get('tag'));
    const manufacturer = clean(data.get('manufacturer')), serial = clean(data.get('serial'));
    const nextCalibrationISO = selectedDate ? selectedDate.value : clean(data.get('nextCalibrationISO'));
    const editId = clean(form.dataset.equipmentEditId);
    const copySourceId = clean(form.dataset.equipmentCopySourceId);
    const session = formSessions.get(form);
    if (session && (editId !== session.editId || copySourceId !== session.copySourceId)) { showError(form, 'O modo do cadastro foi alterado. Abra o formulário novamente.'); return; }
    if (copySourceId && (editId || !sourceById(copySourceId))) { showError(form, 'Selecione um equipamento-base válido para criar uma nova cópia.'); return; }
    const existing = editId ? catalog.find(item => item.id === editId && item.incomplete) : null;
    if (editId && !existing) { showError(form, 'O cadastro pendente não foi encontrado.'); return; }
    if (!company || !validOwner(company.cnpj)) { showError(form, 'Selecione um cliente cadastrado.'); return; }
    if (!name || name.length > 120 || !tag || tag.length > 60 || !tagKey(tag)) { showError(form, 'Informe o nome e uma identificação válida para o equipamento.'); return; }
    if (manufacturer.length > 100 || serial.length > 160) { showError(form, 'Revise o fabricante e o modelo / número de série.'); return; }
    if (nextCalibrationISO && !validNextCalibration(nextCalibrationISO)) { showError(form, 'Informe uma data ou mês e ano válidos para a próxima calibração.'); return; }
    const id = stableId(company.cnpj, tag);
    if (catalog.some(item => !item.incomplete && item.id === id)) { showError(form, 'Esta identificação já está cadastrada para a empresa selecionada.'); return; }
    const values = { cnpj: company.cnpj, name, tag, serial, manufacturer, nextCalibrationISO };
    const result = existing ? update(existing.id, values) : create(values);
    if (!result.ok) { showError(form, result.error); return; }
    closeModal(); render();
    showToast(existing ? 'Cadastro completado e disponível para ordens de serviço.' : 'Equipamento cadastrado e disponível para ordens de serviço.');
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-equipment-action]');
    if (!button || portalMode) return;
    switch (button.dataset.equipmentAction) {
      case 'new': openForm(); break;
      case 'edit': openForm(button.dataset.equipmentId); break;
      case 'duplicate': if (sourceById(button.dataset.equipmentId)) openForm(null, button.dataset.equipmentId); break;
      case 'detail': showDetail(button.dataset.equipmentId); break;
      case 'close': closeModal(); break;
    }
  });
  document.addEventListener('submit', event => {
    if (event.target.id !== 'equipmentForm') return;
    if (event.target.hasAttribute?.('data-equipment-workspace-form')) return;
    event.preventDefault();
    if (!portalMode) submit(event.target);
  });
  document.addEventListener('change', event => {
    if (!portalMode && event.target.matches('#equipmentCopySource')) selectCopySource(event.target);
  });

  seed(); load(); readLegacy();
  window.ancalEquipment = { getAll, get, forCompany, fromOrder, create, update, duplicateDraft, renderPage };
})();
