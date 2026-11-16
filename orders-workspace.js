(function () {
  'use strict';

  const h = value => escapeHtml(value);
  const clone = value => JSON.parse(JSON.stringify(value));
  const clean = value => String(value == null ? '' : value).trim();
  const fold = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const identity = () => window.ancalIdentity;
  const key = value => identity()?.key ? identity().key(value) : clean(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const validDocument = value => identity()?.validDocument ? identity().validDocument(value) : /^(?:\d{11}|[A-Z0-9]{12}\d{2})$/.test(key(value));
  const portal = () => typeof portalMode !== 'undefined' && portalMode;
  const source = () => typeof records !== 'undefined' && Array.isArray(records) ? records : [];
  const companies = () => window.ancalAccess?.getCompanies() || [];
  const sectors = [['laboratory', '01 Laboratório'], ['maintenance', '02 Manutenção'], ['packing', '03 Aguardando embalagem e conferência'], ['ready', '04 Pronto para coleta']];
  const enums = {
    service: ['Calibração', 'Manutenção', 'Qualificação térmica'], executionLocation: ['', 'laboratory', 'field'],
    priority: ['none', 'high', 'medium', 'low'], packaging: ['unknown', 'closed_box', 'open_box', 'special', 'none'],
    shippingType: ['unknown', 'carrier', 'customer_delivery', 'client_pickup', 'postal'], returnMethod: ['unknown', 'box', 'postal', 'special']
  };
  const fieldLabels = { none: 'Nenhuma', high: 'Alta', medium: 'Média', low: 'Baixa', unknown: 'Não informado', laboratory: 'Laboratório', field: 'Em campo', closed_box: 'Caixa fechada', open_box: 'Caixa aberta', special: 'Especial', carrier: 'Transportadora', customer_delivery: 'Entrega pelo cliente', client_pickup: 'Coleta no cliente', postal: 'Correios', box: 'Caixa' };
  const textLimits = { workplace: 120, invoiceNote: 2000, proposalNumber: 200, executionNotes: 5000, notes: 5000 };
  const state = { query: '', company: 'all', year: 'all', sector: 'all' };
  const sessions = new WeakMap();
  const sequenceKey = 'ancal-order-sequence-v1';
  const counters = {};
  const fail = error => ({ ok: false, error });

  function todayISO() { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date()); }
  function validDate(value) { const date = new Date(`${value}T12:00:00Z`); return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value; }
  function dateLabel(value) { return validDate(value) ? value.split('-').reverse().join('/') : clean(value) || 'Não informado'; }
  function dueLabel(value) { return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(new Date(`${value}T12:00:00Z`)); }
  function legacyDue(record) {
    if (validDate(record?.dueISO)) return record.dueISO;
    const value = fold(record?.due).replace(/\bde\b/g, '').replace(/[.,]/g, ' ').replace(/\s+/g, ' ');
    const match = value.match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/);
    if (!match) return '';
    const month = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'].indexOf(match[2].slice(0, 3)) + 1;
    const iso = `${match[3]}-${String(month).padStart(2, '0')}-${match[1].padStart(2, '0')}`;
    return validDate(iso) ? iso : '';
  }
  function displayCode(record) { return record.code || record.id; }
  function sectorLabel(sector) { return sector === 'finalized' ? 'Finalizada' : sectors.find(item => item[0] === sector)?.[1] || 'Não informado'; }
  function equipmentFor(record) { return window.ancalEquipment?.fromOrder(record) || (Array.isArray(record.equipments) ? clone(record.equipments) : []); }

  function selectedCompany() {
    const account = window.ancalAccess?.getPreviewAccount();
    if (!account || account.status !== 'active') return null;
    const selected = document.querySelector('#clientCompanySelect')?.value;
    return (window.ancalAccess?.getAllowedCompanies(account.id) || []).find(company => company.id === selected) || null;
  }
  function visibleOrders() {
    if (!portal()) return source();
    const company = selectedCompany();
    return company ? source().filter(order => key(order.cnpj) === key(company.cnpj || company.document)) : [];
  }
  function getAll() { return portal() ? [] : clone(source()); }
  function get(id) { const order = visibleOrders().find(item => item.id === id); return order ? clone(order) : null; }
  function original(id) { return source().find(order => order.id === id); }
  function isFinalized(record) {
    return !record || record.closed === true || record.isClosed === true || record.orderStage === 'finalized' || ['done', 'cancelled', 'canceled', 'closed', 'finished'].includes(fold(record.type)) || /concluid|cancelad|encerrad|finalizad/.test(fold(record.status));
  }
  function defaultSector(record) { return sectors.some(item => item[0] === record.orderStage) ? record.orderStage : /manutenc/.test(fold(record.service)) ? 'maintenance' : 'laboratory'; }
  function getSectors(id, cnpj) {
    const order = get(id);
    if (!order || (cnpj && key(cnpj) !== key(order.cnpj))) return [];
    if (isFinalized(order)) return ['finalized'];
    const assigned = window.ancalEquipmentWorkspace?.getSectorsForOrder?.(id, order.cnpj);
    return Array.isArray(assigned) && assigned.length ? [...new Set(assigned)] : [defaultSector(order)];
  }

  function loadCounters() {
    try {
      const saved = JSON.parse(localStorage.getItem(sequenceKey) || 'null');
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) Object.entries(saved).forEach(([year, number]) => { if (/^\d{4}$/.test(year) && Number.isSafeInteger(number) && number >= 0) counters[year] = number; });
    } catch (_) {}
  }
  function nextCode() {
    if (portal()) return null;
    const year = Number(todayISO().slice(0, 4));
    let highest = counters[year] || 0;
    const known = [...source(), ...(!portal() ? window.ancalCertificates?.getOrders() || [] : [])];
    known.forEach(order => {
      const id = clean(order.id).match(/^OS-(\d{4})-(\d+)$/i);
      const code = clean(order.code).match(/^(\d+)\/(\d{4})$/);
      if (id && Number(id[1]) === year && Number.isSafeInteger(Number(id[2]))) highest = Math.max(highest, Number(id[2]));
      if (code && Number(code[2]) === year && Number.isSafeInteger(Number(code[1]))) highest = Math.max(highest, Number(code[1]));
    });
    const number = highest + 1;
    const sequence = String(number).padStart(6, '0');
    return { id: `OS-${year}-${sequence}`, code: `${sequence}/${year}`, year, number };
  }

  function companyFor(values, existing) {
    const requested = values.companyId || values.cnpj || values.client;
    if (existing) return companies().find(company => key(company.cnpj || company.document) === key(existing.cnpj)) || existing.customerSnapshot || { name: existing.client, cnpj: existing.cnpj, contacts: [] };
    return companies().find(company => company.id === requested || key(company.cnpj || company.document) === key(requested));
  }
  function selectedEquipment(values, company, existing) {
    const retained = existing ? equipmentFor(existing) : [];
    const requested = Object.hasOwn(values, 'equipmentIds') ? values.equipmentIds : retained.map(item => item.id);
    if (!Array.isArray(requested)) return fail('Selecione os equipamentos cadastrados para a OS.');
    const ids = [...new Set(requested.map(clean))];
    if (!ids.length) return fail('Selecione pelo menos um equipamento.');
    if (retained.some(item => !ids.includes(item.id))) return fail('Os instrumentos já vinculados à OS devem ser preservados. Você pode adicionar outros equipamentos.');
    const available = (window.ancalEquipment?.forCompany(company.cnpj || company.document) || []).filter(item => item.active !== false && !item.incomplete);
    const selected = ids.map(id => retained.find(item => item.id === id) || available.find(item => item.id === id));
    if (selected.some(item => !item || key(item.cnpj) !== key(company.cnpj || company.document))) return fail('Selecione somente equipamentos ativos e cadastrados para a empresa da OS.');
    return { ok: true, equipments: clone(selected) };
  }

  function prepare(values, existing) {
    if (!values || typeof values !== 'object' || Array.isArray(values)) return fail('Informe os dados da ordem de serviço.');
    const company = companyFor(values, existing);
    if (!company || !validDocument(company.cnpj || company.document)) return fail('Selecione um cliente cadastrado.');
    if (existing) {
      if ((Object.hasOwn(values, 'id') && values.id !== existing.id) || (Object.hasOwn(values, 'cnpj') && key(values.cnpj) !== key(existing.cnpj)) || (Object.hasOwn(values, 'companyId') && company.id && values.companyId !== company.id)) return fail('O número e a empresa da OS não podem ser alterados.');
    }
    const permitted = ['companyId', 'cnpj', 'client', 'id', 'equipmentIds', ...Object.keys(enums), ...Object.keys(textLimits), 'receivedISO', 'dueISO', 'hasInvoice', 'contactId', 'certificateCustomerId'];
    if (Object.keys(values).some(field => !permitted.includes(field))) return fail('A OS contém um campo que não pode ser alterado por este cadastro.');
    const equipment = selectedEquipment(values, company, existing);
    if (!equipment.ok) return equipment;
    const result = existing ? clone(existing) : {};
    const defaults = { service: 'Calibração', executionLocation: '', priority: 'none', packaging: 'unknown', shippingType: 'unknown', returnMethod: 'unknown' };
    for (const [field, allowed] of Object.entries(enums)) {
      const value = Object.hasOwn(values, field) ? clean(values[field]) : existing?.[field] ?? defaults[field];
      if (!allowed.includes(value)) return fail(`Selecione uma opção válida para ${field === 'service' ? 'o serviço' : 'os dados de atendimento'}.`);
      result[field] = value;
    }
    for (const [field, limit] of Object.entries(textLimits)) {
      const value = Object.hasOwn(values, field) ? clean(values[field]) : clean(existing?.[field]);
      if (value.length > limit || (field === 'workplace' && !value)) return fail(field === 'workplace' ? 'Informe o local de trabalho com até 120 caracteres.' : `O campo ${field} excedeu o limite de ${limit} caracteres.`);
      result[field] = value;
    }
    const received = Object.hasOwn(values, 'receivedISO') ? clean(values.receivedISO) : existing ? clean(existing.receivedISO) : todayISO();
    const due = Object.hasOwn(values, 'dueISO') ? clean(values.dueISO) : existing ? legacyDue(existing) : '';
    if (!validDate(due) || (received && !validDate(received)) || (!existing && !validDate(received))) return fail('Informe datas reais de recebimento e entrega prevista.');
    if (received && received > due) return fail('A entrega prevista não pode anteceder o recebimento.');
    if (received || !existing || Object.hasOwn(values, 'receivedISO')) result.receivedISO = received;
    result.dueISO = due; result.due = dueLabel(due);
    if (Object.hasOwn(values, 'hasInvoice') && typeof values.hasInvoice !== 'boolean') return fail('Informe se a OS possui nota fiscal.');
    result.hasInvoice = Object.hasOwn(values, 'hasInvoice') ? values.hasInvoice : existing?.hasInvoice === true;
    const contactId = Object.hasOwn(values, 'contactId') ? clean(values.contactId) : clean(existing?.contactId);
    const contact = (company.contacts || []).find(item => item.id === contactId);
    if (contactId && !contact && contactId !== existing?.contactId) return fail('Selecione um contato vinculado ao cliente desta OS.');
    result.contactId = contactId;
    result.contactSnapshot = contactId ? existing?.contactId === contactId && existing.contactSnapshot ? clone(existing.contactSnapshot) : contact ? clone(contact) : clone(existing?.contactSnapshot || null) : null;
    const certificateCustomerId = Object.hasOwn(values, 'certificateCustomerId') ? clean(values.certificateCustomerId) || 'same' : existing?.certificateCustomerId || 'same';
    const finalCustomer = certificateCustomerId === 'same' ? company : companies().find(item => item.id === certificateCustomerId);
    if (!finalCustomer && certificateCustomerId !== existing?.certificateCustomerId) return fail('Selecione um cliente final cadastrado para os certificados.');
    result.certificateCustomerId = certificateCustomerId;
    result.certificateCustomerSnapshot = existing?.certificateCustomerId === certificateCustomerId && existing.certificateCustomerSnapshot ? clone(existing.certificateCustomerSnapshot) : finalCustomer ? clone(finalCustomer) : clone(existing?.certificateCustomerSnapshot || null);
    result.customerSnapshot = existing?.customerSnapshot ? clone(existing.customerSnapshot) : clone(company);
    result.cnpj = existing?.cnpj || company.cnpj || company.document; result.client = existing?.client || company.name;
    result.equipments = equipment.equipments;
    result.equipment = result.equipments.map(item => item.name).join(' · '); result.tag = result.equipments.map(item => item.tag).join(' · '); result.serial = result.equipments.map(item => item.serial || '').join(' · ');
    return { ok: true, order: result };
  }

  function persist(order) {
    if (typeof saveDemo === 'function') saveDemo();
    window.ancalCertificates?.registerOrders?.([clone(order)]);
    document.dispatchEvent(new CustomEvent('ancal-orders-changed', { detail: { orderId: order.id } }));
  }
  function applyStage(order, stage) {
    const status = { laboratory: ['progress', 'Em calibração'], maintenance: ['progress', 'Em manutenção'], packing: ['review', 'Aguardando embalagem e conferência'], ready: ['wait', 'Pronto para coleta'] }[stage];
    Object.assign(order, { orderStage: stage, type: status[0], status: status[1] });
  }
  function create(values) {
    if (portal()) return fail('A criação de OS é restrita ao laboratório.');
    const prepared = prepare(values, null);
    if (!prepared.ok) return prepared;
    const code = nextCode();
    if (!Number.isSafeInteger(code.number)) return fail('A sequência anual atingiu o limite suportado.');
    const customerId = prepared.order.customerSnapshot?.id;
    const portalAccessSnapshot = (window.ancalAccess?.getAccounts?.() || []).some(account => account.status === 'active' && Array.isArray(account.companyIds) && account.companyIds.includes(customerId));
    const order = { ...prepared.order, id: code.id, code: code.code, createdBy: 'Isabela Jurado', createdAt: new Date().toISOString(), tech: 'Isabela Jurado', portalAccessSnapshot };
    applyStage(order, order.service === 'Manutenção' ? 'maintenance' : 'laboratory');
    source().unshift(order);
    counters[code.year] = code.number;
    try { localStorage.setItem(sequenceKey, JSON.stringify(counters)); } catch (_) {}
    persist(order); return { ok: true, order: clone(order) };
  }
  function update(id, patch) {
    if (portal()) return fail('A edição de OS é restrita ao laboratório.');
    const order = original(id);
    if (!order) return fail('Ordem de serviço não encontrada.');
    if (isFinalized(order)) return fail('Esta OS está encerrada e permanece disponível somente para consulta.');
    const prepared = prepare(patch, order);
    if (!prepared.ok) return prepared;
    Object.assign(order, prepared.order); persist(order); return { ok: true, order: clone(order) };
  }
  function setSector(id, sector) {
    if (portal()) return fail('O fluxo da OS é restrito ao laboratório.');
    const order = original(id);
    if (!order || isFinalized(order)) return fail('A OS foi encerrada ou não está disponível para movimentação.');
    if (!sectors.some(item => item[0] === sector)) return fail('Selecione um dos quatro setores operacionais.');
    const items = window.ancalEquipmentWorkspace?.getWorkItems()?.filter(item => item.orderId === id && key(item.cnpj) === key(order.cnpj)) || [];
    if (!items.length || !window.ancalEquipmentWorkspace?.setSector) return fail('Os instrumentos desta OS não estão disponíveis no fluxo operacional.');
    for (const item of items) {
      const moved = window.ancalEquipmentWorkspace.setSector(id, item.equipmentId, sector, order.cnpj);
      if (!moved.ok) return fail(moved.error);
    }
    applyStage(order, sector); persist(order); return { ok: true, order: clone(order) };
  }
  function finalize(id, details) {
    if (portal()) return fail('A finalização é restrita ao laboratório.');
    const order = original(id);
    if (!order || isFinalized(order)) return fail('Esta OS já foi encerrada ou não está disponível.');
    const current = getSectors(id, order.cnpj);
    if (!current.length || current.some(sector => sector !== 'ready')) return fail('Todos os instrumentos devem estar em Pronto para coleta antes da finalização.');
    if (!details || !['pickup', 'delivery'].includes(details.returnMode)) return fail('Informe se a OS foi retirada ou entregue.');
    const returnedISO = clean(details.returnedISO), technicalResponsible = clean(details.technicalResponsible), returnObservations = clean(details.returnObservations);
    if (!validDate(returnedISO) || returnedISO > todayISO() || (validDate(order.receivedISO) && returnedISO < order.receivedISO)) return fail('Informe uma data de devolução real, entre o recebimento e hoje.');
    if (!technicalResponsible || technicalResponsible.length > 160 || returnObservations.length > 5000) return fail('Informe o responsável técnico com até 160 caracteres e revise as observações.');
    Object.assign(order, { orderStage: 'finalized', status: 'Finalizada', type: 'done', finalizedAt: new Date().toISOString(), finalization: { returnMode: details.returnMode, returnedISO, returnObservations, technicalResponsible } });
    persist(order); return { ok: true, order: clone(order) };
  }

  /* The following views use the same guarded methods as the operational actions. */
  function action(label, name, id = '', primary = false) { return `<button type="button" class="btn${primary ? ' btn-primary' : ''}" data-orders-action="${name}"${id ? ` data-orders-id="${h(id)}"` : ''}>${label}</button>`; }
  function filteredOrders() {
    const query = fold(state.query), queryKey = key(state.query);
    return getAll().filter(order => {
      if (state.company !== 'all' && key(order.cnpj) !== key(state.company)) return false;
      const year = clean(order.code).match(/\/(\d{4})$/)?.[1] || clean(order.id).match(/^OS-(\d{4})-/)?.[1] || clean(order.receivedISO).slice(0, 4);
      if (state.year !== 'all' && year !== state.year) return false;
      if (state.sector !== 'all' && !getSectors(order.id, order.cnpj).includes(state.sector)) return false;
      const searchable = fold([order.id, order.code, order.client, order.cnpj, order.equipment, order.tag, order.serial, order.proposalNumber, order.invoiceNote, order.workplace, order.notes].join(' '));
      return !query || searchable.includes(query) || (queryKey.length >= 5 && key(order.cnpj).includes(queryKey));
    });
  }
  function tableRows(items) {
    return items.map(order => {
      const closed = isFinalized(order), assigned = getSectors(order.id, order.cnpj), equipment = equipmentFor(order);
      const workplace = typeof orderWorkplaceCell === 'function' ? orderWorkplaceCell(order) : `<td>${h(order.workplace || 'Não informado')}</td>`;
      const due = typeof orderDeadlineCell === 'function' ? orderDeadlineCell(order) : `<td class="orders-workspace-date">${h(dateLabel(order.dueISO || order.due))}</td>`;
      return `<tr><td><strong>${h(displayCode(order))}</strong><span class="orders-workspace-sub">${h(order.id)}</span></td><td class="orders-workspace-company"><strong>${h(order.client)}</strong><span class="orders-workspace-sub">${h(order.cnpj)}</span></td><td>${h(order.createdBy || order.tech || 'Não informado')}</td><td>${order.hasInvoice === true ? 'Sim' : order.hasInvoice === false ? 'Não' : 'Não informado'}${order.invoiceNote ? `<span class="orders-workspace-sub">${h(order.invoiceNote)}</span>` : ''}</td><td>${assigned.map(sector => `<span class="orders-workspace-pill${closed ? ' is-completed' : sector === 'maintenance' ? ' is-maintenance' : ''}">${h(sectorLabel(sector))}</span>`).join(' ')}</td><td class="orders-workspace-date">${h(dateLabel(order.receivedISO))}</td>${due}<td class="orders-workspace-equipment"><strong>${equipment.length} ${equipment.length === 1 ? 'instrumento' : 'instrumentos'}</strong><span class="orders-workspace-sub">${h(equipment.map(item => item.tag).join(' · '))}</span></td>${workplace}<td><div class="orders-workspace-actions">${action('Ver OS', 'open', order.id)}${!closed ? action('Editar', 'edit', order.id) : ''}${action('Ficha', 'sheet', order.id)}</div></td></tr>`;
    }).join('');
  }
  function refresh() {
    const root = document.querySelector('[data-orders-workspace]');
    if (!root || portal()) return;
    const items = filteredOrders();
    root.querySelector('[data-orders-rows]').innerHTML = tableRows(items);
    root.querySelector('[data-orders-count]').textContent = `${items.length} de ${getAll().length} ordens de serviço`;
    root.querySelector('[data-orders-empty]').hidden = Boolean(items.length);
    root.querySelectorAll('[data-orders-filter]').forEach(control => { if (control.value !== state[control.dataset.ordersFilter]) control.value = state[control.dataset.ordersFilter]; });
  }
  function render() {
    if (portal()) return '';
    const items = filteredOrders(), years = new Set([todayISO().slice(0, 4)]);
    getAll().forEach(order => { const year = clean(order.code).match(/\/(\d{4})$/)?.[1] || clean(order.id).match(/^OS-(\d{4})-/)?.[1]; if (year) years.add(year); });
    return `${heading('Ordens de serviço', 'Acompanhe o recebimento, os instrumentos e cada etapa da operação.', action('＋ Nova OS', 'new', '', true))}<div class="orders-workspace" data-orders-workspace><section class="panel table-panel"><div class="orders-workspace-panel-heading"><div><h2>Ordens de serviço</h2><p>Setores dos instrumentos, prazos e informações de atendimento.</p></div></div><div class="orders-workspace-filters"><label class="orders-workspace-filter is-search"><span>Buscar OS</span><input type="search" data-orders-filter="query" value="${h(state.query)}" placeholder="Número, cliente, documento, instrumento ou NF" aria-label="Buscar ordens de serviço"></label><label class="orders-workspace-filter"><span>Cliente</span><select data-orders-filter="company"><option value="all">Todos os clientes</option>${companies().map(company => `<option value="${h(company.cnpj || company.document)}"${key(company.cnpj || company.document) === key(state.company) ? ' selected' : ''}>${h(company.name)}</option>`).join('')}</select></label><label class="orders-workspace-filter"><span>Ano</span><select data-orders-filter="year"><option value="all">Todos os anos</option>${Array.from(years).sort().reverse().map(year => `<option value="${year}"${state.year === year ? ' selected' : ''}>${year}</option>`).join('')}</select></label><label class="orders-workspace-filter"><span>Setor / situação</span><select data-orders-filter="sector"><option value="all">Todos</option>${[...sectors, ['finalized', 'Finalizadas']].map(([value, label]) => `<option value="${value}"${state.sector === value ? ' selected' : ''}>${h(label)}</option>`).join('')}</select></label></div><div class="orders-workspace-result"><span data-orders-count role="status" aria-live="polite">${items.length} de ${getAll().length} ordens de serviço</span><button type="button" class="orders-workspace-text" data-orders-action="reset">Limpar filtros</button></div><div class="table-scroll" tabindex="0" role="region" aria-label="Ordens de serviço, com rolagem horizontal"><table class="orders-workspace-table"><thead><tr><th>CÓDIGO</th><th>CLIENTE</th><th>CRIADO POR</th><th>NOTA FISCAL</th><th>SETORES</th><th>RECEBIMENTO</th><th>ENTREGA PREVISTA</th><th>INSTRUMENTOS</th><th>LOCAL DE TRABALHO</th><th>AÇÕES</th></tr></thead><tbody data-orders-rows>${tableRows(items)}</tbody></table></div><div class="orders-workspace-empty" data-orders-empty${items.length ? ' hidden' : ''}><strong>Nenhuma ordem neste filtro</strong><p>Altere a busca, o cliente, o ano ou o setor selecionado.</p></div></section><p class="orders-workspace-note">Finalizar uma OS encerra seu fluxo operacional. A liberação de certificados depende da assinatura de cada documento.</p></div>`;
  }

  // Form and detail helpers are declared below to keep all snapshots in this module.
  function field(id, name, label, value, options = {}) {
    const attrs = `id="${id}" name="${name}"${options.required ? ' required' : ''}${options.disabled ? ' disabled' : ''}`;
    const control = options.area ? `<textarea ${attrs} rows="${options.rows || 4}" maxlength="${options.maxlength || 5000}">${h(value || '')}</textarea>` : `<input ${attrs} type="${options.type || 'text'}" value="${h(value || '')}" maxlength="${options.maxlength || 200}">`;
    return `<div class="orders-workspace-field${options.full ? ' is-full' : ''}"><label for="${id}">${h(label)}</label>${control}${options.help ? `<small>${h(options.help)}</small>` : ''}</div>`;
  }
  function selectField(id, name, label, value, options, full = false) { return `<div class="orders-workspace-field${full ? ' is-full' : ''}"><label for="${id}">${h(label)}</label><select id="${id}" name="${name}">${options.map(([key, caption]) => `<option value="${h(key)}"${key === value ? ' selected' : ''}>${h(caption)}</option>`).join('')}</select></div>`; }
  function enumField(name, label, value) { return selectField(`os-${name}`, name, label, value, enums[name].map(option => [option, option === '' ? 'Não informado' : name === 'service' ? option : fieldLabels[option] || option])); }
  function section(title, content, opened = false) { return `<details class="orders-workspace-form-section"${opened ? ' open' : ''}><summary>${h(title)}</summary><div class="orders-workspace-form-section-body">${content}</div></details>`; }
  function optionsForCompany(company, retained) {
    const available = (window.ancalEquipment?.forCompany(company?.cnpj || company?.document) || []).filter(item => item.active !== false && !item.incomplete);
    const union = new Map(retained.map(item => [item.id, item])); available.forEach(item => { if (!union.has(item.id)) union.set(item.id, item); });
    return Array.from(union.values()).map(item => `<option value="${h(item.id)}"${retained.some(existing => existing.id === item.id) ? ' selected' : ''}>${h(item.name)} · ${h(item.tag)}${item.serial ? ` · ${h(item.serial)}` : ''}${retained.some(existing => existing.id === item.id) ? ' — já vinculado' : ''}</option>`).join('');
  }
  function openForm(id) {
    if (portal()) return;
    const existing = id ? get(id) : null;
    if (id && (!existing || isFinalized(existing))) return existing ? open(id) : showToast('OS não encontrada.');
    const company = existing ? companyFor({}, existing) : null, retained = existing ? equipmentFor(existing) : [];
    const preview = nextCode();
    const draft = existing || { service: 'Calibração', receivedISO: todayISO(), dueISO: todayISO(), executionLocation: '', priority: 'none', packaging: 'unknown', shippingType: 'unknown', returnMethod: 'unknown', certificateCustomerId: 'same' };
    const knownContacts = [...(company?.contacts || [])];
    if (existing?.contactId && existing.contactSnapshot && !knownContacts.some(contact => contact.id === existing.contactId)) knownContacts.push({ ...existing.contactSnapshot, id: existing.contactId });
    const basic = `<div class="orders-workspace-grid"><div class="orders-workspace-field is-full"><label for="osClient">Cliente / empresa</label><select id="osClient" name="companyId" required${existing ? ' disabled' : ''}><option value="">Selecione um cliente</option>${companies().map(item => `<option value="${h(item.id)}"${company?.id === item.id ? ' selected' : ''}>${h(item.name)} · ${h(item.cnpj || item.document)}</option>`).join('')}</select>${existing ? '<small>A empresa desta OS é preservada.</small>' : ''}</div><div class="orders-workspace-field is-full"><div class="orders-workspace-equipment-label"><label for="osEquipment">Equipamentos da ordem</label><output id="osEquipmentCount" class="orders-workspace-count" aria-live="polite">${retained.length} selecionados</output></div><select id="osEquipment" name="equipmentIds" multiple size="5" required${company ? '' : ' disabled'}>${company ? optionsForCompany(company, retained) : '<option disabled>Selecione um cliente primeiro</option>'}</select><small>Selecione um ou mais instrumentos. Use Ctrl ou ⌘ para selecionar vários. Os equipamentos já vinculados são preservados.</small><div id="osEquipmentState" class="orders-workspace-selected" aria-live="polite"></div></div>${enumField('service', 'Serviço', draft.service)}${field('osReceived', 'receivedISO', 'Recebimento', draft.receivedISO, { type: 'date', required: !existing || Boolean(existing.receivedISO), help: existing && !existing.receivedISO ? 'Data não cadastrada na OS antiga; informe somente se conhecida.' : '' })}${field('osDue', 'dueISO', 'Entrega prevista', draft.dueISO || legacyDue(draft), { type: 'date', required: true })}${field('osWorkplace', 'workplace', 'Local de trabalho', draft.workplace, { required: true, maxlength: 120, help: 'Também pode ser editado diretamente na coluna da listagem.' })}${enumField('executionLocation', 'Local de execução', draft.executionLocation || '')}${enumField('priority', 'Prioridade', draft.priority || 'none')}</div>`;
    const contacts = `<div class="orders-workspace-grid">${selectField('osContact', 'contactId', 'Contato do cliente', draft.contactId || '', [['', 'Não informado'], ...knownContacts.map(contact => [contact.id, `${contact.name}${contact.role ? ` · ${contact.role}` : ''}`])], true)}${selectField('osCertificateCustomer', 'certificateCustomerId', 'Cliente final nos certificados', draft.certificateCustomerId || 'same', [['same', 'O próprio cliente / solicitante da OS'], ...companies().map(item => [item.id, `${item.name} · ${item.cnpj || item.document}`])], true)}${field('osProposal', 'proposalNumber', 'Número da proposta', draft.proposalNumber)}<div class="orders-workspace-field"><label class="orders-workspace-check"><input type="checkbox" name="hasInvoice" id="osHasInvoice"${draft.hasInvoice ? ' checked' : ''}><span>Possui nota fiscal</span></label></div>${field('osInvoiceNote', 'invoiceNote', 'Nota fiscal / informações da NF', draft.invoiceNote, { full: true, area: true, rows: 2, maxlength: 2000 })}</div><p class="orders-workspace-note">A indicação de um cliente final no certificado não concede acesso ao portal nem altera o dono desta OS.</p>`;
    const logistics = `<div class="orders-workspace-grid">${enumField('packaging', 'Embalagem recebida', draft.packaging || 'unknown')}${enumField('shippingType', 'Forma de envio / recebimento', draft.shippingType || 'unknown')}${enumField('returnMethod', 'Embalagem / meio de devolução', draft.returnMethod || 'unknown')}${field('osExecutionNotes', 'executionNotes', 'Observações de execução', draft.executionNotes, { area: true, full: true })}${field('osNotes', 'notes', 'Observações da OS', draft.notes, { area: true, full: true })}</div>`;
    openModal(existing ? `Editar OS ${displayCode(existing)}` : `Nova OS · ${preview.code}`, existing ? 'Edite os dados operacionais sem alterar a empresa ou os instrumentos já vinculados.' : 'O número anual será confirmado ao salvar a ordem de serviço.', `<form id="newOsForm" novalidate data-orders-workspace-form data-orders-edit-id="${h(existing?.id || '')}">${section('Dados gerais e instrumentos', basic, true)}${section('Contato, certificado e nota fiscal', contacts)}${section('Recebimento, devolução e observações', logistics)}<p id="osFormError" class="orders-workspace-error" role="alert" tabindex="-1" hidden></p><div class="modal-actions">${action('Cancelar', 'close')}<button type="submit" class="btn btn-primary" id="osSubmit">${existing ? 'Salvar OS' : 'Criar ordem'}</button></div></form>`);
    const form = document.getElementById('newOsForm'); sessions.set(form, { id: existing?.id || '', companyId: company?.id || '', retained: retained.map(item => item.id) }); updateSelection(form);
  }

  function definitionList(values) { return `<dl class="orders-workspace-detail">${values.map(([label, value, full]) => `<div${full ? ' class="is-full"' : ''}><dt>${h(label)}</dt><dd>${h(value || 'Não informado')}</dd></div>`).join('')}</dl>`; }
  function open(id) {
    const order = get(id); if (!order) return showToast('OS indisponível para este acesso.');
    const closed = isFinalized(order), assigned = getSectors(id, order.cnpj), equipment = equipmentFor(order), final = order.finalization;
    const flow = `<div class="orders-workspace-lifecycle">${[...sectors, ['finalized', 'Finalizada']].map(([sector, caption]) => `<div class="orders-workspace-stage${assigned.includes(sector) ? ' is-active' : ''}${closed ? ' is-completed' : ''}"><strong>${h(caption)}</strong>${sector === 'finalized' ? 'Consulta após encerramento' : 'Setor operacional'}</div>`).join('')}</div>`;
    const move = !portal() && !closed ? `<div class="orders-workspace-lifecycle-actions"><label for="ordersDetailSector">Mover todos os instrumentos para</label><select id="ordersDetailSector" class="orders-workspace-sector-select" data-orders-sector="${h(id)}"><option value="">Selecione um setor</option>${sectors.map(([sector, caption]) => `<option value="${sector}">${h(caption)}</option>`).join('')}</select>${assigned.length && assigned.every(sector => sector === 'ready') ? action('Finalizar OS', 'finalize', id, true) : ''}</div>` : '';
    const finalData = final ? `<h3>Dados da finalização</h3>${definitionList([['Devolução', final.returnMode === 'pickup' ? 'Retirada' : 'Entregue'], ['Data da devolução', dateLabel(final.returnedISO)], ['Responsável técnico', final.technicalResponsible], ['Observações da devolução', final.returnObservations, true]])}` : '';
    openModal(`OS ${displayCode(order)}`, `${order.client} · ${order.cnpj}`, `<div data-orders-workspace-detail>${closed ? '<div class="orders-workspace-readonly-note">OS encerrada. Os dados permanecem disponíveis somente para consulta.</div>' : ''}${flow}${move}${definitionList([['Cliente', order.client], ['Documento', order.cnpj], ['Criada por', order.createdBy || order.tech], ['Serviço', order.service], ['Recebimento', dateLabel(order.receivedISO)], ['Entrega prevista', dateLabel(order.dueISO || order.due)], ['Local de trabalho', order.workplace], ['Local de execução', fieldLabels[order.executionLocation] || 'Não informado'], ['Prioridade', fieldLabels[order.priority] || 'Não informada'], ['Proposta', order.proposalNumber], ['Contato', order.contactSnapshot?.name], ['Cliente final nos certificados', order.certificateCustomerSnapshot?.name], ['Nota fiscal', order.hasInvoice === true ? 'Sim' : order.hasInvoice === false ? 'Não' : 'Não informado'], ['Informações da NF', order.invoiceNote], ['Embalagem', fieldLabels[order.packaging] || 'Não informada'], ['Forma de envio', fieldLabels[order.shippingType] || 'Não informada'], ['Meio de devolução', fieldLabels[order.returnMethod] || 'Não informado'], ['Observações de execução', order.executionNotes, true], ['Observações', order.notes, true]])}<div class="table-scroll"><table class="orders-workspace-detail-table"><thead><tr><th>INSTRUMENTO</th><th>IDENTIFICAÇÃO</th><th>FABRICANTE / MODELO</th><th>SÉRIE</th></tr></thead><tbody>${equipment.map(item => `<tr><td>${h(item.name)}</td><td>${h(item.tag)}</td><td>${h([item.manufacturer, item.model].filter(Boolean).join(' · ') || 'Não informado')}</td><td>${h(item.serial || 'Não informado')}</td></tr>`).join('')}</tbody></table></div>${finalData}<p class="orders-workspace-note">O encerramento da OS não substitui a assinatura dos certificados.</p><div class="modal-actions">${!portal() && !closed ? action('Editar OS', 'edit', id) : ''}${!portal() ? action('Ficha de acompanhamento', 'sheet', id) : ''}${action('Fechar', 'close')}</div></div>`);
  }

  function finalizeForm(id) {
    const order = get(id); if (!order || portal() || isFinalized(order)) return;
    if (getSectors(id, order.cnpj).some(sector => sector !== 'ready')) return showToast('Todos os instrumentos devem estar prontos para coleta.');
    openModal(`Finalizar OS ${displayCode(order)}`, 'Confirme a retirada ou entrega dos instrumentos e o responsável técnico.', `<form novalidate data-orders-workspace-finalize="${h(id)}"><div class="orders-workspace-warning"><strong>Finalização irreversível neste protótipo.</strong> Após finalizar, esta OS e seus dados operacionais ficarão disponíveis somente para consulta.</div><div class="orders-workspace-grid">${selectField('osReturnMode', 'returnMode', 'Forma de devolução', 'pickup', [['pickup', 'Retirada'], ['delivery', 'Entregue']])}${field('osReturned', 'returnedISO', 'Data da devolução', todayISO(), { type: 'date', required: true })}${field('osTechnicalResponsible', 'technicalResponsible', 'Responsável técnico', '', { required: true, maxlength: 160, full: true })}${field('osReturnObservations', 'returnObservations', 'Observações da devolução', '', { area: true, full: true })}</div><label class="orders-workspace-check"><input type="checkbox" name="confirmFinalization" required><span>Confirmo a finalização e a preservação desta OS somente para consulta.</span></label><p class="orders-workspace-error" role="alert" tabindex="-1" hidden></p><div class="modal-actions">${action('Voltar', 'open', id)}<button class="btn btn-primary" type="submit">Confirmar finalização</button></div></form>`);
  }
  function formError(form, message) { const element = form.querySelector('.orders-workspace-error'); element.textContent = message; element.hidden = false; element.focus(); }
  function updateSelection(form) {
    const selected = Array.from(form.querySelector('#osEquipment').selectedOptions || []).filter(option => !option.disabled);
    form.querySelector('#osEquipmentCount').textContent = `${selected.length} selecionados`;
    form.querySelector('#osEquipmentState').innerHTML = selected.map(option => `<span>${h(option.textContent)}</span>`).join('');
  }
  function changeCompany(form) {
    const session = sessions.get(form); if (!session || session.id) return;
    const company = companies().find(item => item.id === form.elements.companyId.value);
    const equipment = form.querySelector('#osEquipment'); equipment.innerHTML = company ? optionsForCompany(company, []) : '<option disabled>Selecione um cliente primeiro</option>'; equipment.disabled = !company;
    const contact = form.querySelector('#osContact'); contact.innerHTML = `<option value="">Não informado</option>${(company?.contacts || []).map(item => `<option value="${h(item.id)}">${h(item.name)}${item.role ? ` · ${h(item.role)}` : ''}</option>`).join('')}`;
    session.companyId = company?.id || ''; updateSelection(form);
  }
  function submitForm(form) {
    if (portal()) return;
    const session = sessions.get(form);
    if (!session || session.id !== form.dataset.ordersEditId) return formError(form, 'Abra novamente o cadastro desta OS.');
    if (!form.checkValidity()) { const invalid = form.querySelector(':invalid'); invalid?.closest('details')?.setAttribute('open', ''); form.reportValidity(); return; }
    const value = name => form.elements[name]?.value || '';
    const values = { equipmentIds: Array.from(form.querySelector('#osEquipment').selectedOptions).map(option => option.value), hasInvoice: form.elements.hasInvoice.checked };
    if (!session.id) values.companyId = value('companyId');
    [...Object.keys(enums), ...Object.keys(textLimits), 'receivedISO', 'dueISO', 'contactId', 'certificateCustomerId'].forEach(name => { values[name] = value(name); });
    const result = session.id ? update(session.id, values) : create(values);
    if (!result.ok) return formError(form, result.error);
    closeModal(); refresh(); showToast(session.id ? 'Dados da OS atualizados.' : `OS ${displayCode(result.order)} criada.`);
  }

  document.addEventListener('input', event => { if (!portal() && event.target.matches('[data-orders-filter="query"]')) { state.query = event.target.value; refresh(); } });
  document.addEventListener('change', event => {
    if (portal()) return;
    const control = event.target;
    if (control.matches('[data-orders-filter]')) { state[control.dataset.ordersFilter] = control.value; refresh(); }
    const form = control.closest('[data-orders-workspace-form]');
    if (form && control.id === 'osClient') changeCompany(form);
    if (form && control.id === 'osEquipment') {
      const session = sessions.get(form);
      let restored = false;
      Array.from(control.options).forEach(option => { if (session?.retained.includes(option.value) && !option.selected) { option.selected = true; restored = true; } });
      if (restored) showToast('Os equipamentos já vinculados à OS são preservados.');
      updateSelection(form);
    }
    if (control.matches('[data-orders-sector]')) { const result = setSector(control.dataset.ordersSector, control.value); if (!result.ok) showToast(result.error); else open(result.order.id); }
  });
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-orders-action]'); if (!button) return;
    event.preventDefault(); const actionName = button.dataset.ordersAction, id = button.dataset.ordersId;
    if (actionName === 'close') return closeModal();
    if (actionName === 'open') return open(id);
    if (portal()) return;
    if (actionName === 'new') return openForm();
    if (actionName === 'edit') return openForm(id);
    if (actionName === 'finalize') return finalizeForm(id);
    if (actionName === 'sheet') return window.ancalOrderSheet?.download(id);
    if (actionName === 'reset') { Object.assign(state, { query: '', company: 'all', year: 'all', sector: 'all' }); refresh(); }
  });
  document.addEventListener('submit', event => {
    const form = event.target;
    if (form.matches('[data-orders-workspace-form]')) { event.preventDefault(); submitForm(form); }
    if (form.matches('[data-orders-workspace-finalize]')) {
      event.preventDefault(); if (portal()) return;
      if (!form.checkValidity()) return form.reportValidity();
      const result = finalize(form.dataset.ordersWorkspaceFinalize, { returnMode: form.elements.returnMode.value, returnedISO: form.elements.returnedISO.value, returnObservations: form.elements.returnObservations.value, technicalResponsible: form.elements.technicalResponsible.value });
      if (!result.ok) return formError(form, result.error);
      closeModal(); refresh(); open(result.order.id); showToast('OS finalizada. Dados preservados para consulta.');
    }
  });
  ['ancal-orders-changed', 'ancal-equipment-workflow-changed'].forEach(name => document.addEventListener(name, refresh));
  loadCounters();
  window.ancalOrders = { render, open, openForm, get, getAll, create, update, setSector, finalize, nextCode, getSectors, isFinalized };
}());
