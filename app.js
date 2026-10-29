const records=[
 {id:'OS-2026-084',client:'Hospital São Lucas',cnpj:'12.345.678/0001-90',equipment:'Balança analítica',tag:'BAL-024',due:'29 out, 2026',status:'Em calibração',type:'progress',tech:'Marcos Ribeiro',serial:'AS220 · 9234K120'},
 {id:'OS-2026-083',client:'Lab. Biocenter',cnpj:'45.890.123/0001-17',equipment:'Pipeta monocanal',tag:'PIP-118',due:'29 out, 2026',status:'Aguardando revisão',type:'review',tech:'Isabela Jurado',serial:'Eppendorf · 6H19021'},
 {id:'OS-2026-082',client:'Indústria Nutribem',cnpj:'08.765.432/0001-55',equipment:'Termohigrômetro',tag:'TH-036',due:'30 out, 2026',status:'Em calibração',type:'progress',tech:'Marcos Ribeiro',serial:'Testo 608-H1 · 781204'},
 {id:'OS-2026-081',client:'Farmácia Central',cnpj:'23.456.789/0001-22',equipment:'Termômetro digital',tag:'TERM-057',due:'30 out, 2026',status:'Aguardando aprovação',type:'wait',tech:'Ana Paula Costa',serial:'Incoterm 7666 · T2057'},
 {id:'OS-2026-080',client:'Hospital São Lucas',cnpj:'12.345.678/0001-90',equipment:'Autoclave vertical',tag:'AUTO-012',due:'31 out, 2026',status:'Aguardando revisão',type:'review',tech:'Isabela Jurado',serial:'Phoenix AV-75 · 12088'},
 {id:'OS-2026-079',client:'Universidade Unaerp',cnpj:'44.371.412/0001-30',equipment:'pHmetro de bancada',tag:'PH-009',due:'28 out, 2026',status:'Concluída',type:'done',tech:'Ana Paula Costa',serial:'Metrohm 827 · 2A92870'}
];
const clients=[['Hospital São Lucas','12.345.678/0001-90','18','5','Ativo'],['Lab. Biocenter','45.890.123/0001-17','24','3','Ativo'],['Indústria Nutribem','08.765.432/0001-55','12','2','Ativo'],['Farmácia Central','23.456.789/0001-22','9','1','Ativo'],['Universidade Unaerp','44.371.412/0001-30','31','4','Ativo']];
const standards=[['PAD-014','Massa padrão classe F1','OIML · 1 kg','29 nov, 2026','Válido'],['PAD-009','Termômetro de referência','Fluke 5627A','14 dez, 2026','Válido'],['PAD-022','Pipeta de referência','Eppendorf · 1000 µL','03 nov, 2026','Atenção'],['PAD-006','Higrômetro padrão','Rotronic HC2A','18 jan, 2027','Válido']];
const pageNames={dashboard:'Painel geral',ordens:'Ordens de serviço',equipamentos:'Equipamentos',calibracoes:'Calibrações',padroes:'Gestão de padrões',certificados:'Certificados',clientes:'Clientes',usuarios:'Usuários e auditoria'};
let currentPage='dashboard',portalMode=false,toastTimer;
let demoEntries={};
try {
  const saved=JSON.parse(localStorage.getItem('ancal-demo-v2')||'null');
  if(saved && Array.isArray(saved.records) && saved.records.length) records.splice(0,records.length,...saved.records);
  if(saved && saved.entries && typeof saved.entries==='object') demoEntries=saved.entries;
} catch (_) { /* O protótipo também funciona quando o armazenamento está indisponível. */ }
function saveDemo(){try{localStorage.setItem('ancal-demo-v2',JSON.stringify({records,entries:demoEntries}));}catch(_){}}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
const $=s=>document.querySelector(s);const app=$('#app');
function button(label,cls='btn',action=''){return `<button class="${cls}" ${action?`data-action="${action}"`:''}>${label}</button>`}
function heading(title,subtitle,actions=''){return `<div class="page-heading"><div><div class="eyebrow">${currentPage==='dashboard'?'QUINTA-FEIRA, 29 DE OUTUBRO DE 2026':'OPERAÇÃO TÉCNICA'}</div><h1>${title}</h1><p>${subtitle}</p></div><div class="heading-actions">${actions}</div></div>`}
function stat(label,value,foot,icon,color=''){return `<div class="stat-card"><div class="stat-top">${label}<span class="stat-icon ${color}">${icon}</span></div><div class="stat-value">${value}</div><div class="stat-foot">${foot}</div></div>`}
function pill(type,text){return `<span class="pill pill-${type}">${text}</span>`}
function tableRows(items){return items.map(r=>`<tr data-search="${escapeHtml((r.id+' '+r.client+' '+r.equipment+' '+r.tag).toLowerCase())}"><td class="os-id">${r.id}</td><td class="client-cell"><strong>${escapeHtml(r.client)}</strong><span>${r.cnpj}</span></td><td class="equip-cell">${escapeHtml(r.equipment)}<br><span>${r.tag}</span></td><td>${r.due}</td><td>${pill(r.type,r.status)}</td><td><button class="row-action" data-record="${r.id}" aria-label="Ver ${r.id}">···</button></td></tr>`).join('')}
function osTable(title='Ordens de serviço recentes',data=records.slice(0,5)){return `<section class="panel table-panel"><div class="panel-heading"><div><h2>${title}</h2><p>Visão geral dos serviços técnicos</p></div><div class="table-tools"><input class="search" placeholder="⌕  Buscar OS ou cliente" aria-label="Buscar"><button class="filter-btn" data-action="filter">☷　Filtros</button><button class="text-link" data-page="ordens">Ver todas　→</button></div></div><div class="table-scroll"><table><thead><tr><th>ORDEM</th><th>CLIENTE</th><th>EQUIPAMENTO</th><th>PRAZO</th><th>STATUS</th><th></th></tr></thead><tbody>${tableRows(data)}</tbody></table><div class="empty-state" hidden><span class="empty-icon">⌕</span><strong>Nenhum resultado encontrado</strong><span>Tente buscar por outro termo.</span></div></div></section>`}
function dashboard(){return `${heading('Bom dia, Isabela 👋','Aqui está o resumo da operação técnica do laboratório.',button('↗ Portal do cliente','btn btn-light','portal-view')+button('<span class="plus">＋</span> Nova OS','btn btn-primary','new-os')+button('⇩ Exportar','btn btn-light','export'))}<section class="stats">${stat('OS em andamento','08','<strong>+2</strong> nesta semana','▤')}${stat('Calibrações concluídas','24','<strong>+12%</strong> este mês','⌁','blue')}${stat('Certificados disponíveis','156','atualizados hoje','▧','green')}${stat('Padrões próximos do vencimento','02','requerem atenção','◇','purple')}</section><div class="layout-grid"><section class="panel"><div class="panel-heading"><div><h2>Volume de serviços</h2><p>Ordens técnicas nos últimos 6 meses</p></div><span class="filter-btn chart-period">Últimos 6 meses</span></div><div class="chart-wrap"><div class="chart-tooltip">Setembro<strong>32 serviços</strong></div><svg viewBox="0 0 600 190" preserveAspectRatio="none" aria-label="Gráfico de volume de serviços"><defs><linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f47721" stop-opacity=".16"/><stop offset="1" stop-color="#f47721" stop-opacity="0"/></linearGradient></defs><g class="chart-grid"><line x1="34" y1="25" x2="590" y2="25"/><line x1="34" y1="65" x2="590" y2="65"/><line x1="34" y1="105" x2="590" y2="105"/><line x1="34" y1="145" x2="590" y2="145"/></g><g class="chart-label"><text x="0" y="28">40</text><text x="0" y="68">30</text><text x="0" y="108">20</text><text x="0" y="148">10</text><text x="45" y="177">Mai</text><text x="145" y="177">Jun</text><text x="245" y="177">Jul</text><text x="345" y="177">Ago</text><text x="445" y="177">Set</text><text x="545" y="177">Out</text></g><path class="chart-area" d="M50 118 C82 110 102 84 150 91 S215 105 250 75 S318 89 350 62 S418 53 450 44 S515 68 570 32 L570 150 L50 150 Z"/><path class="chart-line" d="M50 118 C82 110 102 84 150 91 S215 105 250 75 S318 89 350 62 S418 53 450 44 S515 68 570 32"/><circle class="chart-point" cx="450" cy="44" r="4"/></svg></div><div class="chart-legend"><span><i class="legend-dot"></i>Ordens concluídas</span><span><i class="legend-dot gray"></i>Meta mensal</span></div></section><section class="panel"><div class="panel-heading"><div><h2>Visão da operação</h2><p>Status dos serviços técnicos</p></div><button class="text-link" data-page="ordens">Detalhes →</button></div><div class="status-list"><div class="status-row"><div class="status-symbol">▤</div><div><strong>Em calibração</strong><span>Serviços em execução</span></div><b class="status-number">05</b></div><div class="status-row"><div class="status-symbol blue">◷</div><div><strong>Aguardando revisão</strong><span>Validação técnica pendente</span></div><b class="status-number">02</b></div><div class="status-row"><div class="status-symbol purple">⇧</div><div><strong>Aguardando aprovação</strong><span>Prontos para liberação</span></div><b class="status-number">01</b></div><div class="status-row"><div class="status-symbol green">✓</div><div><strong>Concluídas hoje</strong><span>Certificado disponibilizado</span></div><b class="status-number">06</b></div></div></section></div>${osTable()}<div class="lower-grid" style="margin-top:15px"><section class="panel"><div class="panel-heading"><div><h2>Fluxo do serviço técnico</h2><p>Da abertura da OS à entrega do certificado</p></div><span class="pill pill-progress">FLUXO ATIVO</span></div><div class="flow"><div class="flow-step complete"><div class="flow-circle">✓</div><strong>Entrada</strong><span>OS aberta</span></div><div class="flow-step complete"><div class="flow-circle">✓</div><strong>Execução</strong><span>Calibração</span></div><div class="flow-step"><div class="flow-circle">3</div><strong>Revisão</strong><span>Validação</span></div><div class="flow-step"><div class="flow-circle">4</div><strong>Certificado</strong><span>Disponível</span></div></div></section><section class="panel backup-panel"><div class="backup-mark">☁</div><div class="backup-copy"><strong>Backup automático ativo</strong><p>Último backup hoje às 03:00 · Região São Paulo</p><a href="#" data-action="backup">Ver detalhes do armazenamento →</a></div><span class="backup-status">● Protegido</span></section></div><p class="demo-note">* Dados e indicadores ilustrativos para validação dos fluxos. Regras técnicas a confirmar com a equipe ANCAL.</p>`}
function ordens(){return `${heading('Ordens de serviço','Acompanhe cada etapa dos serviços técnicos.',button('<span class="plus">＋</span> Nova OS','btn btn-primary','new-os'))}${osTable('Todas as ordens de serviço',records)}`}
function genericTable(title,desc,headers,rows){return `${heading(title,desc,button('<span class="plus">＋</span> Novo cadastro','btn btn-primary','new-record'))}<section class="panel table-panel section-panel"><div class="panel-heading"><div><h2>${title} cadastrados</h2><p>Dados de demonstração</p></div><div class="table-tools"><input class="search" placeholder="⌕  Buscar" aria-label="Buscar"><button class="filter-btn" data-action="filter">☷　Filtros</button></div></div><div class="table-scroll"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table><div class="empty-state" hidden><span class="empty-icon">⌕</span><strong>Nenhum resultado encontrado</strong><span>Tente buscar por outro termo.</span></div></div></section><p class="demo-note">* Registros ilustrativos. Campos e regras sujeitos à validação com a equipe ANCAL.</p>`}
function equipmentPage(){const list=records.map((r,i)=>`<tr data-search="${escapeHtml((r.client+' '+r.equipment+' '+r.tag+' '+r.serial).toLowerCase())}"><td class="os-id">${r.tag}</td><td class="equip-cell">${escapeHtml(r.equipment)}</td><td>${({'BAL-024':'Sartorius','PIP-118':'Eppendorf','TH-036':'Testo','TERM-057':'Incoterm','AUTO-012':'Phoenix','PH-009':'Metrohm'}[r.tag]||'A informar')}</td><td>${r.serial.split('·')[0]}</td><td class="client-cell"><strong>${escapeHtml(r.client)}</strong><span>Ribeirão Preto, SP</span></td><td>${r.due}</td><td><button class="row-action" data-record="${r.id}">···</button></td></tr>`).join('');return genericTable('Equipamentos','Cadastro e histórico técnico dos instrumentos atendidos.',['IDENTIFICAÇÃO','EQUIPAMENTO','FABRICANTE','MODELO / Nº SÉRIE','CLIENTE','PRÓXIMA CALIBRAÇÃO',''],list)}
function padroesPage(){const rows=standards.map((s,i)=>`<tr data-search="${s.join(' ').toLowerCase()}"><td class="os-id">${s[0]}</td><td class="equip-cell">${s[1]}</td><td>${s[2]}</td><td>${s[3]}</td><td>${pill(i===2?'wait':'done',s[4])}</td><td><button class="row-action" data-record="${s[0]}">···</button></td></tr>`).join('');return genericTable('Gestão de padrões','Controle de rastreabilidade e validade dos padrões de referência.',['CÓDIGO','PADRÃO DE REFERÊNCIA','IDENTIFICAÇÃO','VALIDADE','STATUS',''],rows)}
function calibracoesPage(){const list=records.slice(0,5).map((r,i)=>`<tr data-search="${escapeHtml((r.id+' '+r.client+' '+r.equipment).toLowerCase())}"><td class="os-id">CAL-2026-${String(146-i).padStart(3,'0')}</td><td class="equip-cell">${escapeHtml(r.equipment)}<br><span>${r.tag}</span></td><td class="client-cell"><strong>${escapeHtml(r.client)}</strong><span>${r.id}</span></td><td>${i%2?'Calibração externa':'Calibração interna'}</td><td>${['PAD-014 · Massa F1','PAD-009 · Fluke 5627A','PAD-022 · Pipeta ref.'][i%3]}</td><td>${pill(r.type,r.status)}</td><td><button class="row-action" data-record="${r.id}">···</button></td></tr>`).join('');return genericTable('Calibrações','Registros técnicos vinculados às ordens e aos padrões utilizados.',['REGISTRO','INSTRUMENTO','CLIENTE / OS','MÉTODO','PADRÃO UTILIZADO','STATUS',''],list)}
function certificates(){let list=records.filter(r=>['done','review'].includes(r.type)).map((r,i)=>`<tr data-search="${escapeHtml((r.id+' '+r.client+' '+r.equipment+' certificado').toLowerCase())}"><td><div class="certificate-card"><div class="pdf-icon">PDF</div><div><strong>Certificado ${String(2031-i).padStart(4,'0')}</strong><span>Emitido em ${r.due} · PDF</span></div></div></td><td class="client-cell"><strong>${escapeHtml(r.client)}</strong><span>${r.cnpj}</span></td><td class="equip-cell">${escapeHtml(r.equipment)}<br><span>${r.tag}</span></td><td>${r.id}</td><td>${pill('done','Disponível no portal')}</td><td><button class="btn" data-action="download" data-os="${r.id}">⇩ Baixar</button></td></tr>`).join('');return genericTable('Certificados','Documentos técnicos revisados e disponibilizados aos clientes.',['DOCUMENTO','CLIENTE','EQUIPAMENTO','ORDEM','DISPONIBILIDADE','AÇÃO'],list)}
function clientPage(){const rows=clients.map((c,i)=>`<tr data-search="${c.join(' ').toLowerCase()}"><td><div class="client-cell"><strong>${c[0]}</strong><span>${c[1]}</span></div></td><td>${c[2]}</td><td>${c[3]}</td><td>${pill('done',c[4])}</td><td><button class="row-action" data-record="${c[0]}">···</button></td></tr>`).join('');return genericTable('Clientes','Empresas atendidas e seus equipamentos vinculados.',['EMPRESA','EQUIPAMENTOS','OS EM ANDAMENTO','SITUAÇÃO',''],rows)}
function usersPage(){const rows=[['IJ','Isabela Jurado','Área técnica / Qualidade','Administradora','Hoje, 09:42'],['GD','Guilherme Damasio','Gestão','Administrador','Hoje, 09:18'],['MR','Marcos Ribeiro','Laboratório','Técnico','Ontem, 17:36'],['AC','Ana Paula Costa','Laboratório','Técnica','Ontem, 16:20']].map(x=>`<tr data-search="${x.join(' ').toLowerCase()}"><td><strong>${x[0]}</strong>　${x[1]}</td><td>${x[2]}</td><td>${x[3]}</td><td>${pill('done','Ativo')}</td><td>${x[4]}</td><td><button class="row-action" data-record="${x[1]}">···</button></td></tr>`).join('');return genericTable('Usuários e auditoria','Controle de acesso e histórico de atividades da plataforma.',['USUÁRIO','ÁREA','PERFIL','ACESSO','ÚLTIMA ATIVIDADE',''],rows)}
function portal(){return `${heading('Portal do cliente','Uma experiência simples e segura para consultar documentos.',`<div class="view-toggle"><button data-action="internal-view">Visão interna</button><button class="selected">Portal do cliente</button></div>`)}<section class="client-card"><div><div class="eyebrow" style="color:#ffb37c">ÁREA DO CLIENTE · DEMONSTRAÇÃO</div><h2>Hospital São Lucas</h2><p>CNPJ 12.345.678/0001-90 · Ribeirão Preto, SP</p></div><div class="client-emblem">♧</div></section><div class="portal-banner"><div class="status-symbol green">✓</div><div><strong>Portal seguro e personalizado</strong><span>Este acesso mostra somente documentos e equipamentos vinculados a esta empresa.</span></div><button class="btn" data-action="help">Como funciona?</button></div><div class="metric-mini"><div><span>Certificados disponíveis</span><strong>12</strong></div><div><span>Equipamentos cadastrados</span><strong>18</strong></div><div><span>Serviços em andamento</span><strong>3</strong></div></div><section class="panel table-panel"><div class="panel-heading"><div><h2>Certificados e documentos</h2><p>Arquivos liberados pela equipe técnica ANCAL</p></div><div class="table-tools"><input class="search" placeholder="⌕  Buscar certificado" aria-label="Buscar"><select class="filter-btn period-filter" aria-label="Filtrar por período"><option value="">Todos os períodos</option><option value="2026-10">Outubro de 2026</option><option value="2026-09">Setembro de 2026</option></select></div></div><div class="table-scroll"><table><thead><tr><th>CERTIFICADO</th><th>EQUIPAMENTO</th><th>Nº SÉRIE</th><th>DATA DE EMISSÃO</th><th>VALIDADE</th><th>DOCUMENTO</th></tr></thead><tbody>${records.filter(r=>r.client==='Hospital São Lucas' && ['review','done'].includes(r.type)).map((r,i)=>`<tr data-period="2026-10" data-search="${escapeHtml((r.id+' '+r.equipment+' certificado').toLowerCase())}"><td class="os-id">CERT-${2031-i}</td><td class="equip-cell">${escapeHtml(r.equipment)}<br><span>${r.tag}</span></td><td>${r.serial.split('·')[1]}</td><td>${r.due}</td><td>29 out, 2027</td><td><button class="btn" data-action="download" data-os="${r.id}">⇩ Baixar PDF</button></td></tr>`).join('')}</tbody></table><div class="empty-state" hidden><span class="empty-icon">⌕</span><strong>Nenhum resultado encontrado</strong><span>Tente buscar por outro termo.</span></div></div></section><p class="demo-note">Portal de demonstração com dados fictícios. Cada cliente visualiza apenas seus próprios equipamentos e documentos.</p>`}
function render(){
  portalMode=false;
  const view={dashboard,ordens,equipamentos:equipmentPage,calibracoes:calibracoesPage,padroes:padroesPage,certificados:certificates,clientes:clientPage,usuarios:usersPage}[currentPage]||dashboard;
  app.innerHTML=view();
  const table=app.querySelector('tbody');
  if(table && demoEntries[currentPage]){
    const columns=app.querySelectorAll('thead th').length;
    demoEntries[currentPage].forEach(entry=>{
      const cells=Array.from({length:columns},(_,i)=>i===0?`<td class="os-id">${escapeHtml(entry.name)}</td>`:i===columns-1?`<td><button class="row-action" data-record="${escapeHtml(entry.name)}" aria-label="Ver cadastro">···</button></td>`:`<td>${i===1?escapeHtml(entry.notes||'Cadastro de demonstração'):'—'}</td>`).join('');
      table.insertAdjacentHTML('afterbegin',`<tr data-search="${escapeHtml((entry.name+' '+entry.notes).toLowerCase())}">${cells}</tr>`);
    });
  }
  $('#crumb').textContent=pageNames[currentPage];
  document.querySelectorAll('.nav-link').forEach(b=>b.classList.toggle('active',b.dataset.page===currentPage));
  window.scrollTo(0,0);
}
function showToast(text){const el=$('#toast');el.textContent=text;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2600)}
let previousFocus;
function openModal(title,desc,form){previousFocus=document.activeElement;$('#modalBody').innerHTML=`<h2 id="modalTitle">${escapeHtml(title)}</h2><p>${escapeHtml(desc)}</p>${form}`;$('#modalBackdrop').classList.add('open');$('#modalBody').querySelector('input,select,button')?.focus();}
function closeModal(){$('#modalBackdrop').classList.remove('open');previousFocus?.focus();}
function newOsModal(){openModal('Nova ordem de serviço','Informe os dados iniciais. O registro ficará salvo neste navegador para a demonstração.',`<form id="newOsForm"><div class="form-grid"><div class="field full"><label for="osClient">Cliente</label><select id="osClient" name="client" required><option value="">Selecione uma empresa</option>${clients.map(c=>`<option>${c[0]}</option>`).join('')}</select></div><div class="field full"><label for="osEquipment">Equipamento</label><input id="osEquipment" name="equipment" required maxlength="100" placeholder="Ex.: Balança analítica · BAL-024"></div><div class="field"><label for="osService">Tipo de serviço</label><select id="osService" name="service"><option>Calibração</option><option>Manutenção</option><option>Qualificação térmica</option></select></div><div class="field"><label for="osDue">Prazo previsto</label><input id="osDue" name="due" type="date" required value="2026-11-05"></div><div class="field full"><label for="osNotes">Observações</label><input id="osNotes" name="notes" maxlength="200" placeholder="Informações adicionais (opcional)"></div></div><div class="modal-actions"><button type="button" class="btn" data-action="close-modal">Cancelar</button><button class="btn btn-primary">Criar ordem</button></div></form>`)}
function recordModal(id){const r=records.find(x=>x.id===id);if(r){openModal(`${r.id} · ${r.equipment}`,`Detalhes ilustrativos da ordem de serviço`, `<div class="record-modal">${pill(r.type,r.status)}<div class="record-detail"><div><span>Cliente</span><strong>${escapeHtml(r.client)}</strong></div><div><span>Equipamento</span><strong>${escapeHtml(r.equipment)} · ${r.tag}</strong></div><div><span>Modelo / nº série</span><strong>${escapeHtml(r.serial)}</strong></div><div><span>Responsável técnico</span><strong>${r.tech}</strong></div><div><span>Prazo</span><strong>${r.due}</strong></div><div><span>Padrão associado</span><strong>PAD-014 · Massa classe F1</strong></div></div><button class="btn btn-primary" data-action="open-calibration">Abrir calibração →</button> <button class="btn" data-action="open-certificates">Ver documentos</button></div>`)}else openModal(id,'Registro de demonstração',`<div class="record-detail"><div><span>Situação</span><strong>Ativo</strong></div><div><span>Próxima ação</span><strong>Consultar histórico técnico</strong></div></div><button class="btn btn-primary" data-action="close-modal">Entendi</button>`)}
function filterRows(input){
  const panel=input.closest('.panel');
  const q=panel.querySelector('.search')?.value.trim().toLowerCase()||'';
  const status=panel.querySelector('.status-filter')?.value||'';
  const period=panel.querySelector('.period-filter')?.value||'';
  let count=0;
  panel.querySelectorAll('tbody tr').forEach(row=>{
    const text=(row.dataset.search||row.textContent).toLowerCase();
    const matchesStatus=!status||[...row.querySelectorAll('.pill')].some(p=>p.textContent===status);
    const matchesPeriod=!period||row.dataset.period===period;
    const show=text.includes(q)&&matchesStatus&&matchesPeriod;
    row.hidden=!show;
    if(show)count++;
  });
  const empty=panel.querySelector('.empty-state');
  if(empty)empty.hidden=count!==0;
}
function statusFilter(button){
  const panel=button.closest('.panel');
  const values=[...new Set([...panel.querySelectorAll('tbody .pill')].map(p=>p.textContent))];
  if(!values.length){showToast('Use a busca para filtrar os registros desta lista.');panel.querySelector('.search')?.focus();return;}
  const select=document.createElement('select');
  select.className='filter-btn status-filter';
  select.setAttribute('aria-label','Filtrar por status');
  select.innerHTML='<option value="">Todos os status</option>'+values.map(value=>`<option>${escapeHtml(value)}</option>`).join('');
  button.replaceWith(select);
  select.focus();
}
function newRecordModal(){
  openModal('Novo cadastro · '+pageNames[currentPage],'Cadastre um registro ilustrativo para demonstrar a operação.',`<form id="newRecordForm"><div class="field"><label for="recordName">Nome / identificação</label><input id="recordName" name="name" required maxlength="100" placeholder="Digite um nome"></div><div class="field" style="margin-top:11px"><label for="recordNotes">Descrição</label><input id="recordNotes" name="notes" maxlength="200" placeholder="Informações adicionais"></div><div class="modal-actions"><button type="button" class="btn" data-action="close-modal">Cancelar</button><button class="btn btn-primary">Salvar cadastro</button></div></form>`);
}
function showPortal(){
  portalMode=true;
  app.innerHTML=portal();
  $('#crumb').textContent='Portal do cliente';
  document.querySelectorAll('.nav-link').forEach(b=>b.classList.remove('active'));
  window.scrollTo(0,0);
}
function closeNav(){$('#sidebar').classList.remove('open');$('#scrim').classList.remove('show');}
document.addEventListener('click',e=>{
  const nav=e.target.closest('[data-page]');
  if(nav){currentPage=nav.dataset.page;closeModal();render();closeNav();return;}
  const rec=e.target.closest('[data-record]');
  if(rec){recordModal(rec.dataset.record);return;}
  const control=e.target.closest('[data-action]');
  if(!control)return;
  switch(control.dataset.action){
    case 'new-os':newOsModal();break;
    case 'new-record':newRecordModal();break;
    case 'close-modal':closeModal();break;
    case 'export':window.ancalDownloads.exportRecords(records);showToast('Relatório CSV gerado.');break;
    case 'download':{
      const r=records.find(item=>item.id===control.dataset.os);
      if(r){window.ancalDownloads.certificate(r);showToast('PDF de demonstração gerado.');}
      break;
    }
    case 'filter':statusFilter(control);break;
    case 'backup':e.preventDefault();openModal('Backup e segurança','Visão ilustrativa do serviço de armazenamento.',`<div class="record-detail"><div><span>Frequência prevista</span><strong>Diária, às 03:00</strong></div><div><span>Armazenamento previsto</span><strong>Nuvem · São Paulo</strong></div><div><span>Retenção sugerida</span><strong>30 dias</strong></div><div><span>Cópia local</span><strong>Disponível na solução proposta</strong></div></div><button class="btn btn-primary" data-action="close-modal">Entendi</button>`);break;
    case 'internal-view':render();break;
    case 'portal-view':showPortal();break;
    case 'help':openModal('Acesso do cliente','O cliente acessa somente os documentos liberados pela equipe ANCAL.',`<div class="record-detail"><div><span>Privacidade</span><strong>Dados segmentados por empresa</strong></div><div><span>Documentos</span><strong>Certificados em PDF</strong></div><div><span>Acesso</span><strong>Portal independente</strong></div><div><span>Disponibilidade</span><strong>Via internet, 24 horas</strong></div></div><button class="btn btn-primary" data-action="close-modal">Entendi</button>`);break;
    case 'open-calibration':currentPage='calibracoes';closeModal();render();break;
    case 'open-certificates':currentPage='certificados';closeModal();render();break;
  }
});
document.addEventListener('input',e=>{if(e.target.matches('.search'))filterRows(e.target);});
document.addEventListener('change',e=>{if(e.target.matches('.status-filter,.period-filter'))filterRows(e.target);});
document.addEventListener('submit',e=>{
  if(!['newOsForm','newRecordForm'].includes(e.target.id))return;
  e.preventDefault();
  const form=e.target;
  if(!form.reportValidity())return;
  const data=new FormData(form);
  if(form.id==='newOsForm'){
    const client=clients.find(c=>c[0]===data.get('client'));
    const equipment=String(data.get('equipment')||'').trim();
    if(!client||!equipment){showToast('Informe o cliente e o equipamento.');return;}
    const number=Math.max(...records.map(r=>Number(r.id.split('-').pop())||0))+1;
    const due=new Date(String(data.get('due'))+'T12:00:00');
    if(Number.isNaN(due.getTime()))return;
    records.unshift({id:`OS-2026-${String(number).padStart(3,'0')}`,client:client[0],cnpj:client[1],equipment,tag:`NOVO-${number}`,due:due.toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'}),status:'Aguardando execução',type:'wait',tech:'Isabela Jurado',serial:'A informar',service:String(data.get('service')),notes:String(data.get('notes')||'')});
    currentPage='ordens';
  }else{
    const name=String(data.get('name')||'').trim();
    if(!name){showToast('Informe o nome do cadastro.');return;}
    (demoEntries[currentPage]||=[]).push({name,notes:String(data.get('notes')||'').trim()});
  }
  saveDemo();closeModal();render();
  showToast(form.id==='newOsForm'?'Ordem criada e adicionada à lista.':'Cadastro salvo e adicionado à lista.');
});
document.addEventListener('keydown',e=>{
  if(!$('#modalBackdrop').classList.contains('open'))return;
  if(e.key==='Escape'){closeModal();return;}
  if(e.key==='Tab'){
    const focusable=[...$('#modalBackdrop').querySelectorAll('button,input,select,a[href]')];
    const first=focusable[0],last=focusable.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
  }
});
$('#modalClose').addEventListener('click',closeModal);
$('#modalBackdrop').addEventListener('click',e=>{if(e.target.id==='modalBackdrop')closeModal();});
$('#menuToggle').addEventListener('click',()=>{$('#sidebar').classList.add('open');$('#scrim').classList.add('show');});
$('#closeNav').addEventListener('click',closeNav);
$('#scrim').addEventListener('click',closeNav);
$('#helpBtn').addEventListener('click',()=>{openModal('Ajuda e suporte','Orientações para a demonstração do sistema.',`<p>Use o menu para consultar registros. Em Nova OS, cadastre um serviço e veja o registro aparecer na lista. No Portal do cliente, consulte e baixe um PDF ilustrativo.</p><button class="btn btn-primary" data-action="close-modal">Entendi</button>`);});
$('.notification').addEventListener('click',()=>{openModal('Notificações','Pendências ilustrativas do laboratório.',`<div class="record-detail"><div><span>Revisão técnica</span><strong>2 ordens aguardam revisão</strong></div><div><span>Gestão de padrões</span><strong>2 padrões próximos do vencimento</strong></div></div><button class="btn btn-primary" data-action="close-modal">Entendi</button>`);});
$('.more').addEventListener('click',()=>{openModal('Isabela Jurado','Perfil de demonstração · Área técnica',`<button class="btn btn-primary" data-page="usuarios" data-action="close-modal">Ver usuários e auditoria</button>`);});
render();
