(function () {
  'use strict';

  const h = value => escapeHtml(value);
  const text = value => String(value == null ? '' : value).replace(/\r\n?/g, '\n');
  const clean = value => text(value).trim();
  const fold = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const clone = value => JSON.parse(JSON.stringify(value));
  const portal = () => typeof portalMode !== 'undefined' && portalMode;
  const storageKey = 'ancal-standards-v1';
  const pointKeys = ['reference', 'error', 'uncertainty', 'k', 'veff', 'drift', 'description', 'auxiliary1', 'auxiliary2'];
  const pointLabels = ['Referência', 'Erro', 'Incerteza', 'Fator k', 'Veff', 'Deriva', 'Descrição', 'Auxiliar 1', 'Auxiliar 2'];
  const standardStrings = { name: 160, serial: 160, type: 160, model: 160, manufacturer: 160, sector: 160, activityWith: 300, measurementRequirements: 5000, observations: 5000 };
  const libraries = [['temperature', 'Temperatura', '°C'], ['volume_ml', 'Volume', 'ml'], ['volume_ul', 'Volume', 'µl'], ['mass_g', 'Massa', 'g'], ['mass_kg', 'Massa', 'kg'], ['humidity', 'Umidade', '%'], ['pressure_pa', 'Pressão', 'Pa'], ['pressure_kpa', 'Pressão', 'kPa'], ['length', 'Comprimento', 'mm'], ['ph', 'pH', 'pH'], ['electrical', 'Tensão', 'V'], ['custom', 'Personalizada', '']];
  const view = { query: '', active: 'active', expiry: 'all' };
  const sessions = new WeakMap();
  let state = { items: [], attachments: {} }, databasePromise;
  const fail = error => ({ ok: false, error });
  const uid = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const dateLabel = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value.split('-').reverse().join('/') : clean(value) || 'Não informada';

  function validDate(value) { const date = new Date(`${value}T12:00:00Z`); return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value; }
  function todayISO() { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date()); }
  function horizonISO() {
    const [year, month, day] = todayISO().split('-').map(Number);
    const start = new Date(Date.UTC(year, month + 1, 1));
    const last = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
    start.setUTCDate(Math.min(day, last)); return start.toISOString().slice(0, 10);
  }
  function parseLegacyDate(value) {
    const match = fold(value).replace(/[.,]/g, '').match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/);
    if (!match) return '';
    const month = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'].indexOf(match[2].slice(0, 3)) + 1;
    const iso = `${match[3]}-${String(month).padStart(2, '0')}-${match[1].padStart(2, '0')}`;
    return validDate(iso) ? iso : '';
  }
  function decimal(value, infinity = false) {
    if (clean(value) === '') return true;
    if (infinity && ['∞', 'inf', 'infinito'].includes(fold(value))) return true;
    return /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?$/.test(clean(value)) && Number.isFinite(Number(clean(value).replace(',', '.')));
  }
  function number(value) { return Number(clean(value).replace(',', '.')); }
  function expiryState(item) { return item.validUntilISO && item.validUntilISO < todayISO() ? 'overdue' : item.validUntilISO && item.validUntilISO <= horizonISO() ? 'due' : 'valid'; }

  function seed() {
    const originals = typeof standards !== 'undefined' && Array.isArray(standards) ? standards : [];
    const items = originals.map(row => ({ id: `standard-${fold(row[0]).replace(/[^a-z0-9]+/g, '-')}`, code: clean(row[0]), tag: clean(row[0]), name: clean(row[1]), serial: '', legacyIdentification: clean(row[2]), validUntilISO: parseLegacyDate(row[3]), active: true, fieldUse: false, frequencyMonths: 0, checkFrequencyMonths: 0, measurementRanges: [], calibrations: [] }));
    const legacy = typeof demoEntries !== 'undefined' && Array.isArray(demoEntries.padroes) ? demoEntries.padroes : [];
    legacy.forEach((entry, index) => {
      const legacyKey = `legacy-${index}-${fold(entry.name).replace(/[^a-z0-9]+/g, '-').slice(0, 80)}`;
      items.push({ id: `standard-${legacyKey}`, legacyKey, code: '', tag: '', name: clean(entry.name), observations: text(entry.notes), pending: true, active: true, measurementRanges: [], calibrations: [] });
    });
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (saved && Array.isArray(saved.items)) {
        const known = saved.items.filter(item => item && typeof item === 'object' && clean(item.id) && clean(item.name)).map(item => ({ ...clone(item), measurementRanges: Array.isArray(item.measurementRanges) ? clone(item.measurementRanges) : [], calibrations: Array.isArray(item.calibrations) ? clone(item.calibrations) : [] }));
        const identities = new Set();
        state.items = known.filter(item => !identities.has(item.id) && identities.add(item.id));
        state.items.forEach(item => {
          const seedItem = items.find(original => original.id === item.id && original.legacyIdentification);
          if (seedItem && !item.legacyIdentification && item.serial === seedItem.legacyIdentification) { item.legacyIdentification = item.serial; item.serial = ''; }
        });
        items.forEach(item => { if (!state.items.some(existing => existing.id === item.id || (item.code && fold(existing.code) === fold(item.code)) || (item.legacyKey && existing.legacyKey === item.legacyKey))) state.items.push(item); });
        state.attachments = saved.attachments && typeof saved.attachments === 'object' && !Array.isArray(saved.attachments) ? clone(saved.attachments) : {};
        return;
      }
    } catch (_) {}
    state.items = items;
  }
  function commit(next) {
    try { localStorage.setItem(storageKey, JSON.stringify(next)); }
    catch (_) { return fail('Não foi possível salvar os padrões neste navegador. Verifique o armazenamento local e tente novamente.'); }
    state = next; document.dispatchEvent(new CustomEvent('ancal-standards-changed')); return { ok: true };
  }
  function getAll() { return portal() ? [] : clone(state.items); }
  function get(id) { const item = !portal() && state.items.find(entry => entry.id === id); return item ? clone(item) : null; }
  function getHistory(id) { return get(id)?.calibrations.sort((a, b) => clean(b.dateISO).localeCompare(clean(a.dateISO))) || []; }

  function normalizeRanges(values, existing = []) {
    if (!Array.isArray(values) || values.length > 25) return fail('Use no máximo 25 intervalos de medição.');
    const ids = new Set(), ranges = [];
    for (const value of values) {
      if (!value || typeof value !== 'object') return fail('Revise os intervalos de medição.');
      const range = Object.fromEntries(['tableId', 'label', 'min', 'max', 'unit', 'resolution'].map(field => [field, clean(value[field])]));
      range.id = clean(value.id) || uid('range');
      if (ids.has(range.id) || range.id.length > 160) return fail('Cada intervalo deve ter um identificador próprio.'); ids.add(range.id);
      if (!range.label || range.label.length > 160 || !range.unit || range.unit.length > 40 || range.tableId.length > 120) return fail('Informe a grandeza e a unidade de cada intervalo.');
      if (['min', 'max', 'resolution'].some(field => !decimal(range[field]) || range[field].length > 120)) return fail('Os limites e a resolução devem ser números finitos, com vírgula ou ponto decimal.');
      if (range.min && range.max && number(range.min) > number(range.max)) return fail('O mínimo do intervalo não pode ser maior que o máximo.');
      ranges.push(range);
    }
    return { ok: true, ranges };
  }
  function prepareStandard(values, existing) {
    if (!values || typeof values !== 'object' || Array.isArray(values)) return fail('Informe os dados do padrão.');
    if ((Object.hasOwn(values, 'id') && values.id !== existing?.id) || (existing?.code && Object.hasOwn(values, 'code') && clean(values.code) !== existing.code)) return fail('O identificador e o código do padrão são preservados após o cadastro.');
    const allowed = ['id', 'code', ...Object.keys(standardStrings), 'active', 'fieldUse', 'validUntilISO', 'frequencyMonths', 'nextCheckISO', 'checkFrequencyMonths', 'measurementRanges'];
    if (Object.keys(values).some(field => !allowed.includes(field))) return fail('O cadastro contém um campo que não pode ser alterado por este formulário.');
    const item = existing ? clone(existing) : { id: uid('standard'), calibrations: [] };
    item.code = Object.hasOwn(values, 'code') ? clean(values.code) : clean(existing?.code); item.tag = item.code;
    if (!item.code || item.code.length > 80 || state.items.some(other => other.id !== item.id && fold(other.code) === fold(item.code))) return fail('Informe um código único para o padrão, com até 80 caracteres.');
    for (const [field, limit] of Object.entries(standardStrings)) {
      const value = Object.hasOwn(values, field) ? text(values[field]) : text(existing?.[field]);
      if (value.length > limit) return fail(`O campo ${field} excedeu o limite de ${limit} caracteres.`); item[field] = value;
    }
    if (!item.name.trim()) return fail('Informe o nome do padrão de referência.');
    for (const field of ['active', 'fieldUse']) {
      if (Object.hasOwn(values, field) && typeof values[field] !== 'boolean') return fail('Revise as opções de uso e situação do padrão.');
      item[field] = Object.hasOwn(values, field) ? values[field] : existing ? field === 'active' ? existing[field] !== false : existing[field] === true : field === 'active';
    }
    for (const field of ['frequencyMonths', 'checkFrequencyMonths']) {
      const value = Object.hasOwn(values, field) ? values[field] : existing?.[field] ?? 0;
      if (!Number.isInteger(value) || value < 0 || value > 1200) return fail('As frequências devem ser números inteiros entre 0 e 1.200 meses.'); item[field] = value;
    }
    for (const field of ['validUntilISO', 'nextCheckISO']) {
      const value = Object.hasOwn(values, field) ? clean(values[field]) : clean(existing?.[field]);
      if (value && !validDate(value)) return fail('Informe datas reais para validade e próxima checagem.'); item[field] = value;
    }
    const normalized = normalizeRanges(Object.hasOwn(values, 'measurementRanges') ? values.measurementRanges : existing?.measurementRanges || []);
    if (!normalized.ok) return normalized; item.measurementRanges = normalized.ranges;
    delete item.pending; return { ok: true, standard: item };
  }
  function create(values) {
    if (portal()) return fail('O cadastro de padrões é restrito ao laboratório.');
    const prepared = prepareStandard(values, null); if (!prepared.ok) return prepared;
    const next = clone(state); next.items.push(prepared.standard); const saved = commit(next);
    return saved.ok ? { ok: true, standard: clone(prepared.standard) } : saved;
  }
  function update(id, values) {
    if (portal()) return fail('O cadastro de padrões é restrito ao laboratório.');
    const existing = state.items.find(item => item.id === id); if (!existing) return fail('Padrão não encontrado.');
    const prepared = prepareStandard(values, existing); if (!prepared.ok) return prepared;
    const next = clone(state); next.items[next.items.findIndex(item => item.id === id)] = prepared.standard; const saved = commit(next);
    return saved.ok ? { ok: true, standard: clone(prepared.standard) } : saved;
  }

  function prepareCalibration(standard, values, existing) {
    if (!values || typeof values !== 'object' || Array.isArray(values)) return fail('Informe os dados da calibração.');
    const allowed = ['code', 'laboratory', 'conformity', 'dateISO', 'activityType', 'validUntilISO', 'attachmentId', 'resultsByRange'];
    if (Object.keys(values).some(field => !allowed.includes(field))) return fail('Os intervalos e os identificadores do histórico são preservados pelo sistema.');
    const calibration = existing ? clone(existing) : { id: uid('calibration'), measurementRangesSnapshot: clone(standard.measurementRanges || []), attachmentHistory: [] };
    for (const field of ['code', 'laboratory', 'dateISO', 'activityType', 'validUntilISO']) calibration[field] = Object.hasOwn(values, field) ? clean(values[field]) : clean(existing?.[field]) || (field === 'activityType' ? 'Calibração' : '');
    if (!calibration.code || calibration.code.length > 160 || calibration.laboratory.length > 300 || calibration.activityType.length > 160 || !calibration.activityType) return fail('Informe o código do certificado e o tipo de atividade.');
    if (!validDate(calibration.dateISO) || (calibration.validUntilISO && (!validDate(calibration.validUntilISO) || calibration.validUntilISO < calibration.dateISO))) return fail('Informe datas reais para a calibração e a validade do certificado.');
    calibration.conformity = Object.hasOwn(values, 'conformity') ? values.conformity : existing?.conformity || 'unspecified';
    if (!['unspecified', 'yes', 'no'].includes(calibration.conformity)) return fail('Selecione o parecer de conformidade informado, sem cálculo automático.');
    const ranges = calibration.measurementRangesSnapshot || [];
    const results = Object.hasOwn(values, 'resultsByRange') ? values.resultsByRange : existing?.resultsByRange || [];
    if (!Array.isArray(results) || results.length > 25) return fail('Revise as tabelas dos intervalos da calibração.');
    const resultIds = new Set(); calibration.resultsByRange = [];
    for (const result of results) {
      const range = ranges.find(item => item.id === result?.rangeId);
      if (!range || resultIds.has(range.id)) return fail('Cada tabela de resultados deve corresponder a um intervalo preservado desta calibração.'); resultIds.add(range.id);
      const normalized = { rangeId: range.id, errorUnit: clean(result.errorUnit), errorMode: result.errorMode || 'absolute', uncertaintyUnit: clean(result.uncertaintyUnit), uncertaintyMode: result.uncertaintyMode || 'absolute', points: [] };
      if (!['absolute', 'relative'].includes(normalized.errorMode) || !['absolute', 'relative'].includes(normalized.uncertaintyMode) || normalized.errorUnit.length > 40 || normalized.uncertaintyUnit.length > 40) return fail('Revise os modos e unidades do erro e da incerteza.');
      if (!Array.isArray(result.points) || result.points.length > 100) return fail('Use no máximo 100 pontos de medição por intervalo.');
      for (const point of result.points) {
        const normalizedPoint = Object.fromEntries(pointKeys.map(field => [field, text(point?.[field])]));
        if (pointKeys.some(field => normalizedPoint[field].length > (field === 'description' ? 2000 : 120))) return fail('Revise o tamanho dos textos nos pontos de medição.');
        if (pointKeys.filter(field => field !== 'description').some(field => !decimal(normalizedPoint[field], field === 'veff'))) return fail('Os resultados devem ser números finitos. Use vírgula ou ponto decimal; Veff também aceita ∞.');
        normalized.points.push(normalizedPoint);
      }
      calibration.resultsByRange.push(normalized);
    }
    const attachmentId = Object.hasOwn(values, 'attachmentId') ? clean(values.attachmentId) : clean(existing?.attachmentId);
    if (existing?.attachmentId && !attachmentId) return fail('O PDF já vinculado não pode ser removido. Você pode anexar uma nova versão, preservando a anterior.');
    if (attachmentId) {
      const attachment = Object.hasOwn(state.attachments, attachmentId) ? state.attachments[attachmentId] : null;
      if (!attachment || (attachment.standardId && (attachment.standardId !== standard.id || attachment.calibrationId !== calibration.id))) return fail('O PDF não foi enviado corretamente ou pertence a outra calibração.');
      if (existing?.attachmentId && existing.attachmentId !== attachmentId) calibration.attachmentHistory = [...(existing.attachmentHistory || []), { attachmentId: existing.attachmentId, attachmentName: existing.attachmentName }];
      calibration.attachmentId = attachmentId; calibration.attachmentName = attachment.name;
    }
    return { ok: true, calibration };
  }
  function saveCalibration(id, values, calibrationId) {
    if (portal()) return fail('O histórico de padrões é restrito ao laboratório.');
    const standard = state.items.find(item => item.id === id); if (!standard) return fail('Padrão não encontrado.');
    const existing = calibrationId ? standard.calibrations.find(item => item.id === calibrationId) : null;
    if (calibrationId && !existing) return fail('Calibração não encontrada neste padrão.');
    const prepared = prepareCalibration(standard, values, existing); if (!prepared.ok) return prepared;
    const next = clone(state), target = next.items.find(item => item.id === id);
    if (existing) target.calibrations[target.calibrations.findIndex(item => item.id === calibrationId)] = prepared.calibration;
    else target.calibrations.push(prepared.calibration);
    if (prepared.calibration.attachmentId) Object.assign(next.attachments[prepared.calibration.attachmentId], { standardId: id, calibrationId: prepared.calibration.id });
    const saved = commit(next); return saved.ok ? { ok: true, calibration: clone(prepared.calibration), standard: clone(target) } : saved;
  }
  function addCalibration(id, values) { return saveCalibration(id, values); }
  function updateCalibration(id, calibrationId, values) { return saveCalibration(id, values, calibrationId); }

  function database() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new Error('O navegador não oferece armazenamento de arquivos.'));
      const request = indexedDB.open('ancal-standard-pdfs-v1', 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('files')) request.result.createObjectStore('files', { keyPath: 'id' }); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Não foi possível abrir o armazenamento de PDFs.'));
      request.onblocked = () => reject(new Error('O armazenamento de PDFs está bloqueado por outra janela.'));
    }).catch(error => { databasePromise = null; throw error; });
    return databasePromise;
  }
  async function blobOperation(mode, operation) {
    const db = await database();
    return new Promise((resolve, reject) => {
      let result;
      const transaction = db.transaction('files', mode), request = operation(transaction.objectStore('files'));
      request.onsuccess = () => { result = request.result; };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = transaction.onabort = () => reject(new Error('Não foi possível persistir ou recuperar o PDF.'));
    });
  }
  async function uploadPDF(file) {
    if (portal()) return fail('Os PDFs de padrões são restritos ao laboratório.');
    if (!file || typeof file.slice !== 'function' || !file.size || file.size > 20 * 1024 * 1024) return fail('Selecione um PDF de até 20 MB.');
    try {
      const header = new Uint8Array(await file.slice(0, 5).arrayBuffer());
      if (String.fromCharCode(...header) !== '%PDF-') return fail('O arquivo não possui um cabeçalho PDF válido.');
      if (portal()) return fail('O acesso ao laboratório foi encerrado.');
      const attachment = { id: uid('pdf'), name: clean(file.name || 'certificado.pdf').slice(0, 240), size: file.size, type: 'application/pdf', uploadedAt: new Date().toISOString() };
      await blobOperation('readwrite', store => store.add({ id: attachment.id, blob: file }));
      if (portal()) { await blobOperation('readwrite', store => store.delete(attachment.id)); return fail('O acesso ao laboratório foi encerrado.'); }
      const next = clone(state); next.attachments[attachment.id] = attachment;
      const saved = commit(next);
      if (!saved.ok) { await blobOperation('readwrite', store => store.delete(attachment.id)); return saved; }
      return { ok: true, attachment: clone(attachment) };
    } catch (error) { return fail(`${error.message || 'Não foi possível armazenar o PDF.'} O arquivo não foi vinculado ao histórico.`); }
  }
  function attachmentFor(id) {
    if (portal()) return null;
    const attachment = Object.hasOwn(state.attachments, id) ? state.attachments[id] : null;
    const standard = attachment && state.items.find(item => item.id === attachment.standardId);
    const calibration = standard?.calibrations.find(item => item.id === attachment.calibrationId);
    return calibration && (calibration.attachmentId === id || calibration.attachmentHistory?.some(item => item.attachmentId === id)) ? clone(attachment) : null;
  }
  async function deliverPDF(id, openFile = false) {
    const attachment = attachmentFor(id); if (!attachment) return fail('PDF indisponível ou sem vínculo com esta calibração.');
    try {
      const stored = await blobOperation('readonly', store => store.get(id));
      if (!stored?.blob || portal() || !attachmentFor(id)) return fail('O arquivo PDF não está disponível neste navegador. Reenvie-o pela calibração correspondente.');
      const url = URL.createObjectURL(stored.blob), link = document.createElement('a'); link.href = url;
      if (openFile) { link.target = '_blank'; link.rel = 'noopener noreferrer'; } else link.download = attachment.name;
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
      return { ok: true, name: attachment.name };
    } catch (error) { return fail(error.message || 'Não foi possível abrir o PDF armazenado.'); }
  }
  function downloadPDF(id) { return deliverPDF(id, false); }
  function openPDF(id) { return deliverPDF(id, true); }

  // Views and event bindings follow the same guarded store methods.
  function action(label, name, id = '', extra = '', primary = false) { return `<button type="button" class="btn${primary ? ' btn-primary' : ''}" data-standards-action="${name}"${id ? ` data-standards-id="${h(id)}"` : ''}${extra}>${label}</button>`; }
  function field(name, label, value, options = {}) {
    const id = `standard-${name}`;
    const attrs = `id="${id}" name="${name}"${options.required ? ' required' : ''}${options.disabled ? ' disabled' : ''}`;
    const control = options.area ? `<textarea ${attrs} rows="${options.rows || 4}" maxlength="5000">${h(value || '')}</textarea>` : `<input ${attrs} type="${options.type || 'text'}" value="${h(value ?? '')}" maxlength="${options.maxlength || 160}"${options.type === 'number' ? ' min="0" max="1200" step="1"' : ''}>`;
    return `<div class="standards-field${options.full ? ' is-full' : ''}"><label for="${id}">${h(label)}</label>${control}${options.help ? `<small>${h(options.help)}</small>` : ''}</div>`;
  }
  function select(name, label, value, options) { return `<div class="standards-field"><label for="standard-${name}">${h(label)}</label><select id="standard-${name}" name="${name}">${options.map(([key, caption]) => `<option value="${h(key)}"${key === value ? ' selected' : ''}>${h(caption)}</option>`).join('')}</select></div>`; }
  function section(title, content, opened = false) { return `<details class="standards-section"${opened ? ' open' : ''}><summary>${h(title)}</summary><div class="standards-section-body">${content}</div></details>`; }
  function check(name, label, checked) { return `<label class="standards-check"><input type="checkbox" name="${name}"${checked ? ' checked' : ''}><span>${h(label)}</span></label>`; }

  function matches() {
    return getAll().filter(item => {
      if (view.active === 'active' && item.active === false) return false;
      if (view.active === 'inactive' && item.active !== false) return false;
      if (view.expiry === 'overdue' && expiryState(item) !== 'overdue') return false;
      if (view.expiry === 'due' && expiryState(item) !== 'due') return false;
      return !view.query || fold([item.code, item.name, item.type, item.serial, item.manufacturer, item.model, item.sector, item.activityWith].join(' ')).includes(fold(view.query));
    });
  }
  function tableRows(items) {
    return items.map(item => `<tr><td><strong>${h(item.code || 'Pendente')}</strong></td><td><strong>${h(item.name)}</strong><span class="standards-sub">${h([item.type, item.manufacturer, item.model].filter(Boolean).join(' · '))}</span></td><td>${h(item.serial || item.legacyIdentification || 'Não informado')}${item.legacyIdentification ? `<span class="standards-sub">${item.serial ? 'Origem: ' + h(item.legacyIdentification) : 'Identificação do cadastro original'}</span>` : ''}</td><td class="standards-range-summary">${item.measurementRanges.length ? `<strong>${item.measurementRanges.length} ${item.measurementRanges.length === 1 ? 'intervalo' : 'intervalos'}</strong><span class="standards-sub">${h(item.measurementRanges[0].label)} · ${h(item.measurementRanges[0].min || '—')} a ${h(item.measurementRanges[0].max || '—')} ${h(item.measurementRanges[0].unit)}</span>` : 'Não informados'}</td><td>${h(item.sector || 'Não informado')}</td><td class="standards-date${expiryState(item) === 'overdue' ? ' is-expired' : expiryState(item) === 'due' ? ' is-due' : ''}">${h(dateLabel(item.validUntilISO))}${expiryState(item) !== 'valid' ? `<span class="standards-sub">${expiryState(item) === 'overdue' ? 'Vencido' : 'Vence em até 2 meses'}</span>` : ''}</td><td class="standards-date${item.nextCheckISO && item.nextCheckISO < todayISO() ? ' is-expired' : ''}">${h(dateLabel(item.nextCheckISO))}</td><td><span class="standards-pill${item.active === false ? ' is-inactive' : ''}">${item.active === false ? 'Inativo' : 'Ativo'}</span></td><td><div class="standards-actions">${action('Detalhes', 'detail', item.id)}${action('Editar', 'edit', item.id)}${action('Certificados', 'history', item.id)}</div></td></tr>`).join('');
  }
  function refresh() {
    const root = document.querySelector('[data-standards-workspace]'); if (!root || portal()) return;
    const items = matches(); root.querySelector('[data-standards-rows]').innerHTML = tableRows(items); root.querySelector('[data-standards-count]').textContent = `${items.length} de ${getAll().length} padrões`; root.querySelector('[data-standards-empty]').hidden = Boolean(items.length);
  }
  function render() {
    if (portal()) return '';
    const items = matches();
    return `${window.ancalExpiry?.devNote() || ''}${heading('Gestão de padrões', 'Controle os instrumentos de referência, calibrações e certificados externos.', action('＋ Novo padrão', 'new', '', '', true))}<div class="standards-workspace" data-standards-workspace><section class="panel table-panel"><div class="standards-panel-heading"><div><h2>Padrões de referência</h2><p>Validade, checagens e histórico técnico de cada instrumento.</p></div></div><div class="standards-filters"><label class="standards-filter is-search"><span>Buscar padrão</span><input type="search" data-standards-filter="query" value="${h(view.query)}" placeholder="Código, nome, série, setor ou laboratório"></label><label class="standards-filter"><span>Situação</span><select data-standards-filter="active">${[['active', 'Ativos'], ['inactive', 'Inativos'], ['all', 'Todos']].map(([value, caption]) => `<option value="${value}"${view.active === value ? ' selected' : ''}>${caption}</option>`).join('')}</select></label><label class="standards-filter"><span>Validade da calibração</span><select data-standards-filter="expiry">${[['all', 'Todas as validades'], ['overdue', 'Vencidos'], ['due', 'Vencendo em até 2 meses']].map(([value, caption]) => `<option value="${value}"${view.expiry === value ? ' selected' : ''}>${caption}</option>`).join('')}</select></label></div><div class="standards-result"><span data-standards-count role="status" aria-live="polite">${items.length} de ${getAll().length} padrões</span><button type="button" class="standards-text" data-standards-action="reset">Limpar filtros</button></div><div class="table-scroll" tabindex="0" role="region" aria-label="Padrões, com rolagem horizontal"><table class="standards-table"><thead><tr><th>CÓDIGO</th><th>PADRÃO DE REFERÊNCIA</th><th>NÚMERO DE SÉRIE / IDENTIFICAÇÃO</th><th>INTERVALOS DE MEDIÇÃO</th><th>SETOR</th><th>VALIDADE</th><th>PRÓXIMA CHECAGEM</th><th>SITUAÇÃO</th><th>AÇÕES</th></tr></thead><tbody data-standards-rows>${tableRows(items)}</tbody></table></div><div class="standards-empty" data-standards-empty${items.length ? ' hidden' : ''}><strong>Nenhum padrão neste filtro</strong><p>Altere a busca, a situação ou a validade selecionada.</p></div></section><p class="standards-note">Os dados e PDFs dos padrões são exclusivos da equipe do laboratório. Nenhum e-mail é enviado por este protótipo.</p></div>`;
  }

  function rangeRow(range) { return `<tr data-standard-range-id="${h(range.id || uid('range'))}"><td><input type="hidden" data-standard-range="tableId" value="${h(range.tableId || 'custom')}"><input data-standard-range="label" value="${h(range.label || '')}" maxlength="160" aria-label="Grandeza do intervalo"></td>${['min', 'max', 'unit', 'resolution'].map(key => `<td><input data-standard-range="${key}" value="${h(range[key] || '')}" maxlength="${key === 'unit' ? 40 : 120}" aria-label="${h(key)} do intervalo"></td>`).join('')}<td><div class="standards-range-actions"><button type="button" data-standard-range-move="up" aria-label="Mover intervalo para cima">↑</button><button type="button" data-standard-range-move="down" aria-label="Mover intervalo para baixo">↓</button><button type="button" data-standard-range-remove aria-label="Remover intervalo">×</button></div></td></tr>`; }
  function openForm(id) {
    if (portal()) return;
    const item = id ? get(id) : null; if (id && !item) return showToast('Padrão não encontrado.');
    const draft = item || { active: true, fieldUse: false, frequencyMonths: 0, checkFrequencyMonths: 0, measurementRanges: [] };
    const basic = `<div class="standards-grid">${field('code', 'Código / identificação do padrão', draft.code, { required: true, disabled: Boolean(item?.code), maxlength: 80 })}${field('name', 'Nome do padrão', draft.name, { required: true, full: true })}${field('type', 'Tipo de instrumento', draft.type)}${field('serial', 'Número de série', draft.serial)}${draft.legacyIdentification ? field('legacyIdentification', 'Identificação preservada do cadastro original', draft.legacyIdentification, { disabled: true, full: true, help: 'Texto de origem preservado; não foi identificado como um número de série real.' }) : ''}${field('manufacturer', 'Fabricante', draft.manufacturer)}${field('model', 'Modelo', draft.model)}${field('sector', 'Setor', draft.sector)}${field('activityWith', 'Atividade realizada com / laboratório fornecedor', draft.activityWith, { maxlength: 300, full: true })}</div>${check('active', 'Padrão ativo', draft.active !== false)}${check('fieldUse', 'Permitido para uso em campo', draft.fieldUse === true)}`;
    const schedule = `<div class="standards-grid">${field('validUntilISO', 'Validade da calibração', draft.validUntilISO, { type: 'date' })}${field('frequencyMonths', 'Frequência de calibração (meses)', draft.frequencyMonths || 0, { type: 'number', help: '0 = não definida. Nenhuma data é calculada automaticamente.' })}${field('nextCheckISO', 'Próxima checagem', draft.nextCheckISO, { type: 'date' })}${field('checkFrequencyMonths', 'Frequência de checagem (meses)', draft.checkFrequencyMonths || 0, { type: 'number' })}</div>`;
    const ranges = `<div class="table-scroll"><table class="standards-range-table"><thead><tr><th>GRANDEZA</th><th>MÍNIMO</th><th>MÁXIMO</th><th>UNIDADE</th><th>RESOLUÇÃO</th><th>ORDEM / REMOVER</th></tr></thead><tbody data-standard-range-rows>${draft.measurementRanges.map(rangeRow).join('')}</tbody></table></div><div class="standards-range-picker"><select data-standard-range-library aria-label="Grandeza para novo intervalo">${libraries.map(([key, label, unit]) => `<option value="${key}">${h(label)}${unit ? ` (${h(unit)})` : ''}</option>`).join('')}</select><button type="button" class="btn" data-standard-range-add>＋ Adicionar intervalo</button></div><p class="standards-note">Até 25 intervalos. Os históricos de calibração preservam os intervalos existentes no momento de cada registro.</p>`;
    openModal(item ? `Editar padrão ${item.code || item.name}` : 'Novo padrão de referência', 'Cadastre as características, os intervalos de medição e os requisitos do instrumento.', `<form novalidate data-standard-form="${h(item?.id || '')}">${section('Dados do padrão', basic, true)}${section('Calibração e checagens', schedule, true)}${section('Intervalos de medição', ranges, true)}${section('Requisitos e observações', `${field('measurementRequirements', 'Requisitos de medição', draft.measurementRequirements, { area: true, full: true })}${field('observations', 'Observações', draft.observations, { area: true, full: true })}`)}<p class="standards-error" role="alert" tabindex="-1" hidden></p><div class="modal-actions">${action('Cancelar', 'close')}<button type="submit" class="btn btn-primary">Salvar padrão</button></div></form>`);
    const form = document.querySelector('[data-standard-form]'); sessions.set(form, { id: item?.id || '' });
  }
  function definitions(values) { return `<dl class="standards-definitions">${values.map(([label, value, full]) => `<div${full ? ' class="is-full"' : ''}><dt>${h(label)}</dt><dd>${h(value || 'Não informado')}</dd></div>`).join('')}</dl>`; }
  function showDetail(id) {
    const item = get(id); if (!item) return;
    openModal(item.name, `${item.code || 'Cadastro pendente'} · padrão de referência`, `<div data-standard-detail>${definitions([['Código', item.code], ['Tipo', item.type], ['Número de série', item.serial], ['Identificação de origem', item.legacyIdentification], ['Fabricante', item.manufacturer], ['Modelo', item.model], ['Setor', item.sector], ['Validade', dateLabel(item.validUntilISO)], ['Próxima checagem', dateLabel(item.nextCheckISO)], ['Frequência de calibração', item.frequencyMonths ? `${item.frequencyMonths} meses` : 'Não definida'], ['Frequência de checagem', item.checkFrequencyMonths ? `${item.checkFrequencyMonths} meses` : 'Não definida'], ['Situação', item.active === false ? 'Inativo' : 'Ativo'], ['Uso em campo', item.fieldUse ? 'Sim' : 'Não'], ['Atividade com / fornecedor', item.activityWith, true], ['Requisitos de medição', item.measurementRequirements, true], ['Observações', item.observations, true]])}<h3>Intervalos de medição</h3>${item.measurementRanges.length ? item.measurementRanges.map(range => `<p class="standards-interval-copy"><strong>${h(range.label)}</strong> · ${h(range.min || '—')} a ${h(range.max || '—')} ${h(range.unit)}${range.resolution ? ` · Resolução: ${h(range.resolution)}` : ''}</p>`).join('') : '<p class="standards-note">Intervalos não informados.</p>'}<div class="modal-actions">${action('Editar', 'edit', id)}${action('Certificados e calibrações', 'history', id)}${action('Fechar', 'close')}</div></div>`);
  }
  function attachmentButtons(calibration) {
    const current = calibration.attachmentId ? `${action('Abrir PDF', 'pdf-open', '', ` data-standard-attachment="${h(calibration.attachmentId)}"`)}${action('Baixar PDF', 'pdf-download', '', ` data-standard-attachment="${h(calibration.attachmentId)}"`)}` : '<span class="standards-note">PDF não anexado</span>';
    return `<div class="standards-actions">${current}</div>${calibration.attachmentHistory?.length ? `<details class="standards-previous-pdfs"><summary>PDFs anteriores preservados (${calibration.attachmentHistory.length})</summary>${calibration.attachmentHistory.map(attachment => action(h(attachment.attachmentName || 'PDF anterior'), 'pdf-download', '', ` data-standard-attachment="${h(attachment.attachmentId)}"`)).join('')}</details>` : ''}`;
  }
  function historyRows(calibrations, year) {
    const selected = calibrations.filter(calibration => year === 'all' || clean(calibration.dateISO).slice(0, 4) === year);
    return selected.length ? selected.map(calibration => `<article class="standards-calibration-card"><div class="standards-calibration-heading"><div><strong>${h(calibration.code)}</strong><span>${h(calibration.laboratory || 'Laboratório não informado')}</span></div><time>${h(dateLabel(calibration.dateISO))}</time></div><p>${h(calibration.activityType || 'Calibração')} · Conformidade: ${h(({ unspecified: 'Não informada', yes: 'Sim', no: 'Não' })[calibration.conformity] || 'Não informada')}${calibration.validUntilISO ? ` · Validade: ${h(dateLabel(calibration.validUntilISO))}` : ''}</p><p>${calibration.resultsByRange?.reduce((count, result) => count + result.points.length, 0) || 0} pontos em ${calibration.measurementRangesSnapshot?.length || 0} intervalos preservados.</p>${attachmentButtons(calibration)}<div class="standards-actions">${action('Ver resultados', 'calibration-detail', '', ` data-standard-calibration="${h(calibration.id)}"`)}${action('Editar calibração', 'calibration-edit', '', ` data-standard-calibration="${h(calibration.id)}"`)}</div></article>`).join('') : '<p class="standards-empty">Nenhuma calibração neste ano.</p>';
  }
  function history(id) {
    const item = get(id); if (!item) return;
    const calibrations = getHistory(id), years = [...new Set(calibrations.map(calibration => calibration.dateISO.slice(0, 4)))].sort().reverse();
    openModal(`Certificados de ${item.code || item.name}`, `${item.name} · histórico de calibrações do padrão`, `<div data-standard-history="${h(id)}"><div class="standards-history-toolbar"><label for="standardHistoryYear">Ano</label><select id="standardHistoryYear" data-standard-history-year><option value="all">Todos os anos</option>${years.map(year => `<option value="${h(year)}">${h(year)}</option>`).join('')}</select>${action('＋ Nova calibração', 'calibration-new', id, '', true)}</div><div data-standard-history-rows>${historyRows(calibrations, 'all')}</div><p class="standards-note">Resultados transcritos pela equipe. Não há cálculo automático de aprovação ou incerteza. Os PDFs anexados são os arquivos enviados ao histórico.</p><div class="modal-actions">${action('Dados do padrão', 'detail', id)}${action('Fechar', 'close')}</div></div>`);
  }

  function pointRow(point = {}) { return `<tr data-standard-point>${pointKeys.map((key, index) => `<td><input data-standard-point-field="${key}" value="${h(point[key] || '')}" maxlength="${key === 'description' ? 2000 : 120}" aria-label="${pointLabels[index]}"></td>`).join('')}<td><button type="button" data-standard-point-remove aria-label="Remover ponto">×</button></td></tr>`; }
  function resultTable(range, result = {}) {
    const units = [...new Set(['', range.unit, '%', '°C', 'ml', 'µl', 'g', 'kg', 'pH', 'Pa', 'kPa', 'mm', 'V', result.errorUnit, result.uncertaintyUnit].filter(value => value != null))];
    const unitSelect = (name, label, value) => `<label>${label}<select data-standard-result="${name}">${units.map(unit => `<option value="${h(unit)}"${unit === value ? ' selected' : ''}>${h(unit || 'Não informada')}</option>`).join('')}</select></label>`;
    const modeSelect = (name, label, value) => `<label>${label}<select data-standard-result="${name}"><option value="absolute"${value !== 'relative' ? ' selected' : ''}>Absoluto</option><option value="relative"${value === 'relative' ? ' selected' : ''}>Relativo</option></select></label>`;
    return `<details class="standards-section" data-standard-result-range="${h(range.id)}" open><summary>${h(range.label)} · ${h(range.min || '—')} a ${h(range.max || '—')} ${h(range.unit)}</summary><div class="standards-section-body"><div class="standards-result-settings">${unitSelect('errorUnit', 'Unidade do erro', result.errorUnit ?? range.unit)}${modeSelect('errorMode', 'Modo do erro', result.errorMode)}${unitSelect('uncertaintyUnit', 'Unidade da incerteza', result.uncertaintyUnit ?? range.unit)}${modeSelect('uncertaintyMode', 'Modo da incerteza', result.uncertaintyMode)}</div><div class="table-scroll"><table class="standards-points-table"><thead><tr>${pointLabels.map(label => `<th>${label}</th>`).join('')}<th></th></tr></thead><tbody data-standard-points>${(result.points || []).map(pointRow).join('')}</tbody></table></div><button type="button" class="btn" data-standard-point-add>＋ Adicionar ponto</button><small class="standards-note">Até 100 pontos por intervalo. Valores com vírgula ou ponto; Veff pode ser ∞.</small></div></details>`;
  }
  function calibrationForm(id, calibrationId) {
    const item = get(id); if (!item) return;
    const calibration = calibrationId ? item.calibrations.find(entry => entry.id === calibrationId) : null;
    if (calibrationId && !calibration) return showToast('Calibração não encontrada neste padrão.');
    const ranges = calibration ? calibration.measurementRangesSnapshot || [] : item.measurementRanges;
    const draft = calibration || { conformity: 'unspecified', dateISO: '', activityType: 'Calibração', resultsByRange: [] };
    openModal(calibration ? 'Editar calibração do padrão' : 'Nova calibração do padrão', `${item.code || item.name} · ${item.name}`, `<form novalidate data-standard-calibration-form="${h(id)}" data-standard-calibration-id="${h(calibrationId || '')}"><div class="standards-grid">${field('calibrationCode', 'Código do certificado externo', draft.code, { required: true })}${field('laboratory', 'Laboratório responsável', draft.laboratory, { maxlength: 300 })}${field('dateISO', 'Data da calibração', draft.dateISO, { required: true, type: 'date' })}${field('activityType', 'Tipo de atividade', draft.activityType, { required: true })}${select('conformity', 'Conformidade informada', draft.conformity, [['unspecified', 'Não informada'], ['yes', 'Sim'], ['no', 'Não']])}${field('calibrationValidUntilISO', 'Validade do certificado (opcional)', draft.validUntilISO, { type: 'date' })}</div><div class="standards-upload"><label for="standardPDFFile">Certificado PDF real (até 20 MB)</label><input type="file" id="standardPDFFile" accept="application/pdf,.pdf" data-standard-pdf-input><p data-standard-upload-status role="status">${calibration?.attachmentName ? `PDF atual: ${h(calibration.attachmentName)}. Uma nova versão preserva o arquivo anterior.` : 'Nenhum arquivo selecionado. O PDF será armazenado antes de vincular a calibração.'}</p></div><p class="standards-warning">Os resultados e o parecer são informados pela equipe. Nenhuma aprovação é calculada. Os intervalos abaixo são preservados neste registro de calibração.</p>${ranges.length ? ranges.map(range => resultTable(range, draft.resultsByRange.find(result => result.rangeId === range.id))).join('') : '<p class="standards-note">Este padrão ainda não possui intervalos. O certificado e os dados gerais podem ser registrados sem pontos de medição.</p>'}<p class="standards-note">A validade do cadastro do padrão é editada em seu cadastro. Este registro preserva a validade própria do certificado externo.</p><p class="standards-error" role="alert" tabindex="-1" hidden></p><div class="modal-actions">${action('Cancelar', 'history', id)}<button type="submit" class="btn btn-primary" data-standard-calibration-submit>Salvar calibração</button></div></form>`);
    const form = document.querySelector('[data-standard-calibration-form]'); sessions.set(form, { id, calibrationId: calibrationId || '', attachmentId: calibration?.attachmentId || '', measurementRangesSnapshot: clone(ranges) });
  }
  function calibrationDetail(id, calibrationId) {
    const item = get(id), calibration = item?.calibrations.find(entry => entry.id === calibrationId); if (!calibration) return;
    const ranges = calibration.measurementRangesSnapshot || [];
    openModal(`Certificado ${calibration.code}`, `${item.code || item.name} · ${calibration.laboratory || 'Laboratório não informado'}`, `<div data-standard-calibration-detail>${definitions([['Atividade', calibration.activityType], ['Data da calibração', dateLabel(calibration.dateISO)], ['Validade do certificado', dateLabel(calibration.validUntilISO)], ['Conformidade informada', ({ unspecified: 'Não informada', yes: 'Sim', no: 'Não' })[calibration.conformity]]])}${attachmentButtons(calibration)}${ranges.map(range => { const result = calibration.resultsByRange.find(entry => entry.rangeId === range.id); return `<h3>${h(range.label)} · ${h(range.min || '—')} a ${h(range.max || '—')} ${h(range.unit)}</h3>${result ? `<p class="standards-note">Erro: ${h(result.errorMode === 'relative' ? 'Relativo' : 'Absoluto')} (${h(result.errorUnit || 'Unidade não informada')}) · Incerteza: ${h(result.uncertaintyMode === 'relative' ? 'Relativa' : 'Absoluta')} (${h(result.uncertaintyUnit || 'Unidade não informada')})</p><div class="table-scroll"><table class="standards-points-table is-readonly"><thead><tr>${pointLabels.map(label => `<th>${label}</th>`).join('')}</tr></thead><tbody>${result.points.map(point => `<tr>${pointKeys.map(key => `<td>${h(point[key]) || '—'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<p class="standards-note">Pontos não informados para este intervalo.</p>'}`; }).join('')}<div class="modal-actions">${action('Editar calibração', 'calibration-edit', id, ` data-standard-calibration="${h(calibrationId)}"`)}${action('Histórico', 'history', id)}</div></div>`);
  }

  function formError(form, message) { const error = form.querySelector('.standards-error'); error.textContent = message || 'Não foi possível salvar.'; error.hidden = false; error.focus(); }
  function invalidForm(form) { if (form.checkValidity()) return false; form.querySelector(':invalid')?.closest('details')?.setAttribute('open', ''); form.reportValidity(); return true; }
  function readRanges(form) { return Array.from(form.querySelectorAll('[data-standard-range-id]')).map(row => ({ id: row.dataset.standardRangeId, ...Object.fromEntries(Array.from(row.querySelectorAll('[data-standard-range]')).map(input => [input.dataset.standardRange, input.value])) })); }
  function readResults(form) { return Array.from(form.querySelectorAll('[data-standard-result-range]')).map(section => ({ rangeId: section.dataset.standardResultRange, ...Object.fromEntries(Array.from(section.querySelectorAll('[data-standard-result]')).map(input => [input.dataset.standardResult, input.value])), points: Array.from(section.querySelectorAll('[data-standard-point]')).map(row => Object.fromEntries(Array.from(row.querySelectorAll('[data-standard-point-field]')).map(input => [input.dataset.standardPointField, input.value]))) })); }
  function submitStandard(form) {
    if (portal() || invalidForm(form)) return;
    const session = sessions.get(form); if (!session || session.id !== form.dataset.standardForm) return formError(form, 'Abra novamente o cadastro do padrão.');
    const values = Object.fromEntries(Object.keys(standardStrings).map(field => [field, form.elements[field].value]));
    const existing = session.id ? get(session.id) : null;
    if (!existing?.code) values.code = form.elements.code.value;
    Object.assign(values, { active: form.elements.active.checked, fieldUse: form.elements.fieldUse.checked, validUntilISO: form.elements.validUntilISO.value, nextCheckISO: form.elements.nextCheckISO.value, frequencyMonths: Number(form.elements.frequencyMonths.value || 0), checkFrequencyMonths: Number(form.elements.checkFrequencyMonths.value || 0), measurementRanges: readRanges(form) });
    const result = session.id ? update(session.id, values) : create(values); if (!result.ok) return formError(form, result.error);
    closeModal(); refresh(); showToast('Padrão salvo com o histórico preservado.');
  }
  async function submitCalibration(form) {
    if (portal() || invalidForm(form)) return;
    const session = sessions.get(form); if (!session || session.id !== form.dataset.standardCalibrationForm || session.calibrationId !== form.dataset.standardCalibrationId) return formError(form, 'Abra novamente esta calibração.');
    const submit = form.querySelector('[data-standard-calibration-submit]'); if (submit.disabled) return; submit.disabled = true;
    try {
      const values = { code: form.elements.calibrationCode.value, laboratory: form.elements.laboratory.value, dateISO: form.elements.dateISO.value, activityType: form.elements.activityType.value, conformity: form.elements.conformity.value, validUntilISO: form.elements.calibrationValidUntilISO.value, resultsByRange: readResults(form), attachmentId: session.attachmentId };
      const file = form.querySelector('[data-standard-pdf-input]').files[0];
      if (file) {
        form.querySelector('[data-standard-upload-status]').textContent = 'Armazenando o PDF real…';
        const uploaded = await uploadPDF(file);
        if (!activeCalibrationForm(form)) return;
        if (!uploaded.ok) return formError(form, uploaded.error);
        session.attachmentId = uploaded.attachment.id; values.attachmentId = uploaded.attachment.id;
        form.querySelector('[data-standard-upload-status]').textContent = `PDF armazenado: ${uploaded.attachment.name}`;
        form.querySelector('[data-standard-pdf-input]').value = '';
      }
      if (portal()) return formError(form, 'O acesso ao laboratório foi encerrado.');
      if (!activeCalibrationForm(form)) return;
      const result = session.calibrationId ? updateCalibration(session.id, session.calibrationId, values) : addCalibration(session.id, values);
      if (!result.ok) return formError(form, result.error);
      history(session.id); showToast('Calibração e certificado registrados no histórico do padrão.');
    } finally { submit.disabled = false; }
  }
  function activeCalibrationForm(form) {
    return form.isConnected && document.querySelector('[data-standard-calibration-form]') === form && document.querySelector('#modalBackdrop')?.classList.contains('open');
  }
  document.addEventListener('input', event => { if (!portal() && event.target.matches('[data-standards-filter="query"]')) { view.query = event.target.value; refresh(); } });
  document.addEventListener('change', event => {
    if (portal()) return;
    if (event.target.matches('[data-standards-filter]')) { view[event.target.dataset.standardsFilter] = event.target.value; refresh(); }
    if (event.target.matches('[data-standard-history-year]')) { const root = event.target.closest('[data-standard-history]'); root.querySelector('[data-standard-history-rows]').innerHTML = historyRows(getHistory(root.dataset.standardHistory), event.target.value); }
    if (event.target.matches('[data-standard-pdf-input]')) { const file = event.target.files[0]; event.target.closest('form').querySelector('[data-standard-upload-status]').textContent = file ? `Selecionado: ${file.name}. Será armazenado ao salvar.` : 'Nenhum novo arquivo selecionado.'; }
  });
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-standards-action],[data-standard-range-add],[data-standard-range-remove],[data-standard-range-move],[data-standard-point-add],[data-standard-point-remove]'); if (!button || portal()) return;
    event.preventDefault(); const name = button.dataset.standardsAction, id = button.dataset.standardsId || button.closest('[data-standard-history]')?.dataset.standardHistory;
    if (name === 'new') return openForm(); if (name === 'edit') return openForm(id); if (name === 'detail') return showDetail(id); if (name === 'history') return history(id); if (name === 'close') return closeModal();
    if (name === 'calibration-new') return calibrationForm(id); if (name === 'calibration-edit') return calibrationForm(id, button.dataset.standardCalibration); if (name === 'calibration-detail') return calibrationDetail(id, button.dataset.standardCalibration);
    if (name === 'pdf-open' || name === 'pdf-download') { const result = await (name === 'pdf-open' ? openPDF : downloadPDF)(button.dataset.standardAttachment); if (!result.ok) showToast(result.error); return; }
    if (name === 'reset') { Object.assign(view, { query: '', active: 'all', expiry: 'all' }); const root = document.querySelector('[data-standards-workspace]'); root.querySelectorAll('[data-standards-filter]').forEach(control => { control.value = view[control.dataset.standardsFilter]; }); return refresh(); }
    const form = button.closest('form'); if (!form || !sessions.has(form)) return;
    if (button.hasAttribute('data-standard-range-add')) {
      const rows = form.querySelector('[data-standard-range-rows]'); if (rows.children.length >= 25) return formError(form, 'Use no máximo 25 intervalos de medição.');
      const definition = libraries.find(item => item[0] === form.querySelector('[data-standard-range-library]').value); rows.insertAdjacentHTML('beforeend', rangeRow({ tableId: definition[0], label: definition[1], unit: definition[2] })); rows.lastElementChild.querySelector('input:not([type="hidden"])').focus();
    }
    if (button.hasAttribute('data-standard-range-remove')) button.closest('[data-standard-range-id]').remove();
    if (button.hasAttribute('data-standard-range-move')) { const row = button.closest('[data-standard-range-id]'); if (button.dataset.standardRangeMove === 'up' && row.previousElementSibling) row.parentElement.insertBefore(row, row.previousElementSibling); if (button.dataset.standardRangeMove === 'down' && row.nextElementSibling) row.parentElement.insertBefore(row.nextElementSibling, row); button.focus(); }
    if (button.hasAttribute('data-standard-point-add')) { const rows = button.closest('[data-standard-result-range]').querySelector('[data-standard-points]'); if (rows.children.length >= 100) return formError(form, 'Use no máximo 100 pontos por intervalo.'); rows.insertAdjacentHTML('beforeend', pointRow()); rows.lastElementChild.querySelector('input').focus(); }
    if (button.hasAttribute('data-standard-point-remove')) button.closest('[data-standard-point]').remove();
  });
  document.addEventListener('submit', event => { if (event.target.matches('[data-standard-form]')) { event.preventDefault(); submitStandard(event.target); } if (event.target.matches('[data-standard-calibration-form]')) { event.preventDefault(); submitCalibration(event.target); } });
  document.addEventListener('ancal-standards-changed', refresh);

  seed();
  window.ancalStandards = { render, getAll, get, create, update, getHistory, addCalibration, updateCalibration, uploadPDF, downloadPDF, openPDF, getAttachment: attachmentFor, openForm, showDetail, history, calibrationForm, calibrationDetail };
}());
