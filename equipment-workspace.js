(function () {
  'use strict';

  const h = value => escapeHtml(value);
  const clean = value => String(value == null ? '' : value).trim();
  const digits = value => window.ancalIdentity?.key ? window.ancalIdentity.key(value) : clean(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const validDocument = value => window.ancalIdentity?.validDocument ? window.ancalIdentity.validDocument(value) : /^(?:\d{11}|[A-Z0-9]{12}\d{2})$/.test(digits(value));
  const fold = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const clone = value => JSON.parse(JSON.stringify(value));
  const portal = () => typeof portalMode !== 'undefined' && portalMode;
  const catalog = () => window.ancalEquipment;
  const sectors = [
    ['laboratory', '01 Laboratório'], ['maintenance', '02 Manutenção'],
    ['packing', '03 Aguardando embalagem e conferência'], ['ready', '04 Pronto para coleta']
  ];
  const views = [['catalog', 'Nenhum — todos os cadastrados'], ['all_sectors', 'Todos por setor'], ...sectors];
  const rangeLibrary = [
    ['temperature', 'Temperatura', '°C'], ['volume_ml', 'Volume', 'ml'], ['volume_ul', 'Volume', 'µl'],
    ['mass_g', 'Massa', 'g'], ['mass_kg', 'Massa', 'kg'], ['ph', 'pH', 'pH'],
    ['pressure_pa', 'Pressão', 'Pa'], ['pressure_kpa', 'Pressão', 'kPa'], ['humidity', 'Umidade', '%'],
    ['length_mm', 'Comprimento', 'mm'], ['length_cm', 'Comprimento', 'cm'], ['frequency', 'Frequência', 'Hz'],
    ['force', 'Força', 'N'], ['electrical', 'Tensão elétrica', 'V'], ['custom', 'Personalizada', '']
  ];
  const storageKey = 'ancal-equipment-workflow-v1';
  const state = { view: 'catalog', company: 'all', active: 'all', query: '' };
  const workflow = new Map();
  const formSessions = new WeakMap();
  const sectorLabel = value => sectors.find(sector => sector[0] === value)?.[1] || '01 Laboratório';
  const validSector = value => sectors.some(sector => sector[0] === value);
  const workKey = item => [item.orderId, digits(item.cnpj), item.equipmentId].join('|');
  const list = () => portal() ? [] : catalog()?.getAll() || [];
  const companies = () => window.ancalAccess?.getCompanies() || (typeof clients !== 'undefined' ? clients.map(client => ({ name: client[0], cnpj: client[1] })) : []);
  const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

  function readWorkflow() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      const entries = Array.isArray(saved) ? saved : Array.isArray(saved?.items) ? saved.items : [];
      entries.forEach(entry => {
        if (!entry || typeof entry !== 'object' || !clean(entry.orderId) || !validDocument(entry.cnpj) || !clean(entry.equipmentId) || !validSector(entry.sector)) return;
        const item = { orderId: clean(entry.orderId), cnpj: clean(entry.cnpj), equipmentId: clean(entry.equipmentId), sector: entry.sector };
        workflow.set(workKey(item), item);
      });
    } catch (_) { /* The operational board remains usable without local storage. */ }
  }

  function openOrder(record) {
    if (typeof isOpenServiceOrder === 'function') return isOpenServiceOrder(record);
    if (!record || record.closed === true || record.isClosed === true) return false;
    if (['done', 'cancelled', 'canceled', 'closed', 'finished'].includes(fold(record.type))) return false;
    return !/concluid|cancelad|encerrad|finalizad/.test(fold(record.status));
  }

  function sourceSector(record, equipment) {
    if (validSector(record.orderStage)) return record.orderStage;
    const configured = record.equipmentSectors;
    const explicit = Array.isArray(configured) ? configured.find(item => item && (item.equipmentId === equipment.id || item.tag === equipment.tag))?.sector
      : configured && typeof configured === 'object' ? configured[equipment.id] || configured[equipment.tag] : null;
    return validSector(explicit) ? explicit : /manutenc/.test(fold(record.service || record.serviceType)) ? 'maintenance' : 'laboratory';
  }

  function getWorkItems() {
    if (portal()) return [];
    const items = [];
    const seen = new Set();
    const source = typeof records !== 'undefined' && Array.isArray(records) ? records : [];
    source.filter(openOrder).forEach(record => {
      (catalog()?.fromOrder(record) || []).forEach(snapshot => {
        const equipment = catalog()?.get(snapshot.id) || snapshot;
        const snapshotValue = (key, fallback = '') => Object.hasOwn(snapshot, key) ? snapshot[key] : Object.hasOwn(equipment, key) ? equipment[key] : fallback;
        const key = workKey({ orderId: record.id, cnpj: record.cnpj, equipmentId: snapshot.id });
        if (!snapshot.id || seen.has(key)) return;
        seen.add(key);
        const saved = workflow.get(key);
        items.push({
          orderId: record.id, cnpj: record.cnpj, client: record.client, equipmentId: snapshot.id,
          name: snapshotValue('name'), tag: snapshotValue('tag'), serial: snapshotValue('serial'),
          model: snapshotValue('model'), manufacturer: snapshotValue('manufacturer'), clientSector: snapshotValue('clientSector'), className: snapshotValue('className'),
          measurementRanges: clone(snapshotValue('measurementRanges', [])), active: equipment.active !== false,
          sector: saved?.sector || sourceSector(record, snapshot), due: record.due || '', service: record.service || ''
        });
      });
    });
    return clone(items);
  }

  function setSector(orderId, equipmentId, sector, cnpj) {
    if (portal()) return { ok: false, error: 'O fluxo operacional é restrito ao laboratório.' };
    if (!validSector(sector)) return { ok: false, error: 'Selecione um setor operacional válido.' };
    const matches = getWorkItems().filter(item => item.orderId === orderId && item.equipmentId === equipmentId && (!cnpj || digits(item.cnpj) === digits(cnpj)));
    if (matches.length !== 1) return { ok: false, error: 'A OS foi encerrada ou o instrumento não está mais disponível neste fluxo.' };
    const item = { orderId: matches[0].orderId, cnpj: matches[0].cnpj, equipmentId: matches[0].equipmentId, sector };
    workflow.set(workKey(item), item);
    try { localStorage.setItem(storageKey, JSON.stringify({ items: Array.from(workflow.values()) })); } catch (_) {}
    document.dispatchEvent(new CustomEvent('ancal-equipment-workflow-changed'));
    return { ok: true, item: clone(item) };
  }

  function getSectorsForOrder(orderId, cnpj) {
    const order = window.ancalOrders?.get ? window.ancalOrders.get(orderId) : !portal() && typeof records !== 'undefined' ? records.find(record => record.id === orderId) : null;
    if (!order || (cnpj && digits(cnpj) !== digits(order.cnpj))) return [];
    if (!openOrder(order)) return ['finalized'];
    return [...new Set((catalog()?.fromOrder(order) || []).map(equipment => workflow.get(workKey({ orderId: order.id, cnpj: order.cnpj, equipmentId: equipment.id }))?.sector || sourceSector(order, equipment)))];
  }

  function dateLabel(value) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return value.split('-').reverse().join('/');
    if (/^\d{4}-\d{2}$/.test(value || '')) return value.split('-').reverse().join('/');
    return clean(value) || 'Não informado';
  }

  function getHistory(id) {
    if (portal()) return { equipment: null, certificates: [], orders: [] };
    const equipment = catalog()?.get(id);
    if (!equipment) return { equipment: null, certificates: [], orders: [] };
    const certificates = (window.ancalCertificates?.getAll() || []).filter(certificate => certificate.equipmentId === id && digits(certificate.cnpj) === digits(equipment.cnpj));
    const source = [...(window.ancalCertificates?.getOrders() || []), ...(typeof records !== 'undefined' && Array.isArray(records) ? records : [])];
    const orders = new Map();
    source.forEach(order => {
      if (digits(order.cnpj) !== digits(equipment.cnpj) || !(catalog()?.fromOrder(order) || []).some(item => item.id === id)) return;
      orders.set([order.id, digits(order.cnpj)].join('|'), clone(order));
    });
    return { equipment: clone(equipment), certificates: clone(certificates), orders: Array.from(orders.values()) };
  }

  function action(label, name, id = '', primary = false) {
    return `<button type="button" class="btn${primary ? ' btn-primary' : ''}" data-equipment-workspace-action="${name}"${id ? ` data-equipment-id="${h(id)}"` : ''}>${label}</button>`;
  }

  function rangesText(item) {
    const ranges = Array.isArray(item.measurementRanges) ? item.measurementRanges : [];
    return ranges.length ? ranges.map(range => [range.label, range.min || range.max ? [range.min || '—', range.max || '—'].join(' a ') : '', range.unit].filter(Boolean).join(' · ')).join('\n') : 'Não informadas';
  }

  function activePill(item) {
    return item.incomplete ? '<span class="equipment-workspace-pill is-pending">Completar cadastro</span>' : item.active === false ? '<span class="equipment-workspace-pill is-inactive">Inativo</span>' : '<span class="equipment-workspace-pill is-active">Ativo</span>';
  }

  function filterItems(items) {
    const query = fold(state.query);
    const numericQuery = digits(state.query);
    return items.filter(item => {
      if (state.company !== 'all' && digits(item.cnpj) !== digits(state.company)) return false;
      if (state.active === 'active' && item.active === false) return false;
      if (state.active === 'inactive' && item.active !== false) return false;
      const searchable = fold([item.name, item.tag, item.serial, item.model, item.manufacturer, item.client, item.cnpj, item.clientSector, item.orderId, rangesText(item)].join(' '));
      return !query || searchable.includes(query) || (numericQuery.length >= 5 && digits(item.cnpj).includes(numericQuery));
    });
  }

  function catalogRows(items) {
    return items.map(item => `<tr><td><strong>${h(item.tag || 'A informar')}</strong></td><td><strong>${h(item.name || 'Nome a informar')}</strong><span class="equipment-workspace-sub">${h(item.manufacturer || 'Fabricante não informado')}</span></td><td>${h(item.model || 'Não informado')}<span class="equipment-workspace-sub">${h(item.serial || 'Série não informada')}</span></td><td class="equipment-workspace-ranges">${h(rangesText(item))}</td><td><strong>${h(item.client || 'Empresa não vinculada')}</strong><span class="equipment-workspace-sub">${h(item.cnpj || '')}</span></td><td>${h(item.clientSector || 'Não informado')}</td><td>${activePill(item)}</td><td><div class="equipment-workspace-actions">${action(item.incomplete ? 'Completar' : 'Detalhes', item.incomplete ? 'edit' : 'detail', item.id)}${!item.incomplete ? action('Histórico', 'history', item.id) + action('Copiar', 'duplicate', item.id) : ''}</div></td></tr>`).join('');
  }

  function workRows(items) {
    const grouped = new Map();
    items.forEach(item => {
      const key = [state.view === 'all_sectors' ? item.sector : '', digits(item.cnpj), item.orderId].join('|');
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(item);
    });
    const groups = Array.from(grouped.values()).sort((a, b) => (state.view === 'all_sectors' ? sectorLabel(a[0].sector).localeCompare(sectorLabel(b[0].sector), 'pt-BR') : 0) || a[0].client.localeCompare(b[0].client, 'pt-BR') || b[0].orderId.localeCompare(a[0].orderId, 'pt-BR', { numeric: true }));
    let previousSector = '', previousCompany = '', html = '';
    groups.forEach(group => {
      const first = group[0];
      if (state.view === 'all_sectors' && previousSector !== first.sector) {
        html += `<tr class="equipment-workspace-sector-row"><td colspan="8"><strong>${h(sectorLabel(first.sector))}</strong><span>${plural(items.filter(item => item.sector === first.sector).length, 'instrumento', 'instrumentos')}</span></td></tr>`;
        previousSector = first.sector; previousCompany = '';
      }
      if (previousCompany !== digits(first.cnpj)) {
        html += `<tr class="equipment-workspace-company-row"><td colspan="8"><strong>${h(first.client)}</strong><span>${h(first.cnpj)}</span></td></tr>`;
        previousCompany = digits(first.cnpj);
      }
      html += `<tr class="equipment-workspace-order-row"><td colspan="8"><strong>${h(first.orderId)}</strong><span>${plural(group.length, 'instrumento', 'instrumentos')} · entrega: ${h(first.due || 'Não informada')}</span></td></tr>`;
      group.forEach(item => {
        html += `<tr><td><strong>${h(item.tag)}</strong></td><td><strong>${h(item.name)}</strong><span class="equipment-workspace-sub">${h(item.model || item.manufacturer || '')}</span></td><td>${h(item.serial || 'Não informado')}</td><td class="equipment-workspace-ranges">${h(rangesText(item))}</td><td>${h(item.due || 'Não informada')}</td><td><strong>${h(item.orderId)}</strong><span class="equipment-workspace-sub">${h(item.client)}</span></td><td><select class="equipment-workspace-sector-select" data-equipment-sector-order="${h(item.orderId)}" data-equipment-sector-id="${h(item.equipmentId)}" data-equipment-sector-cnpj="${h(item.cnpj)}" aria-label="Setor operacional de ${h(item.tag)} na OS ${h(item.orderId)}">${sectors.map(([value, label]) => `<option value="${value}"${value === item.sector ? ' selected' : ''}>${h(label)}</option>`).join('')}</select></td><td><div class="equipment-workspace-actions">${action('Detalhes', 'detail', item.equipmentId)}${action('Histórico', 'history', item.equipmentId)}</div></td></tr>`;
      });
    });
    return html;
  }

  function results() {
    const operational = state.view !== 'catalog';
    let source = operational ? getWorkItems() : list();
    if (operational && state.view !== 'all_sectors') source = source.filter(item => item.sector === state.view);
    const matches = filterItems(source);
    return { operational, source, matches };
  }

  function headers(operational) {
    return (operational ? ['IDENTIFICAÇÃO', 'TIPO / EQUIPAMENTO', 'NÚMERO DE SÉRIE', 'FAIXAS DE MEDIÇÃO', 'ENTREGA', 'OS / EMPRESA', 'SETOR OPERACIONAL', 'AÇÕES'] : ['IDENTIFICAÇÃO', 'TIPO / EQUIPAMENTO', 'MODELO / SÉRIE', 'FAIXAS DE MEDIÇÃO', 'EMPRESA / CNPJ', 'SETOR DO CLIENTE', 'SITUAÇÃO', 'AÇÕES']).map(label => `<th>${label}</th>`).join('');
  }

  function resultText(data) {
    return `${plural(data.matches.length, data.operational ? 'instrumento na operação' : 'equipamento', data.operational ? 'instrumentos na operação' : 'equipamentos')} de ${data.source.length} · ${plural(new Set(data.matches.map(item => digits(item.cnpj))).size, 'empresa', 'empresas')}${data.operational ? ` · ${plural(new Set(data.matches.map(item => [item.orderId, digits(item.cnpj)].join('|'))).size, 'OS', 'OS')}` : ''}`;
  }

  function refresh() {
    const root = document.querySelector('[data-equipment-workspace]');
    if (!root || portal()) return;
    const focused = document.activeElement;
    const focusedSector = focused?.matches?.('[data-equipment-sector-order]') ? { orderId: focused.dataset.equipmentSectorOrder, equipmentId: focused.dataset.equipmentSectorId, cnpj: focused.dataset.equipmentSectorCnpj } : null;
    const data = results();
    root.querySelector('[data-equipment-workspace-head]').innerHTML = headers(data.operational);
    root.querySelector('[data-equipment-workspace-rows]').innerHTML = data.operational ? workRows(data.matches) : catalogRows(data.matches);
    root.querySelector('[data-equipment-workspace-result]').textContent = resultText(data);
    root.querySelector('[data-equipment-workspace-empty]').hidden = Boolean(data.matches.length);
    root.querySelector('[data-equipment-workspace-help]').textContent = data.operational ? 'O setor acompanha cada instrumento em cada OS aberta. Setor do cliente e situação do cadastro são informações independentes.' : 'Nenhum exibe todo o catálogo, incluindo equipamentos sem OS e inativos. Os filtros de empresa, situação e busca são combinados.';
    const query = root.querySelector('[data-equipment-workspace-query]');
    if (query.value !== state.query) query.value = state.query;
    root.querySelectorAll('[data-equipment-workspace-filter]').forEach(control => { control.value = state[control.dataset.equipmentWorkspaceFilter]; });
    if (focusedSector) {
      const replacement = Array.from(root.querySelectorAll('[data-equipment-sector-order]')).find(control => control.dataset.equipmentSectorOrder === focusedSector.orderId && control.dataset.equipmentSectorId === focusedSector.equipmentId && digits(control.dataset.equipmentSectorCnpj) === digits(focusedSector.cnpj));
      (replacement || root.querySelector('[data-equipment-workspace-filter="view"]'))?.focus();
    }
  }

  function renderPage() {
    if (portal()) return '';
    const data = results();
    return `${heading('Equipamentos', 'Cadastro dos instrumentos e acompanhamento por setor de trabalho.', action('＋ Novo equipamento', 'new', '', true))}<div class="equipment-workspace" data-equipment-workspace><section class="panel table-panel"><div class="equipment-workspace-heading"><div><h2>Catálogo e fluxo de equipamentos</h2><p>Consulte os cadastros ou acompanhe os instrumentos das ordens em aberto.</p></div></div><div class="equipment-workspace-filters"><label class="equipment-workspace-filter equipment-workspace-filter-search"><span>Buscar equipamento</span><input type="search" data-equipment-workspace-query value="${h(state.query)}" placeholder="Tipo, identificação, série, empresa ou OS" aria-label="Buscar equipamento"></label><label class="equipment-workspace-filter"><span>Visão / setor operacional</span><select data-equipment-workspace-filter="view" aria-label="Visão ou setor operacional">${views.map(([value, label]) => `<option value="${value}"${state.view === value ? ' selected' : ''}>${h(label)}</option>`).join('')}</select></label><label class="equipment-workspace-filter"><span>Empresa</span><select data-equipment-workspace-filter="company" aria-label="Filtrar equipamentos por empresa"><option value="all">Todas as empresas</option>${companies().map(company => `<option value="${h(company.cnpj)}"${digits(company.cnpj) === digits(state.company) ? ' selected' : ''}>${h(company.name)}</option>`).join('')}</select></label><label class="equipment-workspace-filter"><span>Situação do cadastro</span><select data-equipment-workspace-filter="active" aria-label="Situação do cadastro"><option value="all"${state.active === 'all' ? ' selected' : ''}>Ativos e inativos</option><option value="active"${state.active === 'active' ? ' selected' : ''}>Ativos</option><option value="inactive"${state.active === 'inactive' ? ' selected' : ''}>Inativos</option></select></label></div><p class="equipment-workspace-search-help" data-equipment-workspace-help>${data.operational ? 'O setor acompanha cada instrumento em cada OS aberta. Setor do cliente e situação do cadastro são informações independentes.' : 'Nenhum exibe todo o catálogo, incluindo equipamentos sem OS e inativos. Os filtros de empresa, situação e busca são combinados.'}</p><div class="equipment-workspace-result"><span data-equipment-workspace-result role="status" aria-live="polite">${resultText(data)}</span><button type="button" class="equipment-workspace-text" data-equipment-workspace-action="reset">Limpar filtros</button></div><div class="table-scroll" tabindex="0" role="region" aria-label="Tabela de equipamentos, com rolagem horizontal"><table class="equipment-workspace-table"><thead><tr data-equipment-workspace-head>${headers(data.operational)}</tr></thead><tbody data-equipment-workspace-rows>${data.operational ? workRows(data.matches) : catalogRows(data.matches)}</tbody></table></div><div class="equipment-workspace-empty" data-equipment-workspace-empty${data.matches.length ? ' hidden' : ''}><span aria-hidden="true">◎</span><strong>Nenhum equipamento neste filtro</strong><p>Altere a busca, a empresa, a situação ou o setor selecionado.</p></div></section><p class="equipment-workspace-note">O cadastro pertence ao CNPJ vinculado. Alterações do setor operacional não modificam os dados da OS nem o setor interno informado pelo cliente.</p></div>`;
  }

  function field(id, name, label, value, options = {}) {
    const attrs = `id="${id}" name="${name}"${options.required ? ' required' : ''}${options.disabled ? ' disabled' : ''}`;
    const control = options.area ? `<textarea ${attrs} rows="${options.rows || 4}" maxlength="5000">${h(value || '')}</textarea>` : `<input ${attrs} type="${options.type || 'text'}" value="${h(value ?? '')}" maxlength="${options.maxlength || 160}"${options.list ? ` list="${options.list}"` : ''}${options.min != null ? ` min="${options.min}"` : ''}${options.max != null ? ` max="${options.max}"` : ''}${options.step ? ` step="${options.step}"` : ''}>`;
    return `<div class="equipment-workspace-field${options.full ? ' is-full' : ''}"><label for="${id}">${h(label)}</label>${control}${options.help ? `<small>${h(options.help)}</small>` : ''}</div>`;
  }
  function nextCalibrationField(value) {
    const options = { id: 'equipmentNextCalibration', name: 'nextCalibrationISO', label: 'Próxima calibração', value: value || '', help: 'Selecione mês e ano. O dia é opcional e não será preenchido automaticamente.' };
    return window.ancalOptionalDate?.render ? `<div class="equipment-workspace-field is-full">${window.ancalOptionalDate.render(options)}</div>` : field(options.id, options.name, options.label, options.value, { help: options.help, full: true });
  }

  function knownList(key, id, company) {
    const values = Array.from(new Set(list().filter(item => !company || digits(item.cnpj) === digits(company)).map(item => clean(item[key])).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return `<datalist id="${id}">${values.map(value => `<option value="${h(value)}"></option>`).join('')}</datalist>`;
  }

  function rangeRow(range) {
    return `<tr data-equipment-range-row><td><input data-equipment-range="tableId" type="hidden" value="${h(range.tableId || 'custom')}"><input data-equipment-range="label" value="${h(range.label || '')}" maxlength="160" aria-label="Grandeza da faixa"></td>${['min', 'max', 'unit', 'resolution'].map((key, index) => `<td><input data-equipment-range="${key}" value="${h(range[key] || '')}" maxlength="${key === 'unit' ? 40 : 120}" aria-label="${['Mínimo', 'Máximo', 'Unidade', 'Resolução'][index]} da faixa"></td>`).join('')}<td><div class="equipment-workspace-range-actions"><button type="button" data-equipment-range-move="up" aria-label="Mover faixa para cima">↑</button><button type="button" data-equipment-range-move="down" aria-label="Mover faixa para baixo">↓</button><button type="button" data-equipment-range-remove aria-label="Remover faixa">×</button></div></td></tr>`;
  }

  function additionalRow(item) {
    return `<div class="equipment-workspace-additional-row" data-equipment-additional-row><input data-equipment-additional="label" value="${h(item.label || '')}" maxlength="160" placeholder="Nome do campo" aria-label="Nome do campo adicional"><input data-equipment-additional="value" value="${h(item.value || '')}" maxlength="2000" placeholder="Valor" aria-label="Valor do campo adicional"><button type="button" data-equipment-additional-remove aria-label="Remover campo adicional">×</button></div>`;
  }

  function historyContent(id) {
    const data = getHistory(id);
    return `<h3 class="equipment-workspace-detail-title">Certificados do instrumento</h3>${data.certificates.length ? `<div class="table-scroll"><table class="equipment-workspace-mini-table"><thead><tr><th>CERTIFICADO</th><th>OS</th><th>ATIVIDADE</th><th>SITUAÇÃO</th><th>CALIBRAÇÃO</th><th>VERSÃO</th><th>LABORATÓRIO</th><th></th></tr></thead><tbody>${data.certificates.map(certificate => `<tr><td><strong>${h(certificate.code)}</strong></td><td>${h(certificate.orderId)}</td><td>${h(certificate.activityType || 'Não informado')}</td><td>${h(({ signed: 'Assinado', awaiting_signature: 'Aguardando assinatura', cancelled: 'Cancelado' })[certificate.status] || 'Não informado')}</td><td>${h(dateLabel(certificate.calibrationDateISO))}</td><td>${h(certificate.documentVersion || certificate.certificateVersion || certificate.version || 'Não informado')}</td><td>${h(certificate.laboratory || certificate.laboratoryName || 'Não informado')}</td><td><button type="button" class="equipment-workspace-text" data-equipment-workspace-action="certificate" data-equipment-certificate-id="${h(certificate.id)}">Abrir</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="equipment-workspace-history-empty">Nenhum certificado registrado para este equipamento.</p>'}<h3 class="equipment-workspace-detail-title">Ordens de serviço relacionadas</h3>${data.orders.length ? `<div class="equipment-workspace-history-list">${data.orders.map(order => `<article class="equipment-workspace-history-entry"><div class="equipment-workspace-history-entry-heading"><strong>${h(order.id)}</strong><span class="equipment-workspace-pill${openOrder(order) ? ' is-active' : ''}">${h(order.status || (openOrder(order) ? 'Em aberto' : 'Encerrada'))}</span></div><p>${h(order.client)} · ${h(order.cnpj)}</p><p>Entrega: ${h(order.due || 'Não informada')}${order.service ? ` · Serviço: ${h(order.service)}` : ''}</p></article>`).join('')}</div>` : '<p class="equipment-workspace-history-empty">Não há ordens de serviço vinculadas a este instrumento.</p>'}`;
  }

  function openForm(id, sourceId = '') {
    if (portal()) return;
    const item = id ? catalog()?.get(id) : null;
    if (id && !item) return showToast('Equipamento não encontrado.');
    const source = sourceId ? catalog()?.get(sourceId) : null;
    if (sourceId && (!source || source.incomplete || item)) return showToast('Selecione um equipamento-base válido.');
    const draft = item ? clone(item) : source ? catalog().duplicateDraft(sourceId) : { active: true, calibrationFrequencyMonths: 0, measurementRanges: [], additionalFields: [] };
    if (!draft) return showToast('Não foi possível copiar este equipamento.');
    const locked = Boolean(item && !item.incomplete);
    const hadOwnNextCalibration = Boolean(item && Object.hasOwn(item, 'nextCalibrationISO'));
    if (locked && !hadOwnNextCalibration) draft.nextCalibrationISO = window.ancalExpiry?.scheduleFor(item.cnpj, item.tag)?.nextCalibrationISO || '';
    const initialNextCalibration = clean(draft.nextCalibrationISO);
    const options = companies();
    const copy = !item ? `<div class="equipment-workspace-field is-full"><label for="equipmentCopySource">Copiar de equipamento cadastrado (opcional)</label><select id="equipmentCopySource" name="equipmentCopySource"><option value="">Começar sem cópia</option>${list().filter(entry => !entry.incomplete).map(entry => `<option value="${h(entry.id)}"${entry.id === sourceId ? ' selected' : ''}>${h(entry.name)} · ${h(entry.tag)} · ${h(entry.client)}</option>`).join('')}</select></div><p class="equipment-workspace-copy-note" id="equipmentCopyNote"${source ? '' : ' hidden'}>Cópia de ${h(source?.tag || '')}. Informe uma nova identificação e revise o número de série, a empresa e a próxima calibração.</p>` : '';
    const general = `<div class="equipment-workspace-grid">${copy}<div class="equipment-workspace-field is-full"><label for="equipmentCompany">Empresa</label><select id="equipmentCompany" name="cnpj" required${locked ? ' disabled' : ''}><option value="">Selecione uma empresa</option>${options.map(company => `<option value="${h(company.cnpj)}"${digits(company.cnpj) === digits(draft.cnpj) ? ' selected' : ''}>${h(company.name)} · ${h(company.cnpj)}</option>`).join('')}</select>${locked ? '<small>O vínculo da empresa é preservado neste cadastro.</small>' : ''}</div>${field('equipmentName', 'name', 'Tipo / nome do equipamento', draft.name, { required: true, maxlength: 120, list: 'equipmentKnownNames', full: true })}${field('equipmentTag', 'tag', 'Identificação / tag', draft.tag, { required: true, disabled: locked, maxlength: 60, help: locked ? 'A identificação é preservada para manter os vínculos existentes.' : 'Informe uma identificação única para esta empresa.' })}${field('equipmentClientSector', 'clientSector', 'Setor do cliente', draft.clientSector, { maxlength: 160, list: 'equipmentClientSectors', help: 'Setor interno da empresa cliente. Aceita uma nova descrição.' })}${field('equipmentManufacturer', 'manufacturer', 'Fabricante', draft.manufacturer, { maxlength: 100, list: 'equipmentKnownManufacturers' })}${field('equipmentModel', 'model', 'Modelo', draft.model, { maxlength: 160, list: 'equipmentKnownModels' })}${field('equipmentSerial', 'serial', 'Número de série', draft.serial, { maxlength: 160, help: 'Registros antigos podem conter modelo e série no mesmo texto; revise somente quando necessário.' })}${nextCalibrationField(draft.nextCalibrationISO)}${field('equipmentFrequency', 'calibrationFrequencyMonths', 'Frequência de calibração (meses)', draft.calibrationFrequencyMonths ?? 0, { type: 'number', min: 0, max: 1200, step: 1, help: '0 = não definida. Este valor não publica periodicidade nem próxima data nos certificados.' })}<div class="equipment-workspace-field"><label class="equipment-workspace-check"><input type="checkbox" id="equipmentActive" name="active"${draft.active !== false ? ' checked' : ''}><span>Equipamento ativo</span></label><small>Equipamentos inativos permanecem no catálogo e no histórico. Novas OS utilizam os equipamentos ativos.</small></div></div><details class="equipment-workspace-form-section" open><summary>Faixas de medição</summary><div class="equipment-workspace-form-section-body"><div class="table-scroll"><table class="equipment-workspace-range-table"><thead><tr><th>GRANDEZA / TABELA</th><th>MÍNIMO</th><th>MÁXIMO</th><th>UNIDADE</th><th>RESOLUÇÃO</th><th>ORDEM / REMOVER</th></tr></thead><tbody data-equipment-range-rows>${(draft.measurementRanges || []).map(rangeRow).join('')}</tbody></table></div><div class="equipment-workspace-range-picker"><label for="equipmentRangeLibrary">Adicionar faixa a partir de</label><select id="equipmentRangeLibrary">${rangeLibrary.map(([key, label, unit]) => `<option value="${key}">${h(label)}${unit ? ` (${h(unit)})` : ''}</option>`).join('')}</select><button type="button" class="btn" data-equipment-range-add>＋ Adicionar faixa</button></div><p class="equipment-workspace-note">As faixas são preservadas na ordem indicada. Todos os valores e unidades podem ser editados.</p></div></details>${knownList('name', 'equipmentKnownNames')}${knownList('manufacturer', 'equipmentKnownManufacturers')}${knownList('model', 'equipmentKnownModels')}${knownList('clientSector', 'equipmentClientSectors', draft.cnpj)}`;
    openModal(item ? item.incomplete ? 'Completar cadastro do equipamento' : 'Editar equipamento' : source ? 'Copiar equipamento' : 'Novo equipamento', 'Cadastre os dados do instrumento por empresa e preserve as informações usadas no dia a dia.', `<form id="equipmentForm" novalidate data-equipment-workspace-form data-equipment-edit-id="${h(item?.id || '')}" data-equipment-copy-source-id="${h(sourceId)}"><div class="equipment-workspace-history-tabs" role="tablist" aria-label="Cadastro do equipamento">${[['general', 'Dados gerais'], ['observations', 'Observações'], ['certificates', 'Certificados'], ['additional', 'Campos adicionais']].map(([tab, label], index) => `<button type="button" role="tab" aria-selected="${index === 0}" class="${index === 0 ? 'is-active' : ''}" data-equipment-form-tab="${tab}">${label}</button>`).join('')}</div><div data-equipment-form-panel="general">${general}</div><div data-equipment-form-panel="observations" hidden>${field('equipmentObservations', 'observations', 'Observações do equipamento', draft.observations, { area: true, rows: 6, full: true })}<p class="equipment-workspace-note">Anotações internas do cadastro do equipamento.</p>${field('equipmentCertificateObservation', 'certificateObservation', 'Observação do certificado', draft.certificateObservation, { area: true, rows: 6, full: true })}<p class="equipment-workspace-note">Este texto preenche as observações finais ao preparar novos certificados deste equipamento. Certificados já preparados ou assinados mantêm seu conteúdo.</p></div><div data-equipment-form-panel="certificates" hidden>${item && !item.incomplete ? historyContent(item.id) : '<p class="equipment-workspace-history-empty">Salve o equipamento para consultar os certificados e as OS vinculadas. A cópia não transfere o histórico do equipamento original.</p>'}</div><div data-equipment-form-panel="additional" hidden><div class="equipment-workspace-grid">${field('equipmentClass', 'className', 'Classe do instrumento', draft.className, { maxlength: 100, full: true })}</div><h3 class="equipment-workspace-detail-title">Outros campos específicos</h3><div data-equipment-additional-rows>${(draft.additionalFields || []).map(additionalRow).join('')}</div><button type="button" class="btn" data-equipment-additional-add>＋ Adicionar campo</button><p class="equipment-workspace-note">Até 20 pares de campo e valor para características específicas deste tipo de equipamento.</p></div><p class="equipment-workspace-error equipment-error" role="alert" tabindex="-1" hidden></p><div class="modal-actions">${action('Cancelar', 'close')}<button type="submit" class="btn btn-primary">Salvar equipamento</button></div></form>`);
    const form = document.getElementById('equipmentForm');
    formSessions.set(form, { editId: item?.id || '', sourceId, currentCnpj: draft.cnpj || '', locked, hadOwnNextCalibration, initialNextCalibration, original: item ? clone(item) : null });
  }

  function definitionList(values) {
    return `<dl class="equipment-workspace-detail">${values.map(([label, value, full]) => `<div${full ? ' class="is-full"' : ''}><dt>${h(label)}</dt><dd>${h(value || 'Não informado')}</dd></div>`).join('')}</dl>`;
  }

  function showDetail(id) {
    if (portal()) return;
    const item = catalog()?.get(id);
    if (!item) return showToast('Equipamento não encontrado.');
    openModal(item.name || 'Equipamento', `${item.tag || 'Cadastro incompleto'} · ${item.client || 'Empresa não vinculada'}`, `<div data-equipment-workspace-detail>${activePill(item)}${definitionList([['Empresa', item.client], ['CNPJ', item.cnpj], ['Identificação', item.tag], ['Setor do cliente', item.clientSector], ['Fabricante', item.manufacturer], ['Modelo', item.model], ['Número de série', item.serial], ['Classe', item.className], ['Próxima calibração', dateLabel(item.nextCalibrationISO)], ['Frequência de calibração', item.calibrationFrequencyMonths ? `${item.calibrationFrequencyMonths} meses` : 'Não definida'], ['Faixas de medição', rangesText(item), true], ['Observações internas', item.observations, true], ['Observação do certificado', item.certificateObservation, true]])}${(item.additionalFields || []).length ? `<h3 class="equipment-workspace-detail-title">Campos adicionais</h3>${definitionList(item.additionalFields.map(field => [field.label, field.value]))}` : ''}<p class="equipment-workspace-note">O setor operacional pertence ao instrumento dentro de cada OS; o setor do cliente é uma característica do cadastro.</p><div class="modal-actions">${action('Editar', 'edit', id)}${!item.incomplete ? action('Histórico e certificados', 'history', id) + action('Copiar equipamento', 'duplicate', id) : ''}${action('Fechar', 'close')}</div></div>`);
  }

  function history(id) {
    if (portal()) return;
    const item = catalog()?.get(id);
    if (!item) return showToast('Equipamento não encontrado.');
    openModal('Histórico do equipamento', `${item.name} · ${item.tag} · ${item.client}`, `<div data-equipment-workspace-history>${historyContent(id)}<p class="equipment-workspace-note">São exibidos apenas registros existentes. Versão e laboratório ficam como Não informado quando não foram cadastrados.</p><div class="modal-actions">${action('Dados do equipamento', 'detail', id)}${action('Fechar', 'close')}</div></div>`);
  }

  function showError(form, message) {
    const target = form.querySelector('.equipment-workspace-error');
    target.textContent = message || 'Não foi possível salvar o equipamento.'; target.hidden = false; target.focus();
  }

  function collectRows(form, selector, dataKey) {
    return Array.from(form.querySelectorAll(selector)).map(row => Object.fromEntries(Array.from(row.querySelectorAll(`[${dataKey}]`)).map(input => [input.getAttribute(dataKey), input.value.trim()])));
  }

  function submit(form) {
    if (portal()) return;
    const session = formSessions.get(form);
    if (!session || session.editId !== form.dataset.equipmentEditId || session.sourceId !== form.dataset.equipmentCopySourceId) return showError(form, 'Abra novamente o formulário para manter os vínculos do cadastro.');
    const picker = form.querySelector('#equipmentNextCalibration')?.closest('[data-optional-date]');
    const selectedDate = picker && window.ancalOptionalDate?.sync ? window.ancalOptionalDate.sync(picker) : null;
    if (selectedDate && !selectedDate.ok) { switchTab(form, 'general'); return showError(form, selectedDate.error); }
    if (!form.checkValidity()) {
      const invalid = form.querySelector(':invalid');
      if (invalid) {
        const panel = invalid.closest('[data-equipment-form-panel]');
        if (panel) switchTab(form, panel.dataset.equipmentFormPanel);
        invalid.closest('details')?.setAttribute('open', '');
      }
      form.reportValidity(); return;
    }
    const value = name => form.elements[name]?.value.trim() || '';
    const ranges = collectRows(form, '[data-equipment-range-row]', 'data-equipment-range');
    const additionalFields = collectRows(form, '[data-equipment-additional-row]', 'data-equipment-additional').filter(field => field.label || field.value);
    if (additionalFields.length > 20) return showError(form, 'Use no máximo 20 campos adicionais.');
    const values = { name: value('name'), serial: value('serial'), model: value('model'), manufacturer: value('manufacturer'), clientSector: value('clientSector'), className: value('className'), active: form.elements.active.checked, calibrationFrequencyMonths: value('calibrationFrequencyMonths') === '' ? 0 : Number(value('calibrationFrequencyMonths')), nextCalibrationISO: value('nextCalibrationISO'), observations: value('observations'), certificateObservation: String(form.elements.certificateObservation?.value || '').replace(/\r\n?/g, '\n'), measurementRanges: ranges, additionalFields };
    if (selectedDate) values.nextCalibrationISO = selectedDate.value;
    if (session.locked && !session.hadOwnNextCalibration && values.nextCalibrationISO === session.initialNextCalibration) delete values.nextCalibrationISO;
    if (!session.locked) { values.cnpj = value('cnpj'); values.tag = value('tag'); }
    const result = session.editId ? catalog().update(session.editId, values) : catalog().create({ ...values, cnpj: value('cnpj'), tag: value('tag') });
    if (!result?.ok) return showError(form, result?.error);
    closeModal(); refresh(); showToast(session.editId ? 'Cadastro do equipamento atualizado.' : 'Equipamento cadastrado.');
  }

  function switchTab(form, selected) {
    form.querySelectorAll('[data-equipment-form-tab]').forEach(button => {
      const active = button.dataset.equipmentFormTab === selected;
      button.classList.toggle('is-active', active); button.setAttribute('aria-selected', String(active));
    });
    form.querySelectorAll('[data-equipment-form-panel]').forEach(panel => { panel.hidden = panel.dataset.equipmentFormPanel !== selected; });
  }

  document.addEventListener('input', event => {
    if (!event.target.matches('[data-equipment-workspace-query]') || portal()) return;
    state.query = event.target.value; refresh();
  });

  document.addEventListener('change', event => {
    if (portal()) return;
    const control = event.target;
    if (control.matches('[data-equipment-workspace-filter]')) {
      state[control.dataset.equipmentWorkspaceFilter] = control.value; refresh();
    }
    if (control.matches('[data-equipment-sector-order]')) {
      const result = setSector(control.dataset.equipmentSectorOrder, control.dataset.equipmentSectorId, control.value, control.dataset.equipmentSectorCnpj);
      if (!result.ok) { showToast(result.error); refresh(); }
      else showToast('Setor operacional atualizado para este instrumento nesta OS.');
    }
    const form = control.closest('[data-equipment-workspace-form]');
    if (!form) return;
    if (control.id === 'equipmentCompany') {
      const session = formSessions.get(form);
      if (!session || session.locked) return;
      if (digits(control.value) !== digits(session.currentCnpj)) form.elements.clientSector.value = '';
      session.currentCnpj = control.value;
      const dataList = form.querySelector('#equipmentClientSectors');
      if (dataList) dataList.outerHTML = knownList('clientSector', 'equipmentClientSectors', control.value);
    }
    if (control.id === 'equipmentCopySource') {
      const session = formSessions.get(form);
      if (session?.editId) return;
      const source = control.value ? catalog().get(control.value) : null;
      if (control.value && (!source || source.incomplete)) return showError(form, 'Selecione um equipamento-base válido.');
      openForm(null, source?.id || '');
    }
  });

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-equipment-workspace-action],[data-equipment-form-tab],[data-equipment-range-add],[data-equipment-range-remove],[data-equipment-range-move],[data-equipment-additional-add],[data-equipment-additional-remove]');
    if (!button || portal()) return;
    event.preventDefault();
    const actionName = button.dataset.equipmentWorkspaceAction;
    const id = button.dataset.equipmentId;
    if (actionName === 'new') return openForm();
    if (actionName === 'edit') return openForm(id);
    if (actionName === 'detail') return showDetail(id);
    if (actionName === 'duplicate') return openForm(null, id);
    if (actionName === 'history') return history(id);
    if (actionName === 'close') return closeModal();
    if (actionName === 'certificate') {
      const certificate = window.ancalCertificates?.get(button.dataset.equipmentCertificateId);
      if (!certificate) return showToast('Certificado indisponível para este acesso.');
      return window.ancalCertificatesUI?.open(certificate.id);
    }
    if (actionName === 'reset') { Object.assign(state, { view: 'catalog', company: 'all', active: 'all', query: '' }); return refresh(); }
    const form = button.closest('[data-equipment-workspace-form]');
    if (!form || !formSessions.has(form)) return;
    if (button.hasAttribute('data-equipment-form-tab')) return switchTab(form, button.dataset.equipmentFormTab);
    if (button.hasAttribute('data-equipment-range-add')) {
      const definition = rangeLibrary.find(item => item[0] === form.querySelector('#equipmentRangeLibrary').value) || rangeLibrary[rangeLibrary.length - 1];
      const body = form.querySelector('[data-equipment-range-rows]');
      if (body.children.length >= 25) return showError(form, 'Use no máximo 25 faixas de medição.');
      body.insertAdjacentHTML('beforeend', rangeRow({ tableId: definition[0], label: definition[1], unit: definition[2] })); body.lastElementChild.querySelector('input:not([type="hidden"])')?.focus();
    }
    if (button.hasAttribute('data-equipment-range-remove')) { button.closest('[data-equipment-range-row]').remove(); form.querySelector('[data-equipment-range-add]')?.focus(); }
    if (button.hasAttribute('data-equipment-range-move')) {
      const row = button.closest('[data-equipment-range-row]');
      if (button.dataset.equipmentRangeMove === 'up' && row.previousElementSibling) row.parentElement.insertBefore(row, row.previousElementSibling);
      if (button.dataset.equipmentRangeMove === 'down' && row.nextElementSibling) row.parentElement.insertBefore(row.nextElementSibling, row);
      button.focus();
    }
    if (button.hasAttribute('data-equipment-additional-add')) {
      const body = form.querySelector('[data-equipment-additional-rows]');
      if (body.children.length >= 20) return showError(form, 'Use no máximo 20 campos adicionais.');
      body.insertAdjacentHTML('beforeend', additionalRow({})); body.lastElementChild.querySelector('input')?.focus();
    }
    if (button.hasAttribute('data-equipment-additional-remove')) { button.closest('[data-equipment-additional-row]').remove(); form.querySelector('[data-equipment-additional-add]')?.focus(); }
  });

  document.addEventListener('submit', event => {
    if (!event.target.matches('[data-equipment-workspace-form]')) return;
    event.preventDefault(); if (!portal()) submit(event.target);
  });
  ['ancal-equipment-changed', 'ancal-equipment-workflow-changed', 'ancal-certificates-changed', 'ancal-orders-changed'].forEach(name => document.addEventListener(name, refresh));

  readWorkflow();
  window.ancalEquipmentWorkspace = { render: renderPage, renderPage, openForm, showDetail, history, getWorkItems, getHistory, setSector, getSectorsForOrder };
}());
