(function () {
  'use strict';

  const storageKey = 'ancal-access-v1';
  const seedIds = ['hospital-sao-lucas', 'lab-biocenter', 'industria-nutribem', 'farmacia-central', 'universidade-unaerp'];
  const copy = value => JSON.parse(JSON.stringify(value));
  const h = value => escapeHtml(value);
  const digits = value => String(value || '').replace(/\D/g, '');
  const clean = value => String(value == null ? '' : value).trim();
  const documentKey = value => window.ancalIdentity?.key(value) || clean(value && typeof value === 'object' ? value.document || value.cnpj : value).toUpperCase().replace(/[.\/\-\s]/g, '');
  const validDocument = (value, type) => window.ancalIdentity?.validDocument(value, type) ?? (type === 'pf' ? /^\d{11}$/.test(documentKey(value)) : type === 'pj' ? /^[A-Z\d]{12}\d{2}$/.test(documentKey(value)) : /^(?:\d{11}|[A-Z\d]{12}\d{2})$/.test(documentKey(value)));
  const initials = name => String(name).trim().split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase();
  const uniqueId = prefix => prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  const formatCnpj = value => window.ancalIdentity?.format(value) || (documentKey(value).length === 11 ? documentKey(value).replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : documentKey(value).replace(/^([A-Z\d]{2})([A-Z\d]{3})([A-Z\d]{3})([A-Z\d]{4})(\d{2})$/, '$1.$2.$3/$4-$5'));
  const companyTextLimits = { name: 160, tradeName: 160, legalName: 160, nickname: 120, stateRegistration: 60, municipalRegistration: 60, phone: 60, mobile: 60, address: 240, number: 30, postalCode: 10, state: 2, city: 120, neighborhood: 120, complement: 240, observations: 5000 };
  const seedCompanies = clients.map((client, index) => ({
    id: seedIds[index] || uniqueId('empresa'), name: client[0], cnpj: client[1], city: 'Ribeirão Preto, SP'
  }));
  const seedAccount = {
    id: 'cliente-demo', name: 'Marina Oliveira', email: 'marina@example.com', initials: 'MO',
    companyIds: ['hospital-sao-lucas', 'lab-biocenter'], status: 'active'
  };
  let state = {
    companies: seedCompanies, accounts: [seedAccount], previewAccountId: seedAccount.id,
    audit: [{ id: 'seed-marina', date: new Date().toISOString(), actor: 'Isabela Jurado', action: 'Acesso criado', detail: 'Marina Oliveira · Hospital São Lucas e Lab. Biocenter' }]
  };

  function validId(value) { return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value); }
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (!saved || !Array.isArray(saved.companies) || !Array.isArray(saved.accounts)) return;
      const companyIds = new Set(), cnpjs = new Set();
      const companies = saved.companies.filter(company => {
        if (!company || !validId(company.id) || typeof company.name !== 'string' || !company.name.trim() || !validDocument(company.document || company.cnpj) || companyIds.has(company.id) || cnpjs.has(documentKey(company))) return false;
        companyIds.add(company.id); cnpjs.add(documentKey(company)); return true;
      }).map(company => ({ ...copy(company), id: company.id, name: company.name.trim(), cnpj: formatCnpj(company.document || company.cnpj), ...(Object.hasOwn(company, 'document') ? { document: formatCnpj(company.document || company.cnpj) } : {}), city: String(company.city || '') }));
      const accountIds = new Set(), emails = new Set();
      const accounts = saved.accounts.filter(account => {
        if (!account || !validId(account.id) || typeof account.name !== 'string' || !account.name.trim() || typeof account.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.email.trim()) || accountIds.has(account.id) || emails.has(account.email.trim().toLowerCase())) return false;
        accountIds.add(account.id); emails.add(account.email.trim().toLowerCase()); return true;
      }).map(account => ({
        ...copy(account),
        id: account.id, name: account.name.trim(), email: account.email.trim(), initials: initials(account.name),
        companyIds: [...new Set((Array.isArray(account.companyIds) ? account.companyIds : []).filter(id => companyIds.has(id)))],
        status: account.status === 'inactive' ? 'inactive' : 'active'
      }));
      if (!companies.length || !accounts.length) return;
      state = {
        ...copy(saved),
        companies, accounts,
        previewAccountId: accounts.some(account => account.id === saved.previewAccountId) ? saved.previewAccountId : accounts[0].id,
        audit: (Array.isArray(saved.audit) ? saved.audit : []).filter(event => event && typeof event.action === 'string' && typeof event.detail === 'string' && !Number.isNaN(new Date(event.date).getTime())).slice(0, 100).map(event => ({ ...copy(event), id: String(event.id || uniqueId('evento')), date: event.date, actor: String(event.actor || 'Isabela Jurado'), action: event.action, detail: event.detail }))
      };
    } catch (_) { /* Keep the seed when the saved prototype data cannot be read. */ }
  }

  function syncLegacyClients() {
    state.companies.forEach(company => {
      if (!clients.some(client => documentKey(client[1]) === documentKey(company))) clients.push([company.name, company.cnpj, '0', '0', 'Ativo']);
    });
  }
  function persist() {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch (_) { /* Session state remains usable without browser storage. */ }
    document.dispatchEvent(new CustomEvent('ancal-access-changed'));
  }
  function audit(action, detail) {
    state.audit.unshift({ id: uniqueId('evento'), date: new Date().toISOString(), actor: 'Isabela Jurado', action, detail });
    state.audit = state.audit.slice(0, 100);
  }
  function getCompanies() { return portalMode ? getAllowedCompanies(state.previewAccountId) : copy(state.companies); }
  function getCompany(id) {
    const company = state.companies.find(item => item.id === id);
    return company && (!portalMode || getAllowedCompanies(state.previewAccountId).some(item => item.id === id)) ? copy(company) : null;
  }
  function getAccounts() { return copy(state.accounts); }
  function getAccount(id) { const account = state.accounts.find(item => item.id === id); return account ? copy(account) : null; }
  function getPreviewAccount() { return getAccount(state.previewAccountId) || (state.accounts[0] ? copy(state.accounts[0]) : null); }
  function getAllowedCompanies(accountId) {
    if (portalMode && accountId !== state.previewAccountId) return [];
    const account = state.accounts.find(item => item.id === accountId);
    return account?.status === 'active' ? copy(state.companies.filter(company => account.companyIds.includes(company.id))) : [];
  }
  function companyType(company) { return ['pf', 'pj'].includes(company?.personType) ? company.personType : documentKey(company).length === 11 ? 'pf' : 'pj'; }
  function derivedName(value, type) {
    if (type === 'pf') return clean(value.name || value.legalName);
    return Object.hasOwn(value, 'tradeName') || Object.hasOwn(value, 'legalName') ? clean(value.tradeName || value.legalName) : clean(value.name);
  }
  function validateCompany(value, type) {
    if (!validDocument(value.document || value.cnpj, type)) return type === 'pf' ? 'Informe um CPF com 11 dígitos.' : 'Informe um CNPJ válido com 14 posições; as duas últimas devem ser numéricas.';
    if (!derivedName(value, type)) return type === 'pf' ? 'Informe o nome do cliente.' : 'Informe o nome fantasia ou a razão social do cliente.';
    for (const [key, limit] of Object.entries(companyTextLimits)) if (Object.hasOwn(value, key) && (typeof value[key] !== 'string' || value[key].length > limit)) return `Revise o campo ${key}; o limite é de ${limit} caracteres.`;
    if (value.postalCode && !/^\d{8}$/.test(digits(value.postalCode))) return 'Informe um CEP com 8 dígitos ou deixe o campo vazio.';
    if (value.state && !/^[a-zA-Z]{2}$/.test(value.state)) return 'Informe a UF com duas letras.';
    if (Object.hasOwn(value, 'endConsumer') && typeof value.endConsumer !== 'boolean') return 'Informe uma opção válida para consumidor final.';
    if (Object.hasOwn(value, 'showValidity') && !['unspecified', 'yes', 'no'].includes(value.showValidity)) return 'Selecione uma opção válida para a validade nos certificados.';
    if (Object.hasOwn(value, 'emails')) {
      if (!Array.isArray(value.emails) || value.emails.length > 20 || value.emails.some(email => typeof email !== 'string' || email.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))) return 'Informe até 20 e-mails válidos para o cliente.';
    }
    if (Object.hasOwn(value, 'contacts')) {
      if (!Array.isArray(value.contacts) || value.contacts.length > 20) return 'Informe até 20 contatos para o cliente.';
      const ids = new Set();
      for (const contact of value.contacts) {
        if (!contact || typeof contact !== 'object' || Array.isArray(contact) || !clean(contact.name)) return 'Informe o nome de cada contato adicionado.';
        for (const [key, limit] of Object.entries({ name: 120, role: 120, phone: 60, mobile: 60, email: 160 })) if (Object.hasOwn(contact, key) && (typeof contact[key] !== 'string' || contact[key].length > limit)) return 'Revise os dados do contato.';
        if (contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim())) return 'Informe um e-mail válido para o contato ou deixe o campo vazio.';
        if (contact.id && (!validId(contact.id) || ids.has(contact.id))) return 'Os contatos devem possuir identificações válidas e distintas.';
        if (contact.id) ids.add(contact.id);
      }
    }
    return '';
  }
  function normalizedCompany(value, existing) {
    const type = companyType(value), document = formatCnpj(value.document || value.cnpj);
    const company = { ...(existing ? copy(existing) : {}), id: existing?.id || uniqueId('cliente'), name: derivedName(value, type), cnpj: document, document, personType: type };
    Object.keys(companyTextLimits).filter(key => key !== 'name').forEach(key => { if (Object.hasOwn(value, key)) company[key] = key === 'observations' ? value[key].replace(/\r\n?/g, '\n') : clean(value[key]); });
    if (Object.hasOwn(company, 'state')) company.state = company.state.toUpperCase();
    if (company.postalCode) company.postalCode = digits(company.postalCode).replace(/^(\d{5})(\d{3})$/, '$1-$2');
    if (Object.hasOwn(value, 'endConsumer')) company.endConsumer = value.endConsumer;
    else if (!existing) company.endConsumer = false;
    if (Object.hasOwn(value, 'showValidity')) company.showValidity = value.showValidity;
    else if (!existing) company.showValidity = 'unspecified';
    if (Object.hasOwn(value, 'emails')) company.emails = [...new Map(value.emails.map(email => [email.trim().toLowerCase(), email.trim()])).values()];
    else if (!existing) company.emails = [];
    if (Object.hasOwn(value, 'contacts')) company.contacts = value.contacts.map(contact => {
      const previous = (Array.isArray(existing?.contacts) ? existing.contacts : []).find(item => item.id === contact.id);
      return { ...(previous ? copy(previous) : {}), id: contact.id || uniqueId('contato'), name: clean(contact.name), role: clean(contact.role), phone: clean(contact.phone), mobile: clean(contact.mobile), email: clean(contact.email) };
    });
    else if (!existing) company.contacts = [];
    return company;
  }
  function createCompany(values) {
    if (portalMode) return { ok: false, error: 'O cadastro de clientes é restrito à área interna.' };
    if (!values || typeof values !== 'object' || Array.isArray(values)) return { ok: false, error: 'Informe os dados do cliente.' };
    const type = values.personType || (documentKey(values).length === 11 ? 'pf' : 'pj');
    if (!['pf', 'pj'].includes(type)) return { ok: false, error: 'Selecione pessoa física ou jurídica.' };
    if (values.document && values.cnpj && documentKey(values.document) !== documentKey(values.cnpj)) return { ok: false, error: 'O documento informado não corresponde ao CPF/CNPJ do cliente.' };
    const value = { ...values, personType: type };
    const invalid = validateCompany(value, type);
    if (invalid) return { ok: false, error: invalid };
    if (state.companies.some(company => documentKey(company) === documentKey(value))) return { ok: false, error: 'Já existe um cliente cadastrado com este CPF/CNPJ.' };
    const company = normalizedCompany(value);
    state.companies.push(company); syncLegacyClients(); audit(type === 'pj' ? 'Empresa cadastrada' : 'Cliente cadastrado', `${company.name} · ${company.cnpj}`); persist();
    return { ok: true, company: copy(company) };
  }
  function updateCompany(id, patch) {
    if (portalMode) return { ok: false, error: 'A edição de clientes é restrita à área interna.' };
    const existing = state.companies.find(company => company.id === id);
    if (!existing) return { ok: false, error: 'Cliente não encontrado.' };
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { ok: false, error: 'Informe os campos do cliente.' };
    const allowed = ['id', 'personType', 'document', 'cnpj', ...Object.keys(companyTextLimits), 'endConsumer', 'showValidity', 'emails', 'contacts'];
    if (Object.keys(patch).some(key => !allowed.includes(key))) return { ok: false, error: 'O cadastro contém campos que não podem ser alterados.' };
    const type = companyType(existing);
    if ((Object.hasOwn(patch, 'id') && patch.id !== id) || (Object.hasOwn(patch, 'personType') && patch.personType !== type) || (Object.hasOwn(patch, 'cnpj') && documentKey(patch.cnpj) !== documentKey(existing)) || (Object.hasOwn(patch, 'document') && documentKey(patch.document) !== documentKey(existing))) return { ok: false, error: 'O identificador, o tipo de pessoa e o CPF/CNPJ são imutáveis para preservar os vínculos e o histórico.' };
    const value = { ...copy(existing), ...patch, personType: type, cnpj: existing.cnpj, document: existing.document || existing.cnpj };
    const invalid = validateCompany(value, type);
    if (invalid) return { ok: false, error: invalid };
    const company = normalizedCompany(value, existing);
    state.companies[state.companies.indexOf(existing)] = company;
    audit('Cliente atualizado', `${company.name} · ${company.cnpj}`); persist();
    return { ok: true, company: copy(company) };
  }
  function actionButton(label, action, value = '', primary = false) {
    return `<button type="button" class="btn${primary ? ' btn-primary' : ''}" data-access-action="${action}" ${value ? `data-access-id="${h(value)}"` : ''}>${label}</button>`;
  }
  function statusLabel(account) { return account.status === 'active' ? pill('done', 'Ativo') : pill('wait', 'Inativo'); }
  function accountCompanyNames(account) { return state.companies.filter(company => account.companyIds.includes(company.id)).map(company => company.name); }
  function formatAuditDate(value) { return new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  function note() { return '<p class="access-note">Protótipo: vínculos salvos neste navegador.</p>'; }
  function auditHtml() {
    return state.audit.length ? `<ol class="access-audit-list">${state.audit.map(event => `<li><span class="access-audit-dot" aria-hidden="true"></span><div><strong>${h(event.action)}</strong><p>${h(event.detail)}</p><small>${h(formatAuditDate(event.date))} · ${h(event.actor)}</small></div></li>`).join('')}</ol>` : '<p class="access-empty">As alterações de acesso aparecerão aqui.</p>';
  }
  function renderUsers() {
    const team = [
      ['IJ', 'Isabela Jurado', 'Técnica / Qualidade', 'Administradora'],
      ['GD', 'Guilherme Damasio', 'Gestão', 'Administrador'],
      ['MR', 'Marcos Ribeiro', 'Laboratório', 'Técnico'],
      ['AC', 'Ana Paula Costa', 'Laboratório', 'Técnica']
    ];
    return `${heading('Usuários e auditoria', 'Gerencie quem consulta os dados de cada empresa.', actionButton('＋ Novo acesso de cliente', 'new-account', '', true))}
      <div class="access-guide"><span class="access-guide-icon" aria-hidden="true">♙</span><div><strong>Crie o acesso e escolha as empresas autorizadas</strong><p>Nome e e-mail → selecionar empresas → salvar → visualizar acesso.</p></div></div>
      <section class="panel access-panel"><div class="access-section-head"><div><h2>Equipe interna</h2><p>Perfis ilustrativos dos colaboradores da ANCAL</p></div><span class="access-caption">4 colaboradores</span></div><div class="access-team">${team.map(([short, name, area, role]) => `<div class="access-team-member"><span class="access-team-avatar">${short}</span><div><strong>${name}</strong><span>${area}</span><small>${role}</small></div></div>`).join('')}</div></section>
      <section class="panel table-panel access-panel"><div class="access-section-head"><div><h2>Acessos de cliente <span class="access-count">${state.accounts.length}</span></h2><p>Um usuário pode consultar mais de uma empresa vinculada.</p></div><input type="search" class="access-search" data-access-search="accounts" aria-label="Buscar acessos de cliente" placeholder="Buscar nome, e-mail ou empresa"></div><div class="table-scroll"><table class="access-table"><thead><tr><th>USUÁRIO / E-MAIL</th><th>EMPRESAS VINCULADAS</th><th>SITUAÇÃO</th><th>AÇÕES</th></tr></thead><tbody>${state.accounts.map(account => {
        const names = accountCompanyNames(account);
        return `<tr data-access-search-row="${h([account.name, account.email, ...names].join(' ').toLowerCase())}"><td><div class="access-user"><span class="access-team-avatar">${h(account.initials)}</span><div><strong>${h(account.name)}</strong><span>${h(account.email)}</span></div></div></td><td><div class="access-company-names">${names.length ? names.map(name => `<span>${h(name)}</span>`).join('') : '<span class="access-muted">Nenhuma empresa vinculada</span>'}</div></td><td>${statusLabel(account)}</td><td><div class="access-actions">${actionButton('Editar empresas', 'edit-account', account.id)}${actionButton('Visualizar acesso ↗', 'preview-account', account.id)}</div></td></tr>`;
      }).join('')}</tbody></table></div><p class="access-empty" data-access-empty hidden>Nenhum acesso corresponde à busca.</p></section>
      <section class="panel access-panel"><div class="access-section-head"><div><h2>Auditoria dos acessos</h2><p>Criações, alterações de vínculo e mudanças de situação · últimos 100 eventos</p></div><span class="access-local-badge">Registro local</span></div>${auditHtml()}</section>${note()}`;
  }
  function renderCompanies() {
    if (portalMode) return '';
    if (window.ancalCustomersWorkspace?.render) return window.ancalCustomersWorkspace.render();
    return `${heading('Clientes e empresas', 'Cadastre as empresas e gerencie seus acessos de consulta.', actionButton('＋ Nova empresa', 'new-company', '', true))}
      <section class="panel table-panel access-panel"><div class="access-section-head"><div><h2>Empresas cadastradas <span class="access-count">${state.companies.length}</span></h2><p>O CNPJ identifica os dados de cada empresa no portal.</p></div><input type="search" class="access-search" data-access-search="companies" aria-label="Buscar empresas" placeholder="Buscar empresa ou CNPJ"></div><div class="table-scroll"><table class="access-table"><thead><tr><th>EMPRESA / CNPJ</th><th>CIDADE</th><th>USUÁRIOS VINCULADOS</th><th>AÇÕES</th></tr></thead><tbody>${state.companies.map(company => {
        const linked = state.accounts.filter(account => account.companyIds.includes(company.id));
        return `<tr data-access-search-row="${h([company.name, company.cnpj, company.city].join(' ').toLowerCase())}"><td class="access-company-cell"><div class="expiry-client-name"><button type="button" class="access-text-button" data-access-action="company-details" data-access-id="${h(company.id)}" title="Ver cadastro do cliente">${h(company.name)}</button>${window.ancalExpiry?.badge(company.cnpj)||''}</div><span>${h(company.cnpj)}</span></td><td>${h(company.city || 'A informar')}</td><td><button type="button" class="access-text-button" data-access-action="company-users" data-access-id="${h(company.id)}">${linked.length} ${linked.length === 1 ? 'usuário' : 'usuários'}　→</button></td><td><div class="access-actions">${actionButton('Gerenciar acesso', 'company-users', company.id)}${actionButton('Criar acesso', 'new-account-for', company.id)}</div></td></tr>`;
      }).join('')}</tbody></table></div><p class="access-empty" data-access-empty hidden>Nenhuma empresa corresponde à busca.</p></section><div class="access-guide"><span class="access-guide-icon" aria-hidden="true">♧</span><div><strong>Empresa cadastrada, próximo passo: liberar o acesso</strong><p>Use Criar acesso para cadastrar o usuário com esta empresa já selecionada.</p></div></div>${note()}`;
  }
  function showError(form, message) {
    const error = form.querySelector('.access-form-error');
    if (error) { error.hidden = false; error.textContent = message; error.focus(); }
  }
  function selectedCount(form) {
    const count = form.querySelectorAll('input[name="companyIds"]:checked').length;
    const output = form.querySelector('.access-check-count');
    if (output) output.textContent = `${count} ${count === 1 ? 'empresa selecionada' : 'empresas selecionadas'}`;
  }
  function openAccount(id, preselectedCompanyId) {
    if (portalMode) return;
    const account = id ? state.accounts.find(item => item.id === id) : null;
    if (id && !account) return;
    const selected = new Set(account ? account.companyIds : state.companies.some(company => company.id === preselectedCompanyId) ? [preselectedCompanyId] : []);
    openModal(account ? 'Editar acesso de cliente' : 'Novo acesso de cliente', 'Informe o usuário e marque as empresas que ele poderá consultar.', `<form id="accessAccountForm" data-access-account-id="${h(account?.id || '')}">
      <div class="access-form-grid"><div class="access-field"><label for="accessAccountName">Nome do usuário</label><input id="accessAccountName" name="name" autocomplete="name" required maxlength="100" value="${h(account?.name || '')}" placeholder="Ex.: Marina Oliveira"></div><div class="access-field"><label for="accessAccountEmail">E-mail de acesso</label><input id="accessAccountEmail" name="email" type="email" autocomplete="email" required maxlength="160" value="${h(account?.email || '')}" placeholder="nome@empresa.com.br"></div></div>
      <fieldset class="access-company-fieldset"><legend>Empresas autorizadas</legend><div class="access-check-tools"><input type="search" id="accessCompanySearch" class="access-search" data-access-company-search aria-label="Buscar empresa na seleção" placeholder="Buscar nome ou CPF/CNPJ"><span class="access-check-count" aria-live="polite">${selected.size} ${selected.size === 1 ? 'empresa selecionada' : 'empresas selecionadas'}</span></div><div class="access-company-checklist">${state.companies.map(company => `<label class="access-company-option" for="access-company-${h(company.id)}" data-access-check-search="${h((company.name + ' ' + company.cnpj).toLowerCase())}"><input type="checkbox" name="companyIds" id="access-company-${h(company.id)}" value="${h(company.id)}" ${selected.has(company.id) ? 'checked' : ''}><span><strong>${h(company.name)}</strong><small>${h(company.cnpj)}</small></span></label>`).join('')}</div><p class="access-check-empty" hidden>Nenhuma empresa encontrada nesta busca.</p><p class="access-company-tip">Falta uma empresa? ${actionButton('Cadastre em Clientes →', 'companies-page')}</p></fieldset>
      ${account ? `<div class="access-field access-status-field"><label for="accessAccountStatus">Situação do acesso</label><select id="accessAccountStatus" name="status"><option value="active" ${account.status === 'active' ? 'selected' : ''}>Ativo</option><option value="inactive" ${account.status === 'inactive' ? 'selected' : ''}>Inativo</option></select><small>O acesso inativo mantém os vínculos selecionados e pode ser reativado.</small></div>` : '<input type="hidden" name="status" value="active">'}
      <p class="access-form-error" role="alert" tabindex="-1" hidden></p>${note()}<div class="modal-actions">${actionButton('Cancelar', 'close')}<button type="submit" class="btn btn-primary">Salvar acesso</button></div></form>`);
  }
  function openCompany(id) {
    if (portalMode) return;
    if (window.ancalCustomersWorkspace?.openForm) { window.ancalCustomersWorkspace.openForm(id); return; }
    openModal('Nova empresa', 'Cadastre a empresa para poder vinculá-la a um acesso de cliente.', `<form id="accessCompanyForm"><div class="access-field"><label for="accessCompanyName">Nome da empresa</label><input id="accessCompanyName" name="name" required maxlength="120" placeholder="Nome fantasia ou razão social"></div><div class="access-form-grid"><div class="access-field"><label for="accessCompanyCnpj">CNPJ</label><input id="accessCompanyCnpj" name="cnpj" required inputmode="numeric" maxlength="18" placeholder="00.000.000/0000-00"><small>Informe os 14 dígitos do CNPJ.</small></div><div class="access-field"><label for="accessCompanyCity">Cidade / UF</label><input id="accessCompanyCity" name="city" maxlength="100" placeholder="Ex.: Ribeirão Preto, SP"></div></div><p class="access-form-error" role="alert" tabindex="-1" hidden></p>${note()}<div class="modal-actions">${actionButton('Cancelar', 'close')}<button type="submit" class="btn btn-primary">Salvar empresa</button></div></form>`);
  }
  function companyDetails(id) {
    if(portalMode)return;
    if (window.ancalCustomersWorkspace?.showDetail) { window.ancalCustomersWorkspace.showDetail(id); return; }
    const company=state.companies.find(item=>item.id===id);
    if(!company)return;
    const alert=window.ancalExpiry?.banner(company.cnpj)||'<p class="access-empty">Nenhuma calibração vence no próximo mês.</p>';
    openModal('Cadastro do cliente',company.name,`<div class="record-detail"><div><span>Empresa</span><strong>${h(company.name)}</strong></div><div><span>CNPJ</span><strong>${h(company.cnpj)}</strong></div><div><span>Cidade / UF</span><strong>${h(company.city||'A informar')}</strong></div></div>${alert}<div class="modal-actions">${actionButton('Gerenciar acessos','company-users',company.id)}${actionButton('Fechar','close')}</div>`);
  }
  function companyUsers(id) {
    if (portalMode) return;
    const company = state.companies.find(item => item.id === id);
    if (!company) return;
    const linked = state.accounts.filter(account => account.companyIds.includes(id));
    openModal('Acessos vinculados à empresa', company.name + ' · ' + company.cnpj, `${linked.length ? `<ul class="access-linked-list">${linked.map(account => `<li><div><strong>${h(account.name)}</strong><span>${h(account.email)}</span></div>${statusLabel(account)}${actionButton('Editar', 'edit-account', account.id)}</li>`).join('')}</ul>` : '<p class="access-empty">Esta empresa ainda não possui usuários vinculados.</p>'}<div class="modal-actions">${actionButton('Fechar', 'close')}${actionButton('＋ Criar acesso', 'new-account-for', company.id, true)}</div>`);
  }
  function preview(id) {
    if (portalMode || !state.accounts.some(account => account.id === id)) return;
    state.previewAccountId = id;
    persist(); closeModal();
    window.ancalClient?.show();
  }
  function refresh(message) { closeModal(); render(); showToast(message); }
  function submitAccount(form) {
    if (portalMode || !form.reportValidity()) return;
    const data = new FormData(form);
    const id = form.dataset.accessAccountId;
    const existing = id ? state.accounts.find(account => account.id === id) : null;
    if (id && !existing) { showError(form, 'Este acesso não foi encontrado.'); return; }
    const name = String(data.get('name') || '').trim();
    const email = String(data.get('email') || '').trim();
    const companyIds = [...new Set(data.getAll('companyIds').map(String))];
    const status = String(data.get('status') || 'active');
    if (!name || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) { showError(form, 'Informe um nome e um e-mail válido.'); return; }
    if (state.accounts.some(account => account.id !== id && account.email.toLowerCase() === email.toLowerCase())) { showError(form, 'Este e-mail já está vinculado a outro acesso.'); return; }
    if (companyIds.some(companyId => !state.companies.some(company => company.id === companyId))) { showError(form, 'A seleção contém uma empresa inválida. Selecione novamente.'); return; }
    if (!existing && !companyIds.length) { showError(form, 'Selecione pelo menos uma empresa para criar o acesso.'); return; }
    if (!['active', 'inactive'].includes(status)) { showError(form, 'Selecione uma situação válida.'); return; }
    const account = { ...(existing ? copy(existing) : {}), id: existing?.id || uniqueId('cliente'), name, email, initials: initials(name), companyIds, status };
    if (!existing) {
      state.accounts.push(account);
      audit('Acesso criado', `${name} · ${email}`);
    } else {
      state.accounts[state.accounts.indexOf(existing)] = account;
      if (existing.name !== name || existing.email !== email) audit('Dados do acesso atualizados', `${name} · ${email}`);
      if (existing.status !== status) audit(status === 'inactive' ? 'Acesso inativado' : 'Acesso reativado', `${name} · ${email}`);
    }
    const previousIds = existing?.companyIds || [];
    companyIds.filter(companyId => !previousIds.includes(companyId)).forEach(companyId => audit('Empresa vinculada', `${name} → ${state.companies.find(company => company.id === companyId).name}`));
    previousIds.filter(companyId => !companyIds.includes(companyId)).forEach(companyId => audit('Vínculo removido', `${name} → ${state.companies.find(company => company.id === companyId)?.name || companyId}`));
    persist(); refresh(existing ? 'Acesso e empresas vinculadas atualizados.' : 'Acesso de cliente criado.');
  }
  function submitCompany(form) {
    if (form.hasAttribute?.('data-customer-workspace-form')) return;
    if (portalMode || !form.reportValidity()) return;
    const data = new FormData(form);
    const result = createCompany({ name: clean(data.get('name')), cnpj: clean(data.get('cnpj')), city: clean(data.get('city')) });
    if (!result.ok) { showError(form, result.error); return; }
    refresh('Empresa cadastrada. Agora ela pode ser vinculada a um acesso.');
  }

  document.addEventListener('click', event => {
    const control = event.target.closest('[data-access-action]');
    if (!control || portalMode) return;
    const id = control.dataset.accessId;
    switch (control.dataset.accessAction) {
      case 'new-account': openAccount(); break;
      case 'new-account-for': if (state.companies.some(company => company.id === id)) openAccount(null, id); break;
      case 'edit-account': openAccount(id); break;
      case 'new-company': openCompany(); break;
      case 'company-users': companyUsers(id); break;
      case 'company-details': companyDetails(id); break;
      case 'preview-account': preview(id); break;
      case 'companies-page': closeModal(); currentPage = 'clientes'; render(); break;
      case 'close': closeModal(); break;
    }
  });
  document.addEventListener('submit', event => {
    if (!['accessAccountForm', 'accessCompanyForm'].includes(event.target.id)) return;
    if (event.target.hasAttribute?.('data-customer-workspace-form')) return;
    event.preventDefault();
    if (portalMode) return;
    if (event.target.id === 'accessAccountForm') submitAccount(event.target); else submitCompany(event.target);
  });
  document.addEventListener('input', event => {
    if (portalMode) return;
    if (event.target.matches('[data-access-search]')) {
      const panel = event.target.closest('.access-panel');
      if (!panel) return;
      const query = event.target.value.trim().toLowerCase();
      let found = 0;
      panel.querySelectorAll('[data-access-search-row]').forEach(row => { row.hidden = !row.dataset.accessSearchRow.includes(query); if (!row.hidden) found++; });
      const empty = panel.querySelector('[data-access-empty]');
      if (empty) empty.hidden = found !== 0;
    }
    if (event.target.matches('[data-access-company-search]')) {
      const form = event.target.closest('#accessAccountForm');
      if (!form) return;
      const query = event.target.value.trim().toLowerCase();
      let found = 0;
      form.querySelectorAll('[data-access-check-search]').forEach(option => { option.hidden = !option.dataset.accessCheckSearch.includes(query); if (!option.hidden) found++; });
      const empty = form.querySelector('.access-check-empty');
      if (empty) empty.hidden = found !== 0;
    }
  });
  document.addEventListener('change', event => {
    if (portalMode || !event.target.matches('input[name="companyIds"]')) return;
    const form = event.target.closest('#accessAccountForm');
    if (form) selectedCount(form);
  });

  load(); syncLegacyClients();
  window.ancalAccess = { getCompanies, getCompany, createCompany, updateCompany, getAccounts, getAccount, getPreviewAccount, getAllowedCompanies, renderUsers, renderCompanies, openAccount, companyUsers };
})();
