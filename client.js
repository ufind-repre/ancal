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
  const documentLabel = value => window.ancalIdentity?.label(value) || 'CPF/CNPJ';
  const openService = record => typeof isOpenServiceOrder === 'function' ? isOpenServiceOrder(record) : record.type !== 'done';
  const sectorNames = { laboratory:'Laboratório', maintenance:'Manutenção', packing:'Embalagem e conferência final', ready:'Pronto para coleta', finalized:'Finalizada' };
  const operationalSectors = record => !['cancelled','canceled'].includes(record.type) && !/cancelad/i.test(record.status || '') && window.ancalOrders?.get(record.id) ? window.ancalOrders.getSectors(record.id,record.cnpj) : [];
  const serviceStatus = record => operationalSectors(record).map(sector => sectorNames[sector]).filter(Boolean).join(' · ') || record.status;
  const servicePill = record => pill(record.type, serviceStatus(record));
  const own = record => !!profile && !!clientAccount && clientAccount.status === 'active'
    && window.ancalAccess.getAllowedCompanies(clientAccount.id).some(company => company.id === profile.id && company.cnpj === record.cnpj);
  const isReleased = record => !!window.ancalCertificates?.forOrder(record.id, record.cnpj).some(certificate => certificate.status === 'signed');
  const services = () => [...records, ...history.filter(item => !records.some(record => record.id === item.id && record.cnpj === item.cnpj))].filter(own);
  function instrumentInfo(tag){const info={...(equipmentInfo[profile?.cnpj]?.[tag]||{}),...(window.ancalEquipment?.forCompany(profile?.cnpj).find(item=>item.tag===tag)||{})};if(window.ancalExpiry)info.next=window.ancalExpiry.scheduleFor(profile?.cnpj,tag)?.nextCalibrationISO||'';return info;}
  const documents = () => (profile ? window.ancalCertificates?.forCompany(profile.cnpj) || [] : []).map(certificate => ({
    id: certificate.id, orderId: certificate.orderId, certificateId: certificate.code,
    client: certificate.client, cnpj: certificate.cnpj, equipment: certificate.equipmentName,
    tag: certificate.tag, serial: certificate.serial, completedISO: certificate.calibrationDateISO,
    service: certificate.activityType, status: 'Assinado', type: 'done'
  }));
  const calibrations = () => services().filter(record => (record.service || 'Calibração') !== 'Manutenção');
  function instruments() {
    const entries=services().flatMap(record=>getOrderEquipment(record).map(item=>({...record,equipment:item.name,tag:item.tag,serial:item.serial,equipments:[item]})));
    const mapped=new Map(entries.map(record=>[record.tag,record]).reverse());
    (window.ancalEquipment?.forCompany(profile?.cnpj)||[]).forEach(item=>{
      if(!mapped.has(item.tag))mapped.set(item.tag,{id:'',cnpj:item.cnpj,client:item.client,equipment:item.name,tag:item.tag,serial:item.serial,equipments:[item]});
    });
    return [...mapped.values()];
  }
  const serviceKind = record => record.service || 'Calibração';
  const documentId = record => record.certificateId || record.id.replace('OS-', 'CERT-');
  const calibrationId = record => record.id.replace('OS-', 'CAL-');
  function formatDate(iso) {
    if (!iso) return 'A definir';
    const date = new Date(iso + 'T12:00:00');
    return Number.isNaN(date.getTime()) ? 'A definir' : date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function meta(record) {
    const query = [record.code, record.id, ...getOrderEquipment(record).flatMap(item => [item.name,item.tag,item.serial]), orderWorkplace(record), documentId(record), calibrationId(record)].join(' ').toLowerCase();
    return `data-search="${h(query)}" data-period="${h((record.completedISO || '').slice(0, 7))}"`;
  }
  function clientButton(text, attribute, value, primary = false) {
    return `<button type="button" class="btn${primary ? ' btn-primary' : ''}" ${attribute}="${h(value)}">${text}</button>`;
  }
  function table(title, subtitle, headers, rows, options = {}) {
    const statusOptions = [...new Set((options.records || []).map(serviceStatus))];
    const periods = [...new Set(documents().map(record => record.completedISO?.slice(0, 7)).filter(Boolean))].sort().reverse();
    const expirySelect = options.expiry ? '<select class="client-filter client-expiry-filter" aria-label="Filtrar por vencimento da calibração"><option value="">Todos os vencimentos</option><option value="soon">Vencendo em 1 mês</option><option value="expired">Já vencidas</option><option value="unknown">Sem data</option></select>' : '';
    const statusSelect = options.status ? `<select class="filter-btn client-filter status-filter" aria-label="Filtrar por status"><option value="">Todos os status</option>${statusOptions.map(status => `<option>${h(status)}</option>`).join('')}</select>` : '';
    const periodSelect = options.period ? `<select class="filter-btn client-filter period-filter" aria-label="Filtrar certificados por período"><option value="">Todos os períodos</option>${periods.map(period => `<option value="${h(period)}">${h(new Date(period + '-01T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))}</option>`).join('')}</select>` : '';
    return `<section class="panel table-panel client-table"><div class="panel-heading"><div><h2>${title}</h2><p>${subtitle}</p></div><div class="table-tools"><input class="search client-search" aria-label="Buscar em ${title.toLowerCase()}" placeholder="⌕ Buscar instrumento ou OS">${statusSelect}${periodSelect}${expirySelect}</div></div><div class="table-scroll"><table><thead><tr>${headers.map(header => `<th scope="col">${header}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table><div class="empty-state client-empty" ${rows ? 'hidden' : ''}><span class="empty-icon">⌕</span><strong>Nenhum registro encontrado</strong><span>Altere a busca ou os filtros para consultar outros registros.</span></div></div></section>`;
  }
  function serviceRows(items) {
    return items.map(record => `<tr ${meta(record)}><td class="os-id">${h(record.code || record.id)}</td><td class="client-cell"><strong>${h(record.equipment)}</strong><span>${h(record.tag)} · ${h(serviceKind(record))}</span></td><td class="os-workplace-cell">${h(orderWorkplace(record))}</td><td>${h(record.due)}</td><td>${servicePill(record)}</td><td>${clientButton('Acompanhar →', 'data-client-service', record.id)}</td></tr>`).join('');
  }
  function summary() {
    const active = services().filter(openService);
    const calibrationActive = calibrations().filter(openService);
    const cards = [
      ['services', '▤', active.length, 'Serviços em andamento', 'Veja cada etapa do atendimento'],
      ['equipment', '◉', instruments().length, 'Equipamentos cadastrados', 'Consulte o histórico técnico'],
      ['calibrations', '⌁', calibrationActive.length, 'Calibrações em andamento', 'Acompanhe a execução e revisão'],
      ['certificates', '▧', documents().length, 'Certificados disponíveis', 'Documentos prontos para baixar']
    ];
    return `<section class="client-summary" aria-label="Resumo da sua empresa">${cards.map(([page, icon, count, label, foot]) => `<button type="button" class="client-summary-card" data-client-page="${page}"><span class="client-summary-icon">${icon}</span><strong>${String(count).padStart(2, '0')}</strong><span class="client-summary-label">${label}</span><small>${foot}　→</small></button>`).join('')}</section>`;
  }
  function overview() {
    const active = services().filter(openService);
    return `<section class="client-hero"><div><div class="client-eyebrow">BEM-VINDO À SUA ÁREA</div><h2 class="client-hero-title">${h(profile.name)}</h2><p>${documentLabel(profile.cnpj)} ${h(profile.cnpj)} <span aria-hidden="true">·</span> ${h(profile.city)}</p></div><div class="client-hero-actions"><span class="client-hero-badge">Empresa selecionada</span><button type="button" class="btn" data-client-change-company>Trocar empresa ⇄</button></div></section>${window.ancalExpiry?.banner(profile.cnpj)||''}${summary()}<div class="client-grid"><div>${table('Serviços em andamento', 'O que a ANCAL está realizando para a sua empresa', ['ORDEM DE SERVIÇO', 'EQUIPAMENTO', 'LOCAL DE TRABALHO', 'PRAZO PREVISTO', 'STATUS', ''], serviceRows(active))}<div class="client-section-head"><button class="text-link" data-client-page="services">Consultar todos os serviços →</button></div><section class="panel client-callout"><div class="client-section-head"><div><h2>Seus documentos, sempre à mão</h2><p>Certificados liberados para consulta e download.</p></div><span class="stat-icon green">▧</span></div><p>${documents().length} documentos estão disponíveis para a sua empresa.</p>${clientButton('Consultar certificados →', 'data-client-page', 'certificates', true)}</section></div><aside class="panel"><div class="panel-heading"><div><h2>Últimas atualizações</h2><p>A movimentação dos seus serviços</p></div></div><ul class="client-list">${active.slice(0, 2).map(record => `<li class="client-update"><div><strong>${h(serviceStatus(record))}</strong><p>${h(record.equipment)} · ${h(record.id)}</p><button class="text-link" data-client-service="${h(record.id)}">Ver andamento →</button></div></li>`).join('')}${documents().slice(0, 2).map(record => `<li class="client-update"><div><strong>Certificado disponível</strong><p>${h(record.equipment)} · ${h(record.tag)}</p><small>${formatDate(record.completedISO)}</small><br><button class="text-link" data-client-certificate="${h(record.id)}">Consultar documento →</button></div></li>`).join('')}</ul></aside></div>`;
  }
  function servicesPage() {
    const items = services();
    return table('Histórico de serviços', `${items.length} ordens vinculadas à sua empresa`, ['ORDEM DE SERVIÇO', 'EQUIPAMENTO / SERVIÇO', 'LOCAL DE TRABALHO', 'PRAZO / CONCLUSÃO', 'STATUS', 'ACOMPANHAMENTO'], serviceRows(items), { status: true, records: items });
  }
  function equipmentPage() {
    const rows = instruments().map(record => {
      const info = instrumentInfo(record.tag);
      const busy = services().some(item => getOrderEquipment(item).some(equipment=>equipment.tag===record.tag) && isOpenServiceOrder(item));
      const modelSerial = info.model ? `${info.model} · ${info.serial || record.serial || 'Série não informada'}` : info.serial || record.serial;
      return `<tr ${meta({...record,equipment:info.name || record.equipment,serial:[modelSerial,info.clientSector,JSON.stringify(info.measurementRanges||[])].join(' ')})}><td class="os-id">${h(record.tag)}</td><td class="client-cell"><strong>${h(info.name || record.equipment)}</strong><span>${h(info.manufacturer || 'A informar')}</span></td><td>${h(modelSerial)}</td><td>${h(info.clientSector || 'Não informado')}</td><td>${equipmentRanges(info)}</td><td>${formatDate(info.next)}</td><td>${pill(info.active===false?'wait':busy?'progress':'done',info.active===false?'Inativo':busy?'Em serviço':'Ativo')}</td><td>${clientButton('Ver histórico →', 'data-client-equipment', record.tag)}</td></tr>`;
    }).join('');
    return table('Seus equipamentos', 'Identificação, faixas de medição e histórico dos instrumentos cadastrados', ['IDENTIFICAÇÃO', 'EQUIPAMENTO', 'MODELO / Nº SÉRIE', 'SETOR DO CLIENTE', 'INTERVALOS DE MEDIÇÃO', 'PRÓXIMA CALIBRAÇÃO', 'SITUAÇÃO', ''], rows);
  }
  function equipmentRanges(info) {
    const ranges = Array.isArray(info.measurementRanges) ? info.measurementRanges : [];
    return ranges.length ? ranges.map(range=>`<span class="client-equipment-range"><strong>${h(range.label)}</strong>${h(range.min)} a ${h(range.max)} ${h(range.unit)}${range.resolution ? ' · Resolução: '+h(range.resolution) : ''}</span>`).join('') : '<span class="client-equipment-range">Não informado</span>';
  }
  function calibrationsPage() {
    const items = calibrations();
    const rows = items.map(record => {
      const equipment=getOrderEquipment(record);
      const states=[...new Set(equipment.map(item=>window.ancalExpiry?.scheduleFor(profile.cnpj,item.tag)?.state||'unknown'))].join(' ');
      const dates=equipment.map(item=>`<span>${h(item.tag)} · ${formatDate(window.ancalExpiry?.scheduleFor(profile.cnpj,item.tag)?.nextCalibrationISO)}</span>`).join('');
      return `<tr ${meta(record)} data-calibration-expiry="${h(states)}"><td class="os-id">${h(calibrationId(record))}</td><td class="client-cell"><strong>${h(record.equipment)}</strong><span>${h(record.tag)} · ${h(serviceKind(record))}</span></td><td>${h(record.id)}</td><td>${h(record.due)}</td><td class="client-calibration-dates">${dates}</td><td>${servicePill(record)}</td><td>${clientButton('Ver calibração →', 'data-client-calibration', record.id)}</td></tr>`;
    }).join('');
    return (window.ancalExpiry?.banner(profile.cnpj)||'')+table('Registros de calibração', 'Próximos vencimentos dos seus equipamentos e procedimentos vinculados', ['REGISTRO', 'INSTRUMENTO / PROCEDIMENTO', 'ORDEM DE SERVIÇO', 'PREVISÃO / CONCLUSÃO DA OS', 'PRÓXIMA CALIBRAÇÃO', 'STATUS', ''], rows, { status: true, records: items, expiry:true });
  }
  function certificatesPage() {
    if(window.ancalCertificatesUI)return window.ancalCertificatesUI.portal(profile.cnpj);
    const rows = documents().map(record => `<tr ${meta(record)}><td><div class="certificate-card"><div class="pdf-icon">PDF</div><div><strong>${h(documentId(record))}</strong><span>${h(serviceKind(record))}</span></div></div></td><td class="client-cell"><strong>${h(record.equipment)}</strong><span>${h(record.tag)}</span></td><td>${formatDate(record.completedISO)}</td><td>${pill('done', 'Disponível')}</td><td>${clientButton('Detalhes', 'data-client-certificate', record.id)} ${clientButton('⇩ Baixar PDF', 'data-client-download', record.id, true)}</td></tr>`).join('');
    return table('Certificados disponíveis', 'Documentos liberados pela ANCAL para a sua empresa', ['DOCUMENTO', 'EQUIPAMENTO', 'EMISSÃO', 'SITUAÇÃO', 'AÇÕES'], rows, { period: true });
  }
  function companyBanner() {
    return `<section class="client-company-banner" aria-label="Empresa selecionada"><div class="client-company-banner-copy"><span class="client-company-banner-tag">EMPRESA EM CONSULTA</span><strong>${h(profile.name)}</strong><span>${documentLabel(profile.cnpj)} ${h(profile.cnpj)}</span></div><button type="button" class="btn" data-client-change-company>Trocar empresa ⇄</button></section>`;
  }
  function renderClient() {
    // Keep the selected-company access scope current before resolving alert data.
    syncShell();
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
    window.ancalExpiryUI?.afterClient(profile.cnpj);
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
    $('#clientCompanyCnpj').textContent = profile ? documentLabel(profile.cnpj) + ' ' + profile.cnpj : 'Sem empresa em consulta';
    $('#clientCompanyHelp').textContent = `${companies.length} ${companies.length === 1 ? 'empresa vinculada' : 'empresas vinculadas'} ao seu acesso`;
    $('.lab-select > span:nth-child(2)').textContent = portalMode ? profile?.name || 'Sem empresa vinculada' : 'Laboratório ANCAL';
    $('.user-info strong').textContent = portalMode ? clientAccount?.name || 'Cliente' : 'Isabela Jurado';
    $('.user-info > span').textContent = portalMode ? 'Acesso a ' + companies.length + ' empresas' : 'Área técnica';
    $('.avatar').textContent = portalMode ? clientAccount?.initials || 'CL' : 'IJ';
    $('.top-avatar').textContent = portalMode ? clientAccount?.initials || 'CL' : 'IJ';
    $('.cloud-card').hidden = portalMode;
    if (portalMode) $('#crumb').textContent = profile ? 'Área do cliente / ' + pages[clientPage][0] : 'Área do cliente / Acesso';
    document.title = portalMode ? 'ANCAL | Área do cliente' : 'ANCAL | Gestão Metrológica';
    window.ancalNavigation?.sync();
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
    if(window.ancalNavigation){window.ancalNavigation.open('company');return;}
    $('#sidebar').classList.add('open');
    $('#scrim').classList.add('show');
    $('#clientCompanySelect').focus();
  }
  function findService(id) { return services().find(record => record.id === id); }
  function detailField(label, value) { return `<div><span>${label}</span><strong>${h(value)}</strong></div>`; }
  function progress(record) {
    const sectors = operationalSectors(record);
    if (sectors.length) {
      const ranks = {laboratory:1,maintenance:1,packing:2,ready:3,finalized:4};
      const stage = Math.min(...sectors.map(sector => ranks[sector] ?? 0));
      const execution = serviceKind(record) === 'Manutenção' ? 'Manutenção' : 'Laboratório';
      const labels = [['Recebimento','Entrada registrada'],[execution,'Execução do serviço'],['Conferência','Embalagem e vistoria final'],['Coleta','Pronto para devolução'],['Finalizada','Material devolvido ou enviado']];
      return '<ol class="client-progress client-operational-progress" aria-label="Etapas do serviço">'+labels.map(([title,note],index)=>{const complete=index<stage || stage===4;return '<li class="'+(complete?'complete':index===stage?'current':'')+'"><span class="step-dot">'+(complete?'✓':index+1)+'</span><strong>'+title+'</strong><small>'+note+'</small><small>'+(complete?'Concluído':index===stage?'Etapa atual':'Pendente')+'</small></li>';}).join('')+'</ol>';
    }
    const stage = { wait: 0, progress: 1, review: 2, done: 3 }[record.type] ?? 0;
    const signedCount = window.ancalCertificates?.forOrder(record.id, record.cnpj).filter(certificate => certificate.status === 'signed').length || 0;
    const allReleased = signedCount > 0 && signedCount >= getOrderEquipment(record).length;
    const labels = [['Recebimento', 'Solicitação registrada'], ['Execução', 'Procedimento técnico'], ['Revisão', 'Validação da equipe'], ['Certificado', allReleased ? 'Documentos assinados' : 'Assinatura e liberação']];
    return `<ol class="client-progress" aria-label="Etapas do serviço">${labels.map(([title, note], i) => {const complete = i < stage || (i === 3 && allReleased); return `<li class="${complete ? 'complete' : i === stage ? 'current' : ''}"><span class="step-dot">${complete ? '✓' : i + 1}</span><strong>${title}</strong><small>${note}</small><small>${complete ? 'Concluído' : i === stage ? 'Etapa atual' : 'Pendente'}</small></li>`;}).join('')}</ol>`;
  }
  function serviceDetail(id) {
    const record = findService(id);
    if (!record) return;
    openModal(record.code || record.id, 'Acompanhamento do seu serviço', `${servicePill(record)}${progress(record)}<div class="client-detail-grid"><div class="os-equipment-detail-field"><span>Equipamentos da ordem (${getOrderEquipment(record).length})</span>${orderEquipmentDetails(record)}</div>${detailField('Local de trabalho', orderWorkplace(record))}${detailField('Tipo de serviço', serviceKind(record))}${detailField('Prazo previsto', record.due)}${record.receivedISO ? detailField('Recebimento',formatDate(record.receivedISO)) : ''}${record.finalization?.returnedISO ? detailField('Devolução',formatDate(record.finalization.returnedISO)) : ''}</div><div class="modal-actions">${getOrderEquipment(record).map(item=>clientButton('Ver '+h(item.tag), 'data-client-equipment', item.tag)).join(' ')}${calibrations().some(item => item.id === record.id) ? clientButton('Ver calibração', 'data-client-calibration', record.id) : ''}${isReleased(record) ? clientButton('⇩ Certificado', 'data-client-download', record.id, true) : ''}</div>`);
  }
  function equipmentDetail(tag) {
    const record = instruments().find(item => item.tag === tag);
    if (!record) return;
    const info = instrumentInfo(tag);
    const related = services().filter(item => getOrderEquipment(item).some(equipment=>equipment.tag===tag));
    const certificates = (window.ancalCertificates?.forCompany(profile.cnpj)||[]).filter(certificate=>certificate.tag===tag && (!info.id || certificate.equipmentId===info.id));
    const extra = (Array.isArray(info.additionalFields)?info.additionalFields:[]).map(field=>detailField(field.label,field.value)).join('');
    openModal(info.name || record.equipment, `Identificação: ${tag}`, `<div class="client-detail-grid">${detailField('Modelo', info.model || 'Não informado')}${detailField('Número de série', info.serial || record.serial)}${detailField('Fabricante', info.manufacturer || 'A informar')}${detailField('Setor do cliente', info.clientSector || 'Não informado')}${detailField('Localização', info.area || info.clientSector || 'A informar')}${detailField('Situação do cadastro', info.active===false?'Inativo':'Ativo')}${detailField('Periodicidade de calibração', Number(info.calibrationFrequencyMonths)>0 ? info.calibrationFrequencyMonths+' meses' : 'Não informada')}${detailField('Próxima calibração', formatDate(info.next))}${info.className ? detailField('Classe',info.className) : ''}${extra}</div><h3 class="client-equipment-title">Intervalos de medição</h3>${equipmentRanges(info)}<h3 class="client-equipment-title">Certificados e calibrações anteriores</h3><ul class="client-list">${certificates.length ? certificates.map(certificate=>`<li class="client-update"><div><strong>${h(certificate.code)}</strong><p>${h(certificate.orderId)} · ${formatDate(certificate.calibrationDateISO)} · ${h(certificate.activityType)}</p><small>Assinado · Versão ${h(certificate.version || 'não informada')} · Laboratório ${h(certificate.laboratory || 'não informado')}</small><br><button type="button" class="text-link" data-client-certificate="${h(certificate.id)}">Consultar certificado →</button></div></li>`).join('') : '<li>Nenhum certificado assinado disponível para este instrumento.</li>'}</ul><h3 class="client-equipment-title">Histórico de serviços</h3><ul class="client-list">${related.map(item => `<li class="client-update"><div><strong>${h(item.id)} · ${h(serviceKind(item))}</strong><p>${h(item.due)} · ${h(item.status)}</p><button class="text-link" data-client-service="${h(item.id)}">Acompanhar serviço →</button></div></li>`).join('')}</ul>`);
  }
  function calibrationDetail(id) {
    const record = calibrations().find(item => item.id === id);
    if (!record) return;
    openModal(calibrationId(record), 'Consulta do procedimento técnico', `${servicePill(record)}<div class="client-detail-grid"><div class="os-equipment-detail-field"><span>Instrumentos</span>${orderEquipmentDetails(record)}</div>${detailField('Procedimento', serviceKind(record))}${detailField('OS vinculada', record.id)}${detailField('Prazo previsto', record.due)}${record.finalization?.returnedISO ? detailField('Devolução da OS',formatDate(record.finalization.returnedISO)) : ''}</div><div class="client-detail-note">${isReleased(record) ? 'Há certificados assinados disponíveis para consulta e download.' : 'O documento será disponibilizado após a conclusão, a revisão técnica e a assinatura por um administrador ou signatário autorizado.'}</div><div class="modal-actions">${clientButton('Ver serviço', 'data-client-service', record.id)}${isReleased(record) ? clientButton('⇩ Baixar certificado', 'data-client-download', record.id, true) : ''}</div>`);
  }
  function certificateDetail(id) {
    if (!documents().some(item => item.id === id)) return;
    window.ancalCertificatesUI?.open(id);
  }
  function download(id) {
    if (!profile) return;
    window.ancalCertificateBridge?.download(id, profile.cnpj);
  }
  function help() {
    openModal('Sua área de acompanhamento', profile?.name || clientAccount?.name || 'Acesso do cliente', '<p>Use Empresa em consulta no menu para alternar entre as empresas vinculadas ao seu acesso. Serviços, equipamentos, calibrações e certificados são atualizados conforme a seleção.</p><p>Em Meus serviços, acompanhe o andamento de cada ordem. Em Meus equipamentos, consulte identificação e histórico. Em Minhas calibrações, veja os procedimentos. Em Meus certificados, baixe os documentos liberados pela ANCAL.</p><button class="btn btn-primary" data-action="close-modal">Entendi</button>');
  }
  function notifications() {
    openModal('Atualizações da sua empresa', profile?.name || clientAccount?.name || 'Acesso do cliente', `<div class="client-detail-grid">${detailField('Serviços em andamento', services().filter(openService).length)}${detailField('Certificados disponíveis', documents().length)}${detailField('Calibrações vencendo em 1 mês', profile?(window.ancalExpiry?.forCompany(profile.cnpj).length||0):0)}</div>${profile ? '<button class="btn btn-primary" data-client-page="services">Acompanhar meus serviços</button>' : '<button class="btn" data-action="close-modal">Fechar</button>'}`);
  }
  function account() {
    openModal('Meu acesso', clientAccount?.name || 'Cliente', `<div class="client-detail-grid">${detailField('Usuário', clientAccount?.name || 'Cliente')}${detailField('Perfil', 'Consulta de serviços e documentos')}${detailField('Situação', clientAccount?.status === 'inactive' ? 'Inativo' : 'Ativo')}${detailField('Empresa em consulta', profile?.name || 'Nenhuma empresa')}${detailField('Empresas disponíveis', companies.length)}</div><h3 class="client-equipment-title">Empresas disponíveis neste acesso</h3><ul class="client-list">${companies.length ? companies.map(company => `<li class="client-update"><div><strong>${h(company.name)}</strong><p>${documentLabel(company.cnpj)} ${h(company.cnpj)}</p><button class="text-link" data-client-company="${h(company.id)}">${company.id === profile?.id ? 'Empresa selecionada' : 'Consultar esta empresa →'}</button></div></li>`).join('') : '<li>Nenhuma empresa disponível para consulta.</li>'}</ul><div class="modal-actions"><button class="btn" data-action="close-modal">Fechar</button></div>`);
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
  document.addEventListener('ancal-certificates-changed', () => {
    if (portalMode) { closeModal(); renderClient(); }
  });
  window.ancalClient = { show, leave, syncShell, download, help, notifications, account };
  // Preserve previously published demo documents with explicit simulated signatures.
  // Clones keep the service history and its original storage untouched.
  window.ancalCertificates?.registerOrders(history.map(order => ({
    ...order, calibrationDateISO: order.completedISO, certificateStatus: 'signed',
    signature: { actorId: 'demo-signatory', name: 'Signatário de demonstração', role: 'authorized_signer', signedAt: order.completedISO + 'T15:00:00.000Z', simulated: true }
  })));
  refreshAccess();
  syncShell();
})();
