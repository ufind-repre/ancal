(function () {
  'use strict';

  let clientAccount = null;
  let companies = [];
  let profile = null;
  const companyStorageKey = () => 'ancal-client-company-' + (clientAccount?.id || 'sem-acesso');
  function refreshAccess() {
    const previousAccountId = clientAccount?.id;
    const previousCompanyId = profile?.id;
    clientAccount = window.ancalAccess.getPreviewAccount();
    companies = clientAccount ? window.ancalAccess.getAllowedCompanies(clientAccount.id) : [];
    let savedCompany;
    try { savedCompany = localStorage.getItem(companyStorageKey()); } catch (_) {}
    const sameAccount = previousAccountId === clientAccount?.id;
    profile = companies.find(company => company.id === (sameAccount ? previousCompanyId : savedCompany))
      || companies.find(company => company.id === savedCompany) || companies[0] || null;
    if (!sameAccount) clientPage = 'overview';
  }
  const pages = {
    overview: ['Meu painel', 'Acompanhe seus serviços e encontre os documentos de que precisa.'],
    services: ['Meus serviços', 'Consulte o andamento, os prazos e as etapas de cada serviço.'],
    equipment: ['Meus equipamentos', 'Identificação, próxima calibração e histórico dos seus instrumentos.'],
    calibrations: ['Minhas calibrações', 'Acompanhe as calibrações e a disponibilização dos documentos técnicos.'],
    certificates: ['Meus certificados', 'Consulte e baixe os certificados liberados para a sua empresa.']
  };
  let clientPage = 'overview';

  // Histórico fictício: os documentos liberados não dependem de OS ainda em revisão.
  const history = [
    { id: 'OS-2026-071', client: 'Hospital São Lucas', cnpj: '12.345.678/0001-90', equipment: 'Balança analítica', tag: 'BAL-024', serial: 'AS220 · 9234K120', tech: 'Marcos Ribeiro', service: 'Calibração', due: '16 out, 2026', completedISO: '2026-10-16', status: 'Concluída', type: 'done', certificateId: 'CERT-2026-2031' },
    { id: 'OS-2026-064', client: 'Hospital São Lucas', cnpj: '12.345.678/0001-90', equipment: 'Autoclave vertical', tag: 'AUTO-012', serial: 'Phoenix AV-75 · 12088', tech: 'Isabela Jurado', service: 'Qualificação térmica', due: '12 out, 2026', completedISO: '2026-10-12', status: 'Concluída', type: 'done', certificateId: 'CERT-2026-2018' },
    { id: 'OS-2026-048', client: 'Hospital São Lucas', cnpj: '12.345.678/0001-90', equipment: 'Termômetro digital', tag: 'TERM-045', serial: 'Incoterm 7666 · T2045', tech: 'Ana Paula Costa', service: 'Calibração', due: '28 set, 2026', completedISO: '2026-09-28', status: 'Concluída', type: 'done', certificateId: 'CERT-2026-1985' },
    { id: 'OS-2026-070', client: 'Lab. Biocenter', cnpj: '45.890.123/0001-17', equipment: 'Pipeta monocanal', tag: 'PIP-118', serial: 'Eppendorf · 6H19021', tech: 'Marcos Ribeiro', service: 'Calibração', due: '15 out, 2026', completedISO: '2026-10-15', status: 'Concluída', type: 'done', certificateId: 'CERT-2026-2028' },
    { id: 'OS-2026-055', client: 'Lab. Biocenter', cnpj: '45.890.123/0001-17', equipment: 'Centrífuga de bancada', tag: 'CENT-018', serial: 'Fanem 280 · F280018', tech: 'Ana Paula Costa', service: 'Calibração', due: '27 set, 2026', completedISO: '2026-09-27', status: 'Concluída', type: 'done', certificateId: 'CERT-2026-1992' }
  ];
  const equipmentInfo = {
    '12.345.678/0001-90': {
      'BAL-024': { manufacturer: 'Sartorius', next: '2027-10-16', area: 'Laboratório de análises' },
      'AUTO-012': { manufacturer: 'Phoenix', next: '2027-10-12', area: 'Central de esterilização' },
      'TERM-045': { manufacturer: 'Incoterm', next: '2027-03-28', area: 'Laboratório de análises' }
    },
    '45.890.123/0001-17': {
      'PIP-118': { manufacturer: 'Eppendorf', next: '2027-10-15', area: 'Setor de análises clínicas' },
      'CENT-018': { manufacturer: 'Fanem', next: '2027-09-27', area: 'Setor de hematologia' }
    }
  };
  const h = value => escapeHtml(value);
  const own = record => !!profile && !!clientAccount && clientAccount.status === 'active'
    && window.ancalAccess.getAllowedCompanies(clientAccount.id).some(company => company.id === profile.id && company.cnpj === record.cnpj);
  const isReleased = record => record.type === 'done' || record.certificateReleased === true;
  const services = () => [...records, ...history.filter(item => !records.some(record => record.id === item.id && record.cnpj === item.cnpj))].filter(own);
  const instrumentInfo = tag => equipmentInfo[profile?.cnpj]?.[tag] || {};
  const documents = () => services().filter(isReleased);
  const calibrations = () => services().filter(record => (record.service || 'Calibração') !== 'Manutenção');
  const instruments = () => [...new Map(services().map(record => [record.tag, record]).reverse()).values()];
  const serviceKind = record => record.service || 'Calibração';
  const documentId = record => record.certificateId || record.id.replace('OS-', 'CERT-');
  const calibrationId = record => record.id.replace('OS-', 'CAL-');
  function formatDate(iso) {
    if (!iso) return 'A definir';
    const date = new Date(iso + 'T12:00:00');
    return Number.isNaN(date.getTime()) ? 'A definir' : date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function meta(record) {
    const query = [record.id, record.equipment, record.tag, record.serial, documentId(record), calibrationId(record)].join(' ').toLowerCase();
    return `data-search="${h(query)}" data-period="${h((record.completedISO || '').slice(0, 7))}"`;
  }
  function clientButton(text, attribute, value, primary = false) {
    return `<button type="button" class="btn${primary ? ' btn-primary' : ''}" ${attribute}="${h(value)}">${text}</button>`;
  }
  function table(title, subtitle, headers, rows, options = {}) {
    const statusOptions = [...new Set((options.records || []).map(record => record.status))];
    const periods = [...new Set(documents().map(record => record.completedISO?.slice(0, 7)).filter(Boolean))].sort().reverse();
    const statusSelect = options.status ? `<select class="filter-btn client-filter status-filter" aria-label="Filtrar por status"><option value="">Todos os status</option>${statusOptions.map(status => `<option>${h(status)}</option>`).join('')}</select>` : '';
    const periodSelect = options.period ? `<select class="filter-btn client-filter period-filter" aria-label="Filtrar certificados por período"><option value="">Todos os períodos</option>${periods.map(period => `<option value="${h(period)}">${h(new Date(period + '-01T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))}</option>`).join('')}</select>` : '';
    return `<section class="panel table-panel client-table"><div class="panel-heading"><div><h2>${title}</h2><p>${subtitle}</p></div><div class="table-tools"><input class="search client-search" aria-label="Buscar em ${title.toLowerCase()}" placeholder="⌕ Buscar instrumento ou OS">${statusSelect}${periodSelect}</div></div><div class="table-scroll"><table><thead><tr>${headers.map(header => `<th scope="col">${header}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table><div class="empty-state client-empty" ${rows ? 'hidden' : ''}><span class="empty-icon">⌕</span><strong>Nenhum registro encontrado</strong><span>Altere a busca ou os filtros para consultar outros registros.</span></div></div></section>`;
  }
  function serviceRows(items) {
    return items.map(record => `<tr ${meta(record)}><td class="os-id">${h(record.id)}</td><td class="client-cell"><strong>${h(record.equipment)}</strong><span>${h(record.tag)} · ${h(serviceKind(record))}</span></td><td>${h(record.due)}</td><td>${pill(record.type, record.status)}</td><td>${clientButton('Acompanhar →', 'data-client-service', record.id)}</td></tr>`).join('');
  }
  function summary() {
    const active = services().filter(record => record.type !== 'done');
    const calibrationActive = calibrations().filter(record => record.type !== 'done');
    const cards = [
      ['services', '▤', active.length, 'Serviços em andamento', 'Veja cada etapa do atendimento'],
      ['equipment', '◉', instruments().length, 'Equipamentos cadastrados', 'Consulte o histórico técnico'],
      ['calibrations', '⌁', calibrationActive.length, 'Calibrações em andamento', 'Acompanhe a execução e revisão'],
      ['certificates', '▧', documents().length, 'Certificados disponíveis', 'Documentos prontos para baixar']
    ];
    return `<section class="client-summary" aria-label="Resumo da sua empresa">${cards.map(([page, icon, count, label, foot]) => `<button type="button" class="client-summary-card" data-client-page="${page}"><span class="client-summary-icon">${icon}</span><strong>${String(count).padStart(2, '0')}</strong><span class="client-summary-label">${label}</span><small>${foot}　→</small></button>`).join('')}</section>`;
  }
  function overview() {
    const active = services().filter(record => record.type !== 'done');
    return `<section class="client-hero"><div><div class="client-eyebrow">BEM-VINDO À SUA ÁREA</div><h2 class="client-hero-title">${h(profile.name)}</h2><p>CNPJ ${h(profile.cnpj)} <span aria-hidden="true">·</span> ${h(profile.city)}</p></div><div class="client-hero-actions"><span class="client-hero-badge">Empresa selecionada</span><button type="button" class="btn" data-client-change-company>Trocar empresa ⇄</button></div></section>${summary()}<div class="client-grid"><div>${table('Serviços em andamento', 'O que a ANCAL está realizando para a sua empresa', ['ORDEM DE SERVIÇO', 'EQUIPAMENTO', 'PRAZO PREVISTO', 'STATUS', ''], serviceRows(active))}<div class="client-section-head"><button class="text-link" data-client-page="services">Consultar todos os serviços →</button></div><section class="panel client-callout"><div class="client-section-head"><div><h2>Seus documentos, sempre à mão</h2><p>Certificados liberados para consulta e download.</p></div><span class="stat-icon green">▧</span></div><p>${documents().length} documentos estão disponíveis para a sua empresa.</p>${clientButton('Consultar certificados →', 'data-client-page', 'certificates', true)}</section></div><aside class="panel"><div class="panel-heading"><div><h2>Últimas atualizações</h2><p>A movimentação dos seus serviços</p></div></div><ul class="client-list">${active.slice(0, 2).map(record => `<li class="client-update"><div><strong>${h(record.status)}</strong><p>${h(record.equipment)} · ${h(record.id)}</p><button class="text-link" data-client-service="${h(record.id)}">Ver andamento →</button></div></li>`).join('')}${documents().slice(0, 2).map(record => `<li class="client-update"><div><strong>Certificado disponível</strong><p>${h(record.equipment)} · ${h(record.tag)}</p><small>${formatDate(record.completedISO)}</small><br><button class="text-link" data-client-certificate="${h(record.id)}">Consultar documento →</button></div></li>`).join('')}</ul></aside></div>`;
  }
  function servicesPage() {
    const items = services();
    return table('Histórico de serviços', `${items.length} ordens vinculadas à sua empresa`, ['ORDEM DE SERVIÇO', 'EQUIPAMENTO / SERVIÇO', 'PRAZO / CONCLUSÃO', 'STATUS', 'ACOMPANHAMENTO'], serviceRows(items), { status: true, records: items });
  }
  function equipmentPage() {
    const rows = instruments().map(record => {
      const info = instrumentInfo(record.tag);
      const busy = services().some(item => item.tag === record.tag && item.type !== 'done');
      return `<tr ${meta(record)}><td class="os-id">${h(record.tag)}</td><td class="client-cell"><strong>${h(record.equipment)}</strong><span>${h(info.manufacturer || 'A informar')}</span></td><td>${h(record.serial)}</td><td>${formatDate(info.next)}</td><td>${pill(busy ? 'progress' : 'done', busy ? 'Em serviço' : 'Ativo')}</td><td>${clientButton('Ver histórico →', 'data-client-equipment', record.tag)}</td></tr>`;
    }).join('');
    return table('Seus equipamentos', 'Identificação e histórico dos instrumentos cadastrados', ['IDENTIFICAÇÃO', 'EQUIPAMENTO', 'MODELO / Nº SÉRIE', 'PRÓXIMA CALIBRAÇÃO', 'SITUAÇÃO', ''], rows);
  }
  function calibrationsPage() {
    const items = calibrations();
    const rows = items.map(record => `<tr ${meta(record)}><td class="os-id">${h(calibrationId(record))}</td><td class="client-cell"><strong>${h(record.equipment)}</strong><span>${h(record.tag)} · ${h(serviceKind(record))}</span></td><td>${h(record.id)}</td><td>${h(record.due)}</td><td>${pill(record.type, record.status)}</td><td>${clientButton('Ver calibração →', 'data-client-calibration', record.id)}</td></tr>`).join('');
    return table('Registros de calibração', 'Acompanhe os procedimentos vinculados aos seus equipamentos', ['REGISTRO', 'INSTRUMENTO / PROCEDIMENTO', 'ORDEM DE SERVIÇO', 'DATA PREVISTA / CONCLUSÃO', 'STATUS', ''], rows, { status: true, records: items });
  }
  function certificatesPage() {
    const rows = documents().map(record => `<tr ${meta(record)}><td><div class="certificate-card"><div class="pdf-icon">PDF</div><div><strong>${h(documentId(record))}</strong><span>${h(serviceKind(record))}</span></div></div></td><td class="client-cell"><strong>${h(record.equipment)}</strong><span>${h(record.tag)}</span></td><td>${formatDate(record.completedISO)}</td><td>${pill('done', 'Disponível')}</td><td>${clientButton('Detalhes', 'data-client-certificate', record.id)} ${clientButton('⇩ Baixar PDF', 'data-client-download', record.id, true)}</td></tr>`).join('');
    return table('Certificados disponíveis', 'Documentos liberados pela ANCAL para a sua empresa', ['DOCUMENTO', 'EQUIPAMENTO', 'EMISSÃO', 'SITUAÇÃO', 'AÇÕES'], rows, { period: true });
  }
  function companyBanner() {
    return `<section class="client-company-banner" aria-label="Empresa selecionada"><div class="client-company-banner-copy"><span class="client-company-banner-tag">EMPRESA EM CONSULTA</span><strong>${h(profile.name)}</strong><span>CNPJ ${h(profile.cnpj)}</span></div><button type="button" class="btn" data-client-change-company>Trocar empresa ⇄</button></section>`;
  }
  function renderClient() {
    if (!profile) {
      const inactive = clientAccount?.status === 'inactive';
      app.innerHTML = `<header class="client-heading"><div><div class="client-eyebrow">ÁREA DO CLIENTE</div><h1 tabindex="-1">${inactive ? 'Acesso inativo' : 'Nenhuma empresa vinculada'}</h1><p>${inactive ? 'Este acesso foi inativado pela administração da ANCAL.' : 'Não há empresas disponíveis para consulta neste acesso.'}</p></div></header><section class="panel client-empty"><strong>${h(clientAccount?.name || 'Acesso do cliente')}</strong><p>${inactive ? 'Entre em contato com a ANCAL para verificar a reativação do seu acesso.' : 'A ANCAL precisa vincular uma empresa a este usuário antes de liberar as consultas.'}</p></section>`;
      syncShell();
      window.scrollTo(0, 0);
      return;
    }
    const [title, description] = pages[clientPage];
    const tabs = `<nav class="client-tabs" aria-label="Consultas do cliente">${Object.entries(pages).map(([page, values]) => `<button type="button" data-client-page="${page}" class="${page === clientPage ? 'active' : ''}" ${page === clientPage ? 'aria-current="page"' : ''}>${values[0]}</button>`).join('')}</nav>`;
    const view = { overview, services: servicesPage, equipment: equipmentPage, calibrations: calibrationsPage, certificates: certificatesPage }[clientPage];
    app.innerHTML = `<header class="client-heading"><div><div class="client-eyebrow">ÁREA DO CLIENTE</div><h1 tabindex="-1">${title}</h1><p>${description}</p></div><span class="pill pill-done">Acesso de consulta</span></header>${clientPage === 'overview' ? '' : companyBanner()}${tabs}${view()}<p class="demo-note">Demonstração com dados fictícios. Os registros apresentados pertencem ao ${h(profile.name)}.</p>`;
    syncShell();
    window.scrollTo(0, 0);
  }
  function syncShell() {
    document.body.classList.toggle('client-mode', portalMode);
    $('#internalNavigation').hidden = portalMode;
    $('#clientNavigation').hidden = !portalMode || !profile;
    $('#perspectiveLabel').textContent = portalMode ? 'visão cliente' : 'visão geral';
    $('#perspectiveNote').textContent = portalMode ? `${companies.length} ${companies.length === 1 ? 'empresa disponível' : 'empresas disponíveis'} para ${clientAccount?.name || 'este acesso'}.` : 'Alterne para conhecer a área do cliente.';
    document.querySelectorAll('[data-view]').forEach(control => {
      const selected = (control.dataset.view === 'client') === portalMode;
      control.classList.toggle('is-selected', selected);
      control.setAttribute('aria-pressed', String(selected));
    });
    document.querySelectorAll('#clientNavigation [data-client-page]').forEach(control => {
      const active = portalMode && control.dataset.clientPage === clientPage;
      control.classList.toggle('active', active);
      if (active) control.setAttribute('aria-current', 'page'); else control.removeAttribute('aria-current');
    });
    $('.workspace-label').textContent = portalMode ? 'EMPRESAS DO CLIENTE' : 'ESPAÇO DE TRABALHO';
    $('.lab-select').hidden = portalMode;
    $('#clientCompanyContext').hidden = !portalMode;
    const companySelect = $('#clientCompanySelect');
    companySelect.innerHTML = companies.length ? companies.map(company => `<option value="${h(company.id)}">${h(company.name)} · ${h(company.cnpj)}</option>`).join('') : '<option value="">Nenhuma empresa disponível</option>';
    companySelect.value = profile?.id || '';
    companySelect.disabled = companies.length === 0;
    $('#clientCompanyCnpj').textContent = profile ? 'CNPJ ' + profile.cnpj : 'Sem empresa em consulta';
    $('#clientCompanyHelp').textContent = `${companies.length} ${companies.length === 1 ? 'empresa vinculada' : 'empresas vinculadas'} ao seu acesso`;
    $('.lab-select > span:nth-child(2)').textContent = portalMode ? profile?.name || 'Sem empresa vinculada' : 'Laboratório ANCAL';
    $('.user-info strong').textContent = portalMode ? clientAccount?.name || 'Cliente' : 'Isabela Jurado';
    $('.user-info > span').textContent = portalMode ? 'Acesso a ' + companies.length + ' empresas' : 'Área técnica';
    $('.avatar').textContent = portalMode ? clientAccount?.initials || 'CL' : 'IJ';
    $('.top-avatar').textContent = portalMode ? clientAccount?.initials || 'CL' : 'IJ';
    $('.cloud-card').hidden = portalMode;
    if (portalMode) $('#crumb').textContent = profile ? 'Área do cliente / ' + pages[clientPage][0] : 'Área do cliente / Acesso';
    document.title = portalMode ? 'ANCAL | Área do cliente' : 'ANCAL | Gestão Metrológica';
  }
  function show() {
    closeModal();
    refreshAccess();
    portalMode = true;
    renderClient();
    closeNav();
  }
  function leave() {
    closeModal();
    portalMode = false;
    render();
    closeNav();
  }
  function navigate(page) {
    if (!pages[page] || !portalMode) return;
    clientPage = page;
    closeModal();
    renderClient();
    closeNav();
    app.querySelector('h1')?.focus({ preventScroll: true });
  }
  function switchCompany(id) {
    if (!portalMode) return;
    const selected = window.ancalAccess.getAllowedCompanies(clientAccount?.id).find(company => company.id === id);
    if (!selected) { $('#clientCompanySelect').value = profile?.id || ''; return; }
    closeModal();
    profile = selected;
    try { localStorage.setItem(companyStorageKey(), selected.id); } catch (_) { /* Seleção continua válida nesta sessão. */ }
    renderClient();
    closeNav();
    app.querySelector('h1')?.focus({ preventScroll: true });
    showToast('Visualizando: ' + profile.name);
  }
  function focusCompanySelector() {
    $('#sidebar').classList.add('open');
    $('#scrim').classList.add('show');
    $('#clientCompanySelect').focus();
  }
  function findService(id) { return services().find(record => record.id === id); }
  function detailField(label, value) { return `<div><span>${label}</span><strong>${h(value)}</strong></div>`; }
  function progress(record) {
    const stage = { wait: 0, progress: 1, review: 2, done: 3 }[record.type] ?? 0;
    const labels = [['Recebimento', 'Solicitação registrada'], ['Execução', 'Procedimento técnico'], ['Revisão', 'Validação da equipe'], ['Certificado', 'Documento liberado']];
    return `<ol class="client-progress" aria-label="Etapas do serviço">${labels.map(([title, note], i) => `<li class="${record.type === 'done' || i < stage ? 'complete' : i === stage ? 'current' : ''}"><span class="step-dot">${record.type === 'done' || i < stage ? '✓' : i + 1}</span><strong>${title}</strong><small>${note}</small><small>${record.type === 'done' || i < stage ? 'Concluído' : i === stage ? 'Etapa atual' : 'Pendente'}</small></li>`).join('')}</ol>`;
  }
  function serviceDetail(id) {
    const record = findService(id);
    if (!record) return;
    openModal(record.id, 'Acompanhamento do seu serviço', `${pill(record.type, record.status)}${progress(record)}<div class="client-detail-grid">${detailField('Equipamento', record.equipment)}${detailField('Identificação', record.tag)}${detailField('Tipo de serviço', serviceKind(record))}${detailField(record.type === 'done' ? 'Conclusão' : 'Prazo previsto', record.due)}</div><div class="modal-actions">${clientButton('Ver equipamento', 'data-client-equipment', record.tag)}${calibrations().some(item => item.id === record.id) ? clientButton('Ver calibração', 'data-client-calibration', record.id) : ''}${isReleased(record) ? clientButton('⇩ Certificado', 'data-client-download', record.id, true) : ''}</div>`);
  }
  function equipmentDetail(tag) {
    const record = instruments().find(item => item.tag === tag);
    if (!record) return;
    const info = instrumentInfo(tag);
    const related = services().filter(item => item.tag === tag);
    openModal(record.equipment, `Identificação: ${tag}`, `<div class="client-detail-grid">${detailField('Modelo / nº série', record.serial)}${detailField('Fabricante', info.manufacturer || 'A informar')}${detailField('Localização', info.area || 'A informar')}${detailField('Próxima calibração', formatDate(info.next))}</div><h3 class="client-equipment-title">Histórico de serviços</h3><ul class="client-list">${related.map(item => `<li class="client-update"><div><strong>${h(item.id)} · ${h(serviceKind(item))}</strong><p>${h(item.due)} · ${h(item.status)}</p><button class="text-link" data-client-service="${h(item.id)}">Acompanhar serviço →</button></div></li>`).join('')}</ul>`);
  }
  function calibrationDetail(id) {
    const record = calibrations().find(item => item.id === id);
    if (!record) return;
    openModal(calibrationId(record), 'Consulta do procedimento técnico', `${pill(record.type, record.status)}<div class="client-detail-grid">${detailField('Instrumento', record.equipment + ' · ' + record.tag)}${detailField('Procedimento', serviceKind(record))}${detailField('OS vinculada', record.id)}${detailField(record.type === 'done' ? 'Concluída em' : 'Prazo previsto', record.due)}</div><div class="client-detail-note">${isReleased(record) ? 'Procedimento concluído. O documento está disponível para consulta e download.' : 'O documento será disponibilizado após a conclusão e a revisão técnica do serviço.'}</div><div class="modal-actions">${clientButton('Ver serviço', 'data-client-service', record.id)}${isReleased(record) ? clientButton('⇩ Baixar certificado', 'data-client-download', record.id, true) : ''}</div>`);
  }
  function certificateDetail(id) {
    const record = documents().find(item => item.id === id);
    if (!record) return;
    openModal(documentId(record), 'Documento liberado para a sua empresa', `${pill('done', 'Disponível para download')}<div class="client-detail-grid">${detailField('Empresa', profile.name)}${detailField('Equipamento', record.equipment + ' · ' + record.tag)}${detailField('Ordem de serviço', record.id)}${detailField('Emissão', formatDate(record.completedISO))}</div><p class="client-detail-note">O PDF desta demonstração contém dados fictícios e está identificado como documento sem validade técnica.</p><div class="modal-actions">${clientButton('Ver serviço', 'data-client-service', record.id)}${clientButton('⇩ Baixar PDF', 'data-client-download', record.id, true)}</div>`);
  }
  function download(id) {
    const record = documents().find(item => item.id === id);
    if (!record) return;
    window.ancalDownloads.certificate(record);
    showToast('PDF de demonstração gerado para a sua empresa.');
  }
  function help() {
    openModal('Sua área de acompanhamento', profile?.name || clientAccount?.name || 'Acesso do cliente', '<p>Use Empresa em consulta no menu para alternar entre as empresas vinculadas ao seu acesso. Serviços, equipamentos, calibrações e certificados são atualizados conforme a seleção.</p><p>Em Meus serviços, acompanhe o andamento de cada ordem. Em Meus equipamentos, consulte identificação e histórico. Em Minhas calibrações, veja os procedimentos. Em Meus certificados, baixe os documentos liberados pela ANCAL.</p><button class="btn btn-primary" data-action="close-modal">Entendi</button>');
  }
  function notifications() {
    openModal('Atualizações da sua empresa', profile?.name || clientAccount?.name || 'Acesso do cliente', `<div class="client-detail-grid">${detailField('Serviços em andamento', services().filter(record => record.type !== 'done').length)}${detailField('Certificados disponíveis', documents().length)}</div>${profile ? '<button class="btn btn-primary" data-client-page="services">Acompanhar meus serviços</button>' : '<button class="btn" data-action="close-modal">Fechar</button>'}`);
  }
  function account() {
    openModal('Meu acesso', clientAccount?.name || 'Cliente', `<div class="client-detail-grid">${detailField('Usuário', clientAccount?.name || 'Cliente')}${detailField('Perfil', 'Consulta de serviços e documentos')}${detailField('Situação', clientAccount?.status === 'inactive' ? 'Inativo' : 'Ativo')}${detailField('Empresa em consulta', profile?.name || 'Nenhuma empresa')}${detailField('Empresas disponíveis', companies.length)}</div><h3 class="client-equipment-title">Empresas disponíveis neste acesso</h3><ul class="client-list">${companies.length ? companies.map(company => `<li class="client-update"><div><strong>${h(company.name)}</strong><p>CNPJ ${h(company.cnpj)}</p><button class="text-link" data-client-company="${h(company.id)}">${company.id === profile?.id ? 'Empresa selecionada' : 'Consultar esta empresa →'}</button></div></li>`).join('') : '<li>Nenhuma empresa disponível para consulta.</li>'}</ul><div class="modal-actions"><button class="btn" data-action="close-modal">Fechar</button></div>`);
  }
  document.addEventListener('click', event => {
    const mode = event.target.closest('[data-view]');
    if (mode) { mode.dataset.view === 'client' ? show() : leave(); return; }
    if (!portalMode) return;
    const company = event.target.closest('[data-client-company]');
    if (company) { switchCompany(company.dataset.clientCompany); return; }
    if (event.target.closest('[data-client-change-company]')) { focusCompanySelector(); return; }
    const page = event.target.closest('[data-client-page]');
    if (page) { navigate(page.dataset.clientPage); return; }
    const handlers = { 'clientService': serviceDetail, 'clientEquipment': equipmentDetail, 'clientCalibration': calibrationDetail, 'clientCertificate': certificateDetail, 'clientDownload': download };
    for (const [key, handler] of Object.entries(handlers)) {
      const attribute = 'data-' + key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase());
      const control = event.target.closest('[' + attribute + ']');
      if (control) { handler(control.dataset[key]); return; }
    }
  });
  $('#clientCompanySelect').addEventListener('change', event => switchCompany(event.target.value));
  document.addEventListener('ancal-access-changed', () => {
    refreshAccess();
    if (portalMode) { closeModal(); renderClient(); } else syncShell();
  });
  window.ancalClient = { show, leave, syncShell, download, help, notifications, account };
  refreshAccess();
  syncShell();
})();
