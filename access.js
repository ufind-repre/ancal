(function () {
  'use strict';

  const storageKey = 'ancal-access-v1';
  const seedIds = ['hospital-sao-lucas', 'lab-biocenter', 'industria-nutribem', 'farmacia-central', 'universidade-unaerp'];
  const copy = value => JSON.parse(JSON.stringify(value));
  const h = value => escapeHtml(value);
  const digits = value => String(value || '').replace(/\D/g, '');
  const initials = name => String(name).trim().split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase();
  const uniqueId = prefix => prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  const formatCnpj = value => digits(value).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
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
        if (!company || !validId(company.id) || typeof company.name !== 'string' || !company.name.trim() || digits(company.cnpj).length !== 14 || companyIds.has(company.id) || cnpjs.has(digits(company.cnpj))) return false;
        companyIds.add(company.id); cnpjs.add(digits(company.cnpj)); return true;
      }).map(company => ({ id: company.id, name: company.name.trim(), cnpj: formatCnpj(company.cnpj), city: String(company.city || '') }));
      const accountIds = new Set(), emails = new Set();
      const accounts = saved.accounts.filter(account => {
        if (!account || !validId(account.id) || typeof account.name !== 'string' || !account.name.trim() || typeof account.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.email.trim()) || accountIds.has(account.id) || emails.has(account.email.trim().toLowerCase())) return false;
        accountIds.add(account.id); emails.add(account.email.trim().toLowerCase()); return true;
      }).map(account => ({
        id: account.id, name: account.name.trim(), email: account.email.trim(), initials: initials(account.name),
        companyIds: [...new Set((Array.isArray(account.companyIds) ? account.companyIds : []).filter(id => companyIds.has(id)))],
        status: account.status === 'inactive' ? 'inactive' : 'active'
      }));
      if (!companies.length || !accounts.length) return;
      state = {
        companies, accounts,
        previewAccountId: accounts.some(account => account.id === saved.previewAccountId) ? saved.previewAccountId : accounts[0].id,
        audit: (Array.isArray(saved.audit) ? saved.audit : []).filter(event => event && typeof event.action === 'string' && typeof event.detail === 'string' && !Number.isNaN(new Date(event.date).getTime())).slice(0, 100).map(event => ({ id: String(event.id || uniqueId('evento')), date: event.date, actor: 'Isabela Jurado', action: event.action, detail: event.detail }))
      };
    } catch (_) { /* Keep the seed when the saved prototype data cannot be read. */ }
  }

  function syncLegacyClients() {
    state.companies.forEach(company => {
      if (!clients.some(client => digits(client[1]) === digits(company.cnpj))) clients.push([company.name, company.cnpj, '0', '0', 'Ativo']);
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
  function getCompanies() { return copy(state.companies); }
  function getAccounts() { return copy(state.accounts); }
  function getAccount(id) { const account = state.accounts.find(item => item.id === id); return account ? copy(account) : null; }
  function getPreviewAccount() { return getAccount(state.previewAccountId) || (state.accounts[0] ? copy(state.accounts[0]) : null); }
  function getAllowedCompanies(accountId) {
    const account = state.accounts.find(item => item.id === accountId);
    return account?.status === 'active' ? copy(state.companies.filter(company => account.companyIds.includes(company.id))) : [];
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
    return `${heading('Clientes e empresas', 'Cadastre as empresas e gerencie seus acessos de consulta.', actionButton('＋ Nova empresa', 'new-company', '', true))}
      <section class="panel table-panel access-panel"><div class="access-section-head"><div><h2>Empresas cadastradas <span class="access-count">${state.companies.length}</span></h2><p>O CNPJ identifica os dados de cada empresa no portal.</p></div><input type="search" class="access-search" data-access-search="companies" aria-label="Buscar empresas" placeholder="Buscar empresa ou CNPJ"></div><div class="table-scroll"><table class="access-table"><thead><tr><th>EMPRESA / CNPJ</th><th>CIDADE</th><th>USUÁRIOS VINCULADOS</th><th>AÇÕES</th></tr></thead><tbody>${state.companies.map(company => {
        const linked = state.accounts.filter(account => account.companyIds.includes(company.id));
        return `<tr data-access-search-row="${h([company.name, company.cnpj, company.city].join(' ').toLowerCase())}"><td class="access-company-cell"><strong>${h(company.name)}</strong><span>${h(company.cnpj)}</span></td><td>${h(company.city || 'A informar')}</td><td><button type="button" class="access-text-button" data-access-action="company-users" data-access-id="${h(company.id)}">${linked.length} ${linked.length === 1 ? 'usuário' : 'usuários'}　→</button></td><td><div class="access-actions">${actionButton('Gerenciar acesso', 'company-users', company.id)}${actionButton('Criar acesso', 'new-account-for', company.id)}</div></td></tr>`;
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
      <fieldset class="access-company-fieldset"><legend>Empresas autorizadas</legend><div class="access-check-tools"><input type="search" id="accessCompanySearch" class="access-search" data-access-company-search aria-label="Buscar empresa na seleção" placeholder="Buscar nome ou CNPJ"><span class="access-check-count" aria-live="polite">${selected.size} ${selected.size === 1 ? 'empresa selecionada' : 'empresas selecionadas'}</span></div><div class="access-company-checklist">${state.companies.map(company => `<label class="access-company-option" for="access-company-${h(company.id)}" data-access-check-search="${h((company.name + ' ' + company.cnpj).toLowerCase())}"><input type="checkbox" name="companyIds" id="access-company-${h(company.id)}" value="${h(company.id)}" ${selected.has(company.id) ? 'checked' : ''}><span><strong>${h(company.name)}</strong><small>${h(company.cnpj)}</small></span></label>`).join('')}</div><p class="access-check-empty" hidden>Nenhuma empresa encontrada nesta busca.</p><p class="access-company-tip">Falta uma empresa? ${actionButton('Cadastre em Clientes →', 'companies-page')}</p></fieldset>
      ${account ? `<div class="access-field access-status-field"><label for="accessAccountStatus">Situação do acesso</label><select id="accessAccountStatus" name="status"><option value="active" ${account.status === 'active' ? 'selected' : ''}>Ativo</option><option value="inactive" ${account.status === 'inactive' ? 'selected' : ''}>Inativo</option></select><small>O acesso inativo mantém os vínculos selecionados e pode ser reativado.</small></div>` : '<input type="hidden" name="status" value="active">'}
      <p class="access-form-error" role="alert" tabindex="-1" hidden></p>${note()}<div class="modal-actions">${actionButton('Cancelar', 'close')}<button type="submit" class="btn btn-primary">Salvar acesso</button></div></form>`);
  }
  function openCompany() {
    if (portalMode) return;
    openModal('Nova empresa', 'Cadastre a empresa para poder vinculá-la a um acesso de cliente.', `<form id="accessCompanyForm"><div class="access-field"><label for="accessCompanyName">Nome da empresa</label><input id="accessCompanyName" name="name" required maxlength="120" placeholder="Nome fantasia ou razão social"></div><div class="access-form-grid"><div class="access-field"><label for="accessCompanyCnpj">CNPJ</label><input id="accessCompanyCnpj" name="cnpj" required inputmode="numeric" maxlength="18" placeholder="00.000.000/0000-00"><small>Informe os 14 dígitos do CNPJ.</small></div><div class="access-field"><label for="accessCompanyCity">Cidade / UF</label><input id="accessCompanyCity" name="city" maxlength="100" placeholder="Ex.: Ribeirão Preto, SP"></div></div><p class="access-form-error" role="alert" tabindex="-1" hidden></p>${note()}<div class="modal-actions">${actionButton('Cancelar', 'close')}<button type="submit" class="btn btn-primary">Salvar empresa</button></div></form>`);
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
    const account = { id: existing?.id || uniqueId('cliente'), name, email, initials: initials(name), companyIds, status };
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
    if (portalMode || !form.reportValidity()) return;
    const data = new FormData(form);
    const name = String(data.get('name') || '').trim(), cnpj = digits(data.get('cnpj')), city = String(data.get('city') || '').trim();
    if (!name || name.length > 120) { showError(form, 'Informe o nome da empresa.'); return; }
    if (cnpj.length !== 14) { showError(form, 'O CNPJ deve conter 14 dígitos.'); return; }
    if (state.companies.some(company => digits(company.cnpj) === cnpj)) { showError(form, 'Já existe uma empresa cadastrada com este CNPJ.'); return; }
    if (city.length > 100) { showError(form, 'Informe uma cidade com até 100 caracteres.'); return; }
    const company = { id: uniqueId('empresa'), name, cnpj: formatCnpj(cnpj), city };
    state.companies.push(company);
    syncLegacyClients(); audit('Empresa cadastrada', `${name} · ${company.cnpj}`); persist();
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
      case 'preview-account': preview(id); break;
      case 'companies-page': closeModal(); currentPage = 'clientes'; render(); break;
      case 'close': closeModal(); break;
    }
  });
  document.addEventListener('submit', event => {
    if (!['accessAccountForm', 'accessCompanyForm'].includes(event.target.id)) return;
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
  window.ancalAccess = { getCompanies, getAccounts, getAccount, getPreviewAccount, getAllowedCompanies, renderUsers, renderCompanies };
})();
