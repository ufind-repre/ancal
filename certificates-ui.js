(function () {
  'use strict';

  const statuses = { all: 'Todos', awaiting_signature: 'Aguardando assinatura', signed: 'Assinados', cancelled: 'Cancelados' };
  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const adminState = { status: 'awaiting_signature', month: 'all', year: 'all', query: '', collapsed: new Set() };
  const portalStates = new Map();
  const html = value => escapeHtml(value);
  const store = () => window.ancalCertificates;
  const isPortal = () => typeof portalMode !== 'undefined' && portalMode;
  const digits = value => window.ancalIdentity ? window.ancalIdentity.key(value) : String(value || '').replace(/\D/g, '');
  const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const plural = (number, singular, multiple) => `${number} ${number === 1 ? singular : multiple}`;

  function currentPeriod() {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
    return { month: String(Number(parts.find(part => part.type === 'month').value)), year: parts.find(part => part.type === 'year').value };
  }

  function stateFor(scope, cnpj) {
    if (scope !== 'portal') return adminState;
    const key = digits(cnpj);
    if (!portalStates.has(key)) portalStates.set(key, { status: 'signed', month: 'all', year: 'all', query: '', collapsed: new Set() });
    return portalStates.get(key);
  }

  function sourceFor(scope, cnpj) {
    if (!store()) return [];
    return scope === 'portal' ? store().forCompany(cnpj) : isPortal() ? [] : store().getAll();
  }

  function dateLabel(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return 'Data a informar';
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }

  function signedAtLabel(value) {
    if (!value || Number.isNaN(new Date(value).getTime())) return 'Data não informada';
    return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  }

  function statusPill(certificate) {
    const label = certificate.status === 'signed' ? 'Assinado' : statuses[certificate.status] || 'Aguardando assinatura';
    return `<span class="certificate-status certificate-status-${html(certificate.status)}">${html(label)}</span>`;
  }

  function yearsFor(items) {
    const years = new Set();
    const current = Number(currentPeriod().year);
    for (let year = 2016; year <= current; year++) years.add(String(year));
    items.forEach(item => { if (/^\d{4}-/.test(item.calibrationDateISO || '')) years.add(item.calibrationDateISO.slice(0, 4)); });
    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }

  function yearOptions(items, selected) {
    return `<option value="all"${selected === 'all' ? ' selected' : ''}>Todos os anos</option>${yearsFor(items).map(year => `<option value="${html(year)}"${year === selected ? ' selected' : ''}>${html(year)}</option>`).join('')}`;
  }

  function certificateParties(certificate) {
    return window.ancalCertificateTechnical?.normalize(certificate.technical)?.parties || certificate.technical?.parties || {};
  }

  function finalCustomerName(certificate) {
    const parties = certificateParties(certificate);
    if (parties.customerSameAsRequester || !String(parties.customerName || '').trim()) return '';
    const differentName = fold(parties.customerName).trim() !== fold(parties.requesterName).trim();
    const differentCnpj = digits(parties.customerCnpj) && digits(parties.requesterCnpj) && digits(parties.customerCnpj) !== digits(parties.requesterCnpj);
    return differentName || differentCnpj ? parties.customerName : '';
  }

  function filtered(items, state) {
    const query = fold(state.query.trim());
    const numericQuery = digits(state.query);
    return items.filter(item => {
      if (state.status !== 'all' && item.status !== state.status) return false;
      if (state.status === 'signed') {
        if (state.year !== 'all' && (item.calibrationDateISO || '').slice(0, 4) !== state.year) return false;
        if (state.month !== 'all' && String(Number((item.calibrationDateISO || '').slice(5, 7))) !== state.month) return false;
      }
      const parties = certificateParties(item);
      const searchable = fold([item.client, item.cnpj, item.orderId, item.tag, item.serial, item.code, item.equipmentName, item.equipmentType, parties.requesterName, parties.requesterCnpj, parties.customerName, parties.customerCnpj].join(' '));
      return !query || searchable.includes(query) || (numericQuery.length >= 5 && [item.cnpj, parties.requesterCnpj, parties.customerCnpj].some(cnpj => digits(cnpj).includes(numericQuery)));
    });
  }

  function groupRows(items, state, scope) {
    const companies = new Map();
    items.forEach(item => {
      const key = digits(item.cnpj);
      if (!companies.has(key)) companies.set(key, { name: item.client, cnpj: item.cnpj, orders: new Map(), count: 0 });
      const company = companies.get(key);
      if (!company.orders.has(item.orderId)) company.orders.set(item.orderId, []);
      company.orders.get(item.orderId).push(item);
      company.count++;
    });
    let result = '';
    Array.from(companies.entries()).sort((a, b) => String(a[1].name).localeCompare(String(b[1].name), 'pt-BR')).forEach(([companyKey, company]) => {
      const key = `company:${companyKey}`;
      const companyClosed = state.collapsed.has(key);
      result += `<tr class="certificate-company-row"><td colspan="7"><button type="button" class="certificate-group-toggle" data-certificate-toggle="${html(key)}" aria-expanded="${!companyClosed}" aria-label="${companyClosed ? 'Expandir' : 'Recolher'} empresa ${html(company.name)}"><span class="certificate-chevron" aria-hidden="true">${companyClosed ? '▸' : '▾'}</span><strong>${html(company.name)}</strong><span class="certificate-group-cnpj">${html(company.cnpj)}</span><span class="certificate-group-count">${plural(company.count, 'certificado', 'certificados')} · ${plural(company.orders.size, 'OS', 'OS')}</span></button></td></tr>`;
      if (companyClosed) return;
      Array.from(company.orders.entries()).sort((a, b) => b[0].localeCompare(a[0], 'pt-BR', { numeric: true })).forEach(([orderId, certificates]) => {
        const orderKey = `order:${companyKey}:${orderId}`;
        const orderClosed = state.collapsed.has(orderKey);
        result += `<tr class="certificate-order-row"><td colspan="7"><button type="button" class="certificate-group-toggle" data-certificate-toggle="${html(orderKey)}" aria-expanded="${!orderClosed}" aria-label="${orderClosed ? 'Expandir' : 'Recolher'} ordem ${html(orderId)}"><span class="certificate-chevron" aria-hidden="true">${orderClosed ? '▸' : '▾'}</span><strong>${html(orderId)}</strong><span class="certificate-group-count">${plural(certificates.length, 'certificado', 'certificados')}</span></button></td></tr>`;
        if (orderClosed) return;
        certificates.sort((a, b) => String(a.code).localeCompare(String(b.code), 'pt-BR', { numeric: true })).forEach(certificate => {
          const id = html(certificate.id);
          const finalCustomer = finalCustomerName(certificate);
          const pending = certificate.status === 'awaiting_signature';
          const buttons = `<button type="button" class="certificate-text-button" data-certificate-open="${id}" aria-label="Ver certificado ${html(certificate.code)}">Ver</button>${scope !== 'portal' && pending ? `<button type="button" class="certificate-text-button" data-certificate-edit="${id}">${certificate.calibrationDateISO ? 'Editar' : 'Preparar'}</button>${store()?.canSign() ? `<button type="button" class="certificate-text-button certificate-sign-button" data-certificate-sign="${id}">Assinar</button>` : ''}` : ''}${certificate.status !== 'cancelled' ? `<button type="button" class="certificate-download-button" data-certificate-download="${id}" aria-label="Baixar ${pending ? 'rascunho do ' : ''}certificado ${html(certificate.code)}" title="${pending ? 'Baixar rascunho de demonstração' : 'Baixar certificado de demonstração'}">⇩</button>` : ''}`;
          result += `<tr class="certificate-item-row"><td><strong class="certificate-code">${html(certificate.code)}</strong>${finalCustomer ? `<span class="certificate-cell-sub">Cliente final: ${html(finalCustomer)}</span>` : ''}</td><td><strong>${html(certificate.tag || 'Sem identificação')}</strong><span class="certificate-cell-sub">${html(certificate.serial || 'Série não informada')}</span></td><td>${html(certificate.equipmentType || certificate.equipmentName || 'Não informado')}${certificate.equipmentName && fold(certificate.equipmentName) !== fold(certificate.equipmentType || certificate.equipmentName) ? `<span class="certificate-cell-sub">${html(certificate.equipmentName)}</span>` : ''}</td><td>${statusPill(certificate)}</td><td>${html(certificate.activityType || 'Rastreado')}</td><td class="certificate-date${certificate.calibrationDateISO ? '' : ' certificate-date-missing'}">${html(dateLabel(certificate.calibrationDateISO))}</td><td><div class="certificate-row-actions">${buttons}</div></td></tr>`;
        });
      });
    });
    return { html: result, companies: companies.size, orders: Array.from(companies.values()).reduce((total, company) => total + company.orders.size, 0) };
  }

  function summary(items, scope) {
    if (scope === 'portal') return `<div class="certificate-release-note"><span aria-hidden="true">✓</span><div><strong>Documentos liberados para sua empresa</strong><p>Somente certificados assinados são disponibilizados neste acesso.</p></div></div>`;
    return `<div class="certificate-summary">${['awaiting_signature', 'signed', 'cancelled'].map(status => `<button type="button" class="certificate-summary-item certificate-summary-${status}${adminState.status === status ? ' is-active' : ''}" data-certificate-status="${status}"><span>${html(statuses[status])}</span><strong data-certificate-count="${status}">${items.filter(item => item.status === status).length}</strong></button>`).join('')}</div>`;
  }

  function panel(scope, cnpj) {
    const items = sourceFor(scope, cnpj);
    const state = stateFor(scope, cnpj);
    const periodEnabled = state.status === 'signed';
    const matches = filtered(items, state);
    const rows = groupRows(matches, state, scope);
    return `<section class="certificate-module" data-certificate-panel="${scope}" data-certificate-company="${html(cnpj || '')}">${summary(items, scope)}<section class="panel table-panel certificate-table-panel"><div class="certificate-panel-heading"><div><h2>${scope === 'portal' ? 'Certificados da empresa' : 'Gestão de certificados'}</h2><p>Organizados por empresa, ordem de serviço e instrumento.</p></div>${scope === 'portal' ? '<span class="certificate-portal-badge">Acesso do cliente</span>' : '<span class="certificate-restricted-badge">Liberação após assinatura</span>'}</div><div class="certificate-filters">${scope !== 'portal' ? `<label class="certificate-filter"><span>Situação</span><select data-certificate-filter="status" aria-label="Filtrar certificados por situação">${Object.entries(statuses).map(([value, label]) => `<option value="${value}"${state.status === value ? ' selected' : ''}>${html(label)}</option>`).join('')}</select></label>` : ''}<label class="certificate-filter certificate-filter-search"><span>Buscar certificado</span><input type="search" class="certificate-search" data-certificate-filter="query" value="${html(state.query)}" placeholder="Cliente, CPF/CNPJ, OS, código ou tag" aria-label="Buscar certificado por cliente, CPF/CNPJ, OS, código ou tag"></label><label class="certificate-filter"><span>Mês da calibração</span><select data-certificate-filter="month" aria-label="Mês da calibração"${periodEnabled ? '' : ' disabled'}><option value="all"${state.month === 'all' ? ' selected' : ''}>Todos os meses</option>${months.map((month, index) => `<option value="${index + 1}"${state.month === String(index + 1) ? ' selected' : ''}>${month}</option>`).join('')}</select></label><label class="certificate-filter certificate-filter-year"><span>Ano</span><select data-certificate-filter="year" aria-label="Ano da calibração"${periodEnabled ? '' : ' disabled'}>${yearOptions(items, state.year)}</select></label></div><p class="certificate-period-help" data-certificate-period-help>${periodEnabled ? (scope === 'portal' ? 'Os certificados assinados de todos os períodos são exibidos inicialmente. Use mês e ano para consultar a data da calibração.' : 'Assinados: o período inicial é o mês e ano atuais. Para consultar o histórico, altere os seletores ou escolha Todos.') : 'Selecione Assinados para consultar os documentos por mês e ano da calibração.'}</p><div class="certificate-result-bar"><span data-certificate-result role="status" aria-live="polite">${plural(matches.length, 'certificado', 'certificados')} · ${plural(rows.companies, 'empresa', 'empresas')} · ${plural(rows.orders, 'OS', 'OS')}</span><button type="button" class="certificate-text-button" data-certificate-reset>Limpar filtros</button></div><div class="table-scroll certificate-table-scroll" tabindex="0" role="region" aria-label="Tabela de certificados, com rolagem horizontal"><table class="certificate-table"><thead><tr><th>CERTIFICADO</th><th>IDENTIFICAÇÃO / SÉRIE</th><th>TIPO DE EQUIPAMENTO</th><th>SITUAÇÃO</th><th>TIPO DE ATIVIDADE</th><th>DATA DA CALIBRAÇÃO</th><th>AÇÕES</th></tr></thead><tbody data-certificate-rows>${rows.html}</tbody></table></div><div class="certificate-empty" data-certificate-empty${matches.length ? ' hidden' : ''}><span aria-hidden="true">▧</span><strong>Nenhum certificado neste filtro</strong><p data-certificate-empty-text>${emptyText(state, scope)}</p><button type="button" class="btn" data-certificate-all-period${periodEnabled ? '' : ' hidden'}>Consultar todos os períodos</button></div></section><p class="certificate-demo-note">${scope === 'portal' ? 'Certificados e assinaturas de demonstração, sem validade técnica.' : 'Protótipo: assinatura simulada, sem validade técnica. O cliente só acessa o documento após a assinatura.'}</p></section>`;
  }

  function emptyText(state, scope) {
    if (state.query.trim()) return 'Tente outro código, identificação, empresa ou número de OS.';
    if (state.status === 'signed') return 'Pode haver documentos em outros meses. Altere mês e ano ou consulte todos os períodos para localizar os certificados do histórico.';
    return scope === 'portal' ? 'Sua empresa ainda não possui certificados liberados.' : 'Não há certificados nesta situação. Escolha Todos para consultar os demais registros.';
  }

  function refreshPanel(element) {
    const scope = element.dataset.certificatePanel;
    if ((scope === 'admin' && isPortal()) || (scope === 'portal' && !isPortal())) return;
    const cnpj = element.dataset.certificateCompany;
    const state = stateFor(scope, cnpj);
    const items = sourceFor(scope, cnpj);
    const matches = filtered(items, state);
    const rows = groupRows(matches, state, scope);
    element.querySelector('[data-certificate-rows]').innerHTML = rows.html;
    element.querySelector('[data-certificate-result]').textContent = `${plural(matches.length, 'certificado', 'certificados')} · ${plural(rows.companies, 'empresa', 'empresas')} · ${plural(rows.orders, 'OS', 'OS')}`;
    const signed = state.status === 'signed';
    const status = element.querySelector('[data-certificate-filter="status"]');
    if (status) status.value = state.status;
    const month = element.querySelector('[data-certificate-filter="month"]');
    month.disabled = !signed;
    month.value = state.month;
    const year = element.querySelector('[data-certificate-filter="year"]');
    year.disabled = !signed;
    year.innerHTML = yearOptions(items, state.year);
    element.querySelector('[data-certificate-period-help]').textContent = signed ? (scope === 'portal' ? 'Os certificados assinados de todos os períodos são exibidos inicialmente. Use mês e ano para consultar a data da calibração.' : 'Assinados: o período inicial é o mês e ano atuais. Para consultar o histórico, altere os seletores ou escolha Todos.') : 'Selecione Assinados para consultar os documentos por mês e ano da calibração.';
    element.querySelector('[data-certificate-empty]').hidden = Boolean(matches.length);
    element.querySelector('[data-certificate-empty-text]').textContent = emptyText(state, scope);
    element.querySelector('[data-certificate-all-period]').hidden = !signed;
    element.querySelectorAll('[data-certificate-count]').forEach(count => { count.textContent = items.filter(item => item.status === count.dataset.certificateCount).length; });
    element.querySelectorAll('[data-certificate-status]').forEach(button => button.classList.toggle('is-active', button.dataset.certificateStatus === state.status));
  }

  function refreshVisible() {
    document.querySelectorAll('[data-certificate-panel]').forEach(refreshPanel);
  }

  function formError(form, message) {
    const error = form.querySelector('.certificate-form-error');
    if (!error) return;
    error.textContent = message || 'Não foi possível concluir a ação.';
    error.hidden = false;
    error.focus();
  }

  function deny(message) {
    if (typeof showToast === 'function') showToast(message || 'Certificado indisponível para este acesso.');
  }

  function equipmentName(item) { return item.name || item.equipmentName || item.tag || 'Equipamento'; }

  function equipmentOptions(orderId, cnpj, selectedId, editing) {
    const items = store().getEquipmentForOrder(orderId, cnpj);
    const existing = store().forOrder(orderId, cnpj);
    return `<option value="">Selecione um instrumento da OS</option>${items.map(item => {
      const used = !editing && existing.some(certificate => certificate.equipmentId === item.id);
      return `<option value="${html(item.id)}"${item.id === selectedId ? ' selected' : ''}${used ? ' disabled' : ''}>${html(equipmentName(item))} · ${html(item.tag || 'Sem tag')}${used ? ' — já possui certificado' : ''}</option>`;
    }).join('')}`;
  }

  function edit(id) {
    if (isPortal() || !store()) return deny('O cadastro de certificados é restrito à equipe do laboratório.');
    const certificate = id ? store().get(id) : null;
    if (id && (!certificate || certificate.status !== 'awaiting_signature')) return deny('Somente certificados aguardando assinatura podem ser editados.');
    const orders = store().getOrders();
    if (!orders.length) return deny('Cadastre uma ordem de serviço com equipamentos antes de preparar um certificado.');
    const selectedOrder = certificate ? orders.find(order => order.id === certificate.orderId && digits(order.cnpj) === digits(certificate.cnpj)) : null;
    const selectedKey = selectedOrder ? orders.indexOf(selectedOrder) : '';
    const technicalApi = window.ancalCertificateTechnical;
    const equipment = certificate ? store().getEquipmentForOrder(certificate.orderId, certificate.cnpj).find(item => item.id === certificate.equipmentId) : null;
    const technical = technicalApi?.defaults(certificate || {}, selectedOrder || {}, equipment || {});
    openModal(certificate ? 'Preparar certificado' : 'Novo certificado', 'Cada certificado corresponde a um instrumento da ordem de serviço. Informe a data real da calibração desse instrumento.', `<form id="certificatesForm" data-certificate-form="edit" data-certificate-id="${html(certificate?.id || '')}"><div class="form-grid certificate-form-grid"><div class="field full"><label for="certificateOrder">Ordem de serviço / empresa</label><select id="certificateOrder" name="orderKey" required${certificate ? ' disabled' : ''}><option value="">Selecione uma ordem de serviço</option>${orders.map((order, index) => `<option value="${index}"${index === selectedKey ? ' selected' : ''}>${html(order.id)} · ${html(order.client)} · ${html(order.cnpj)}</option>`).join('')}</select></div><div class="field full"><label for="certificateEquipment">Instrumento da ordem</label><select id="certificateEquipment" name="equipmentId" required disabled>${certificate ? equipmentOptions(certificate.orderId, certificate.cnpj, certificate.equipmentId, true) : '<option value="">Selecione uma OS primeiro</option>'}</select><small class="certificate-field-help">Uma OS pode reunir vários instrumentos. Prepare um certificado e uma data de calibração para cada um.</small></div><div class="field"><label for="certificateCode">Código do certificado</label><input id="certificateCode" name="code" required maxlength="80" value="${html(certificate?.code || '')}" placeholder="Ex.: CERT-2026-2040"></div><div class="field"><label for="certificateDate">Data da calibração</label><input type="date" id="certificateDate" name="calibrationDateISO" required value="${html(certificate?.calibrationDateISO || '')}"></div><div class="field full"><label for="certificateActivity">Tipo de atividade</label><input id="certificateActivity" name="activityType" required maxlength="100" value="${html(certificate?.activityType || 'Rastreado')}"></div></div>${technicalApi ? technicalApi.form(technical) : ''}<div class="certificate-form-notice">O documento fica em <strong>Aguardando assinatura</strong> e não aparece no acesso do cliente até ser assinado.</div><p class="certificate-form-error" role="alert" tabindex="-1" hidden></p><div class="modal-actions"><button type="button" class="btn" data-certificate-close>Cancelar</button><button type="submit" class="btn btn-primary">${certificate ? 'Salvar certificado' : 'Criar certificado'}</button></div></form>`);
    const form = document.getElementById('certificatesForm');
    form._certificateOrders = orders;
    form._technicalDrafts = new Map();
    form._technicalSelection = null;
    technicalApi?.bind(form, certificate || {});
  }

  function refreshTechnicalEditor(form) {
    const technicalApi = window.ancalCertificateTechnical;
    if (!technicalApi || !form || form.dataset.certificateId) return;
    if (form._technicalSelection) form._technicalDrafts.set(form._technicalSelection, technicalApi.read(form));
    const order = form._certificateOrders?.[form.elements.orderKey.value];
    const equipment = order ? store().getEquipmentForOrder(order.id, order.cnpj).find(item => item.id === form.elements.equipmentId.value) : null;
    const key = order && equipment ? [digits(order.cnpj), order.id, equipment.id].join(':') : null;
    const context = { client: order?.client || '', cnpj: order?.cnpj || '', orderId: order?.id || '', equipmentId: equipment?.id || '', equipmentName: equipmentName(equipment || {}), tag: equipment?.tag || '', serial: equipment?.serial || '' };
    const technical = key && form._technicalDrafts.has(key) ? form._technicalDrafts.get(key) : technicalApi.defaults(context, order || {}, equipment || {});
    const editor = form.querySelector('[data-certificate-technical]');
    if (editor) editor.outerHTML = technicalApi.form(technical);
    form._technicalSelection = key;
    technicalApi.bind(form, context);
  }

  function technicalSigningSummary(certificate) {
    const technicalApi = window.ancalCertificateTechnical;
    const technical = technicalApi?.normalize(certificate.technical || store()?.getSigningTechnical(certificate.id));
    if (!technical) return '';
    return `<dl class="certificate-detail-grid"><div><dt>Solicitante</dt><dd>${html(technical.parties.requesterName || 'Não informado')}<small>${html(technical.parties.requesterCnpj)}</small></dd></div><div><dt>Cliente final</dt><dd>${html(technical.parties.customerName || 'Não informado')}<small>${html(technical.parties.customerCnpj)}</small></dd></div><div><dt>Modelo do certificado</dt><dd>${html(technicalApi.template(technical.templateId).label)}</dd></div></dl><details class="certificate-technical-sign-preview"><summary>Conferir prévia técnica antes de assinar</summary>${technicalApi.detail({ ...certificate, technical })}</details>`;
  }

  function open(id) {
    const certificate = store()?.get(id);
    if (!certificate) return deny();
    const admin = !isPortal();
    const pending = certificate.status === 'awaiting_signature';
    const signature = certificate.signature;
    openModal(`Certificado ${certificate.code}`, `${certificate.client} · ${certificate.orderId}`, `<div class="certificate-detail">${statusPill(certificate)}<dl class="certificate-detail-grid"><div><dt>Empresa</dt><dd>${html(certificate.client)}<small>${html(certificate.cnpj)}</small></dd></div><div><dt>Ordem de serviço</dt><dd>${html(certificate.orderId)}</dd></div><div><dt>Instrumento</dt><dd>${html(certificate.equipmentName)}<small>${html(certificate.equipmentType || '')}</small></dd></div><div><dt>Identificação / série</dt><dd>${html(certificate.tag || 'Não informada')}<small>${html(certificate.serial || 'Série não informada')}</small></dd></div><div><dt>Data da calibração</dt><dd>${html(dateLabel(certificate.calibrationDateISO))}</dd></div><div><dt>Tipo de atividade</dt><dd>${html(certificate.activityType || 'Rastreado')}</dd></div></dl>${signature ? `<div class="certificate-signature-note"><strong>✓ Assinatura simulada</strong><p>${html(signature.name)} · ${html(signature.role === 'admin' ? 'Administrador(a)' : 'Signatário(a) autorizado(a)')}</p><p>${html(signedAtLabel(signature.signedAt))}</p><small>Assinatura de demonstração, sem validade técnica ou criptográfica.</small></div>` : pending ? '<div class="certificate-form-notice"><strong>Documento aguardando assinatura.</strong> Acesso exclusivo da equipe do laboratório. O cliente ainda não pode consultar ou baixar este certificado.</div>' : ''}${certificate.status === 'cancelled' ? `<div class="certificate-cancel-note"><strong>Cancelamento registrado</strong><p>${html(certificate.cancelReason || 'Sem motivo informado')}</p></div>` : ''}${window.ancalSignatureImages?.controls(certificate) || ''}${window.ancalCertificateTechnical?.detail(certificate) || ''}<div class="modal-actions certificate-detail-actions">${admin && pending ? `<button type="button" class="btn" data-certificate-edit="${html(id)}">Preparar / editar</button>${store().canSign() ? `<button type="button" class="btn btn-primary" data-certificate-sign="${html(id)}">Assinar</button>` : ''}` : ''}${certificate.status !== 'cancelled' ? `<button type="button" class="btn" data-certificate-signature-print="${html(id)}">Abrir para impressão</button><button type="button" class="btn${certificate.status === 'signed' ? ' btn-primary' : ''}" data-certificate-download="${html(id)}">⇩ ${pending ? 'Baixar rascunho' : 'Baixar certificado'}</button>` : ''}${admin && store().canSign() && certificate.status !== 'cancelled' ? `<button type="button" class="certificate-cancel-button" data-certificate-cancel="${html(id)}">Cancelar certificado</button>` : ''}</div></div>`);
  }

  function confirmSign(id) {
    if (isPortal() || !store()?.canSign()) return deny('Este perfil não pode assinar certificados.');
    const certificate = store().get(id);
    if (!certificate || certificate.status !== 'awaiting_signature') return deny('O certificado não está aguardando assinatura.');
    const actor = store().getActor();
    if (!certificate.calibrationDateISO) {
      openModal('Prepare a data da calibração', 'Antes de assinar, informe a data da calibração deste instrumento.', `<div class="certificate-form-notice"><strong>${html(certificate.code)}</strong><p>${html(certificate.equipmentName)} · ${html(certificate.tag)}</p></div><div class="modal-actions"><button type="button" class="btn" data-certificate-close>Voltar</button><button type="button" class="btn btn-primary" data-certificate-edit="${html(id)}">Preparar certificado</button></div>`);
      return;
    }
    openModal('Assinar certificado', 'Confira o documento e confirme a assinatura de demonstração.', `<form data-certificate-form="sign" data-certificate-id="${html(id)}"><dl class="certificate-detail-grid"><div><dt>Certificado</dt><dd>${html(certificate.code)}</dd></div><div><dt>Ordem de serviço</dt><dd>${html(certificate.orderId)}</dd></div><div><dt>Instrumento</dt><dd>${html(certificate.equipmentName)}<small>${html(certificate.tag)}</small></dd></div><div><dt>Data da calibração</dt><dd>${html(dateLabel(certificate.calibrationDateISO))}</dd></div><div class="certificate-detail-wide"><dt>Assinado por</dt><dd>${html(actor.name)}<small>${actor.role === 'admin' ? 'Administrador(a)' : 'Signatário(a) autorizado(a)'}</small></dd></div></dl>${technicalSigningSummary(certificate)}<div class="certificate-simulation-note"><strong>Assinatura simulada no protótipo</strong><p>Esta confirmação não aplica assinatura digital e não confere validade técnica ao documento. Após confirmar, o certificado será disponibilizado no acesso do cliente.</p></div><p class="certificate-form-error" role="alert" tabindex="-1" hidden></p><div class="modal-actions"><button type="button" class="btn" data-certificate-close>Voltar</button><button type="submit" class="btn btn-primary">Confirmar assinatura simulada</button></div></form>`);
  }

  function confirmCancel(id) {
    if (isPortal() || !store()?.canSign()) return deny('Este perfil não pode cancelar certificados.');
    const certificate = store()?.get(id);
    if (!certificate || certificate.status === 'cancelled') return deny();
    openModal('Cancelar certificado', 'O registro será preservado. O certificado cancelado deixará de estar disponível no acesso do cliente.', `<form data-certificate-form="cancel" data-certificate-id="${html(id)}"><div class="certificate-form-notice"><strong>${html(certificate.code)}</strong><p>${html(certificate.equipmentName)} · ${html(certificate.tag)}</p></div><div class="field"><label for="certificateCancelReason">Motivo do cancelamento</label><textarea id="certificateCancelReason" name="reason" class="certificate-reason" rows="3" required maxlength="500" placeholder="Descreva o motivo do cancelamento"></textarea></div><p class="certificate-form-error" role="alert" tabindex="-1" hidden></p><div class="modal-actions"><button type="button" class="btn" data-certificate-close>Voltar</button><button type="submit" class="btn certificate-danger-button">Confirmar cancelamento</button></div></form>`);
  }

  function download(id) {
    const certificate = store()?.get(id);
    if (!certificate || certificate.status === 'cancelled' || (isPortal() && certificate.status !== 'signed')) return deny();
    if (!window.ancalDownloads?.certificate) return deny('O gerador de PDF não está disponível.');
    const result = window.ancalDownloads.certificate({ id: certificate.orderId, certificateRecordId: certificate.id, client: certificate.client, cnpj: certificate.cnpj, equipment: certificate.equipmentName, tag: certificate.tag, serial: certificate.serial, certificateCode: certificate.code, calibrationDateISO: certificate.calibrationDateISO, certificateStatus: certificate.status, certificateSignature: certificate.signature, activityType: certificate.activityType });
    if (result) showToast(certificate.status === 'signed' ? 'Certificado de demonstração baixado.' : 'Rascunho de demonstração baixado.');
    else deny('Não foi possível gerar o PDF deste certificado.');
    return result;
  }

  document.addEventListener('input', event => {
    if (!event.target.matches('[data-certificate-filter="query"]')) return;
    const element = event.target.closest('[data-certificate-panel]');
    if (!element) return;
    stateFor(element.dataset.certificatePanel, element.dataset.certificateCompany).query = event.target.value;
    refreshPanel(element);
  });

  document.addEventListener('change', event => {
    const input = event.target;
    if (input.matches('[data-certificate-filter]') && input.dataset.certificateFilter !== 'query') {
      const element = input.closest('[data-certificate-panel]');
      const state = stateFor(element.dataset.certificatePanel, element.dataset.certificateCompany);
      state[input.dataset.certificateFilter] = input.value;
      if (input.dataset.certificateFilter === 'status') {
        Object.assign(state, input.value === 'signed' ? currentPeriod() : { month: 'all', year: 'all' });
        state.collapsed.clear();
      }
      refreshPanel(element);
    }
    if (input.id === 'certificateOrder') {
      const form = input.closest('form');
      const order = form._certificateOrders?.[input.value];
      const equipment = form.elements.equipmentId;
      equipment.innerHTML = order ? equipmentOptions(order.id, order.cnpj, '', false) : '<option value="">Selecione uma OS primeiro</option>';
      equipment.disabled = !order;
      refreshTechnicalEditor(form);
    }
    if (input.id === 'certificateEquipment') refreshTechnicalEditor(input.closest('form'));
  });

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-certificate-new],[data-certificate-open],[data-certificate-edit],[data-certificate-sign],[data-certificate-cancel],[data-certificate-download],[data-certificate-close],[data-certificate-toggle],[data-certificate-status],[data-certificate-reset],[data-certificate-all-period]');
    if (!button) return;
    event.preventDefault();
    if (button.hasAttribute('data-certificate-new')) return edit();
    if (button.hasAttribute('data-certificate-open')) return open(button.dataset.certificateOpen);
    if (button.hasAttribute('data-certificate-edit')) return edit(button.dataset.certificateEdit);
    if (button.hasAttribute('data-certificate-sign')) return confirmSign(button.dataset.certificateSign);
    if (button.hasAttribute('data-certificate-cancel')) return confirmCancel(button.dataset.certificateCancel);
    if (button.hasAttribute('data-certificate-download')) return download(button.dataset.certificateDownload);
    if (button.hasAttribute('data-certificate-close')) return closeModal();
    const element = button.closest('[data-certificate-panel]');
    if (!element) return;
    const state = stateFor(element.dataset.certificatePanel, element.dataset.certificateCompany);
    if (button.hasAttribute('data-certificate-toggle')) {
      const key = button.dataset.certificateToggle;
      state.collapsed.has(key) ? state.collapsed.delete(key) : state.collapsed.add(key);
      refreshPanel(element);
      Array.from(element.querySelectorAll('[data-certificate-toggle]')).find(toggle => toggle.dataset.certificateToggle === key)?.focus();
      return;
    }
    if (button.hasAttribute('data-certificate-status')) {
      state.status = button.dataset.certificateStatus;
      Object.assign(state, state.status === 'signed' ? currentPeriod() : { month: 'all', year: 'all' });
    } else if (button.hasAttribute('data-certificate-all-period')) {
      state.month = 'all'; state.year = 'all';
    } else {
      state.query = ''; state.month = 'all'; state.year = 'all';
      state.status = element.dataset.certificatePanel === 'portal' ? 'signed' : 'all';
      element.querySelector('[data-certificate-filter="query"]').value = '';
    }
    state.collapsed.clear();
    refreshPanel(element);
  });

  document.addEventListener('submit', event => {
    const form = event.target;
    if (!form.matches('[data-certificate-form]')) return;
    event.preventDefault();
    if (isPortal()) return formError(form, 'Esta ação é restrita à equipe do laboratório.');
    for(const picker of form.querySelectorAll('[data-optional-date]')) {
      const selectedDate=window.ancalOptionalDate.sync(picker);
      if(!selectedDate.ok) { picker.closest('details')?.setAttribute('open',''); return formError(form,selectedDate.error); }
    }
    if (!form.checkValidity()) return form.reportValidity();
    const action = form.dataset.certificateForm;
    const id = form.dataset.certificateId;
    let result;
    if (action === 'edit') {
      const patch = { code: form.elements.code.value.trim(), calibrationDateISO: form.elements.calibrationDateISO.value, activityType: form.elements.activityType.value.trim() };
      if (window.ancalCertificateTechnical) {
        patch.technical = window.ancalCertificateTechnical.read(form);
        const technicalError = window.ancalCertificateTechnical.validate(patch.technical, patch.calibrationDateISO);
        if (technicalError) return formError(form, technicalError);
      }
      if (id) result = store().update(id, patch);
      else {
        const order = form._certificateOrders?.[form.elements.orderKey.value];
        if (!order || !form.elements.equipmentId.value) return formError(form, 'Selecione uma ordem de serviço e um instrumento disponível.');
        result = store().create({ ...patch, orderId: order.id, cnpj: order.cnpj, equipmentId: form.elements.equipmentId.value });
      }
    } else if (action === 'sign') result = store().sign(id);
    else if (action === 'cancel') {
      if (!form.elements.reason.value.trim()) return formError(form, 'Informe o motivo do cancelamento.');
      result = store().cancel(id, form.elements.reason.value.trim());
    }
    if (!result?.ok) return formError(form, result?.error);
    closeModal();
    refreshVisible();
    showToast(action === 'sign' ? 'Assinatura simulada registrada. Certificado liberado para o cliente.' : action === 'cancel' ? 'Certificado cancelado. Registro preservado.' : 'Certificado salvo e aguardando assinatura.');
  });

  document.addEventListener('ancal-certificates-changed', refreshVisible);

  window.ancalCertificatesUI = {
    render() {
      if (isPortal()) return '';
      return `${heading('Certificados', 'Prepare, assine e acompanhe os certificados de cada instrumento.', '<button type="button" class="btn btn-primary" data-certificate-new><span class="plus">＋</span> Novo certificado</button>')}${panel('admin', '')}`;
    },
    portal(cnpj) { return panel('portal', cnpj); },
    open,
    download
  };
}());
