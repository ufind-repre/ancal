(function () {
  'use strict';

  const api = () => window.ancalAccess;
  const h = value => escapeHtml(value);
  const clean = value => String(value == null ? '' : value).trim();
  const key = value => window.ancalIdentity.key(value);
  const fold = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const portal = () => typeof portalMode !== 'undefined' && portalMode;
  const clone = value => JSON.parse(JSON.stringify(value));
  const state = { query: '', uf: 'all', type: 'all' };
  const sessions = new WeakMap();
  let sequence = 0;
  const typeOf = customer => customer?.personType || (key(customer).length === 11 ? 'pf' : 'pj');
  const ufOf = customer => clean(customer.state).toUpperCase() || /(?:,|\/)\s*([A-Z]{2})$/.exec(customer.city || '')?.[1] || '';
  const cityOf = customer => customer.state ? [customer.city, customer.state].filter(Boolean).join(' / ') : customer.city || 'Não informado';
  const list = () => portal() ? [] : api().getCompanies();
  const label = customer => window.ancalIdentity.label(customer);
  const newId = prefix => prefix + '-' + Date.now().toString(36) + '-' + (++sequence).toString(36);

  function button(title, action, id = '', primary = false) {
    return `<button type="button" class="btn${primary ? ' btn-primary' : ''}" data-customer-action="${action}" ${id ? `data-customer-id="${h(id)}"` : ''}>${title}</button>`;
  }
  function filtered() {
    const query = fold(state.query), documentQuery = key(state.query);
    return list().filter(customer => (state.type === 'all' || typeOf(customer) === state.type) && (state.uf === 'all' || ufOf(customer) === state.uf) && (!query || fold([customer.name, customer.tradeName, customer.legalName, customer.nickname, customer.cnpj, customer.city, customer.state, customer.phone, customer.mobile, ...(customer.emails || []), ...(Array.isArray(customer.contacts) ? customer.contacts.map(contact => contact.name) : [])].join(' ')).includes(query) || (documentQuery.length >= 3 && key(customer).includes(documentQuery))));
  }
  function rows(customers) {
    return customers.map(customer => `<tr><td><button type="button" class="customer-name-button" data-customer-action="edit" data-customer-id="${h(customer.id)}">${h(customer.name)}</button><small>${typeOf(customer) === 'pf' ? 'Pessoa física' : 'Pessoa jurídica'}${customer.nickname ? ' · ' + h(customer.nickname) : ''}</small></td><td>${h(typeOf(customer) === 'pj' ? customer.legalName || 'Não informado' : 'Não se aplica')}</td><td><span>${h(customer.phone || 'Não informado')}</span>${customer.mobile ? `<small>Celular: ${h(customer.mobile)}</small>` : ''}</td><td>${h(cityOf(customer))}</td><td><div class="customer-document-cell"><span>${h(customer.cnpj)}</span>${window.ancalExpiry?.badge(customer.cnpj) || ''}</div><small>${label(customer)}</small></td><td><div class="customer-row-actions">${button('Detalhes', 'detail', customer.id)}${button('Editar', 'edit', customer.id)}<button type="button" class="btn" data-access-action="company-users" data-access-id="${h(customer.id)}">Gerenciar acesso</button></div></td></tr>`).join('');
  }
  function resultText(matches) { return `${matches.length} ${matches.length === 1 ? 'cliente encontrado' : 'clientes encontrados'} · ${list().length} cadastrados`; }
  function render() {
    if (portal()) return '';
    const matches = filtered(), ufs = [...new Set(list().map(ufOf).filter(Boolean))].sort();
    return `${heading('Clientes', 'Cadastre pessoas físicas e jurídicas e mantenha os dados de atendimento em um só lugar.', button('＋ Novo cliente', 'new', '', true))}<section class="panel table-panel customer-workspace" data-customer-workspace><div class="customer-list-heading"><div><h2>Cadastro de clientes</h2><p>Dados cadastrais, contatos e acessos vinculados</p></div><span class="customer-local-badge">Salvo neste navegador</span></div><div class="customer-filters"><label><span>Buscar cliente</span><input type="search" data-customer-filter="query" value="${h(state.query)}" placeholder="Nome, razão social, documento ou contato" aria-label="Buscar cliente"></label><label><span>Tipo de pessoa</span><select data-customer-filter="type"><option value="all">Pessoas físicas e jurídicas</option><option value="pj" ${state.type === 'pj' ? 'selected' : ''}>Pessoa jurídica</option><option value="pf" ${state.type === 'pf' ? 'selected' : ''}>Pessoa física</option></select></label><label><span>Estado / UF</span><select data-customer-filter="uf"><option value="all">Todos os estados</option>${ufs.map(uf => `<option ${state.uf === uf ? 'selected' : ''}>${uf}</option>`).join('')}</select></label></div><div class="customer-result"><span data-customer-result aria-live="polite">${resultText(matches)}</span><button type="button" class="customer-text-button" data-customer-action="reset">Limpar filtros</button></div><div class="table-scroll" tabindex="0" role="region" aria-label="Tabela de clientes"><table class="customer-table"><thead><tr><th>NOME FANTASIA / NOME</th><th>RAZÃO SOCIAL</th><th>TELEFONE / CELULAR</th><th>CIDADE / UF</th><th>CPF / CNPJ</th><th>AÇÕES</th></tr></thead><tbody data-customer-rows>${rows(matches)}</tbody></table></div><div class="customer-empty" data-customer-empty ${matches.length ? 'hidden' : ''}><strong>Nenhum cliente encontrado</strong><span>Altere os filtros ou cadastre um novo cliente.</span></div></section><p class="customer-page-note">O CPF/CNPJ identifica o cliente e preserva os vínculos de equipamentos, ordens e certificados.</p>`;
  }
  function refresh() {
    if (portal()) return;
    const root = document.querySelector('[data-customer-workspace]');
    if (!root) return;
    const matches = filtered();
    root.querySelector('[data-customer-rows]').innerHTML = rows(matches);
    root.querySelector('[data-customer-result]').textContent = resultText(matches);
    root.querySelector('[data-customer-empty]').hidden = matches.length > 0;
    const uf = root.querySelector('[data-customer-filter="uf"]');
    uf.innerHTML = '<option value="all">Todos os estados</option>' + [...new Set(list().map(ufOf).filter(Boolean))].sort().map(value => `<option>${value}</option>`).join('');
    uf.value = state.uf;
  }
  function field(id, name, title, value, options = {}) {
    return `<div class="customer-field${options.full ? ' is-full' : ''}" ${options.pj ? 'data-customer-pj-only' : ''}><label for="${id}">${title}</label>${options.area ? `<textarea id="${id}" name="${name}" rows="5" maxlength="${options.max || 5000}">${h(value || '')}</textarea>` : `<input id="${id}" name="${name}" type="${options.type || 'text'}" maxlength="${options.max || 160}" value="${h(value || '')}" ${options.required ? 'required' : ''} ${options.readonly ? 'readonly' : ''} ${options.placeholder ? `placeholder="${h(options.placeholder)}"` : ''}>`}${options.help ? `<small>${options.help}</small>` : ''}</div>`;
  }
  function emailRow(value = '') {
    const id = newId('customerEmail');
    return `<div class="customer-email-row" data-customer-email-row><label class="customer-sr-only" for="${id}">E-mail do cliente</label><input id="${id}" type="email" maxlength="160" value="${h(value)}" data-customer-email placeholder="email@cliente.com.br"><button type="button" class="customer-remove" data-customer-email-remove aria-label="Remover e-mail">×</button></div>`;
  }
  function contactRow(contact = {}) {
    const id = contact.id || newId('contato');
    const contactField = (key, title, max, type = 'text') => `<label><span>${title}</span><input type="${type}" maxlength="${max}" value="${h(contact[key] || '')}" data-customer-contact-field="${key}"></label>`;
    return `<article class="customer-contact-row" data-customer-contact-row><input type="hidden" value="${h(id)}" data-customer-contact-field="id"><div class="customer-contact-heading"><strong>Contato do cliente</strong><button type="button" class="customer-remove" data-customer-contact-remove aria-label="Remover contato">×</button></div><div class="customer-contact-fields">${contactField('name', 'Nome', 120)}${contactField('role', 'Cargo / função', 120)}${contactField('phone', 'Telefone', 60)}${contactField('mobile', 'Celular', 60)}${contactField('email', 'E-mail', 160, 'email')}</div></article>`;
  }
  function openForm(id) {
    if (portal()) return;
    const customer = id ? api().getCompany(id) : null;
    if (id && !customer) return showToast('Cliente não encontrado.');
    const original = customer ? clone(customer) : null, type = customer ? typeOf(customer) : 'pj';
    const pjName = type === 'pj' ? customer?.tradeName || (!customer?.legalName ? customer?.name : '') : '';
    openModal(customer ? 'Editar cliente' : 'Novo cliente', 'Preencha os dados cadastrais e os contatos utilizados no atendimento.', `<form id="accessCompanyForm" data-customer-workspace-form novalidate><nav class="customer-form-tabs" role="tablist" aria-label="Cadastro do cliente">${[['general', 'Identificação'], ['address', 'Endereço'], ['contacts', 'Contatos'], ['notes', 'Observações']].map(([value, title], index) => `<button type="button" role="tab" data-customer-tab="${value}" class="${index ? '' : 'is-active'}" aria-selected="${!index}">${title}</button>`).join('')}</nav><section data-customer-panel="general"><div class="customer-form-grid"><div class="customer-field"><label for="customerPersonType">Tipo de pessoa</label><select id="customerPersonType" name="personType" ${customer ? 'disabled' : ''}><option value="pj" ${type === 'pj' ? 'selected' : ''}>Pessoa jurídica</option><option value="pf" ${type === 'pf' ? 'selected' : ''}>Pessoa física</option></select></div><div class="customer-field"><label id="customerDocumentLabel" for="customerDocument">${type === 'pf' ? 'CPF' : 'CNPJ'}</label><input id="customerDocument" name="document" type="text" maxlength="18" value="${h(customer?.document || customer?.cnpj || '')}" required ${customer ? 'readonly' : ''} aria-describedby="customerIdentityHelp"><small id="customerIdentityHelp">${customer ? 'O tipo e o documento são preservados para manter os vínculos e o histórico.' : 'CPF: 11 dígitos. CNPJ: 14 posições; as duas últimas numéricas.'}</small></div><div class="customer-lookup-block is-full" data-customer-pj-only><button type="button" class="btn" data-customer-action="lookup">Consultar CNPJ</button><span>Consulta pública BrasilAPI, pela internet. Preenche apenas campos vazios; revise antes de salvar.</span><p data-customer-lookup-status role="status" aria-live="polite"></p></div><div class="is-full" data-customer-pf-only>${field('customerName', 'name', 'Nome do cliente', type === 'pf' ? customer?.name : '', { max: 160, required: type === 'pf' })}</div>${field('customerTradeName', 'tradeName', 'Nome fantasia', pjName, { pj: true })}${field('customerLegalName', 'legalName', 'Razão social', type === 'pj' ? customer?.legalName : '', { pj: true })}${field('customerNickname', 'nickname', 'Apelido / identificação interna', customer?.nickname)}${field('customerStateRegistration', 'stateRegistration', 'Inscrição estadual', customer?.stateRegistration, { max: 60, pj: true })}${field('customerMunicipalRegistration', 'municipalRegistration', 'Inscrição municipal', customer?.municipalRegistration, { max: 60 })}${field('customerPhone', 'phone', 'Telefone', customer?.phone, { max: 60 })}${field('customerMobile', 'mobile', 'Celular', customer?.mobile, { max: 60 })}<div class="customer-field"><label for="customerShowValidity">Exibir validade nos certificados</label><select id="customerShowValidity" name="showValidity"><option value="unspecified" ${!customer?.showValidity || customer.showValidity === 'unspecified' ? 'selected' : ''}>Não informado</option><option value="yes" ${customer?.showValidity === 'yes' ? 'selected' : ''}>Sim</option><option value="no" ${customer?.showValidity === 'no' ? 'selected' : ''}>Não</option></select><small>Preferência do cadastro. Certificados já assinados permanecem preservados.</small></div><label class="customer-check"><input id="customerEndConsumer" name="endConsumer" type="checkbox" ${customer?.endConsumer ? 'checked' : ''}><span>Consumidor final</span></label></div></section><section data-customer-panel="address" hidden><div class="customer-form-grid">${field('customerPostalCode', 'postalCode', 'CEP', customer?.postalCode, { max: 10 })}${field('customerAddress', 'address', 'Endereço / logradouro', customer?.address, { max: 240 })}${field('customerNumber', 'number', 'Número', customer?.number, { max: 30 })}${field('customerComplement', 'complement', 'Complemento', customer?.complement, { max: 240 })}${field('customerNeighborhood', 'neighborhood', 'Bairro', customer?.neighborhood, { max: 120 })}${field('customerCity', 'city', 'Cidade', customer?.city, { max: 120 })}${field('customerState', 'state', 'Estado / UF', customer?.state, { max: 2, placeholder: 'SP' })}</div></section><section data-customer-panel="contacts" hidden><div class="customer-form-section-heading"><div><h3>E-mails do cliente</h3><p>Endereços utilizados para comunicação com este cliente.</p></div><button type="button" class="btn" data-customer-email-add>＋ E-mail</button></div><div class="customer-email-list" data-customer-emails>${(customer?.emails?.length ? customer.emails : ['']).map(emailRow).join('')}</div><div class="customer-form-section-heading"><div><h3>Contatos</h3><p>Pessoas de referência para o atendimento e as ordens.</p></div><button type="button" class="btn" data-customer-contact-add>＋ Contato</button></div><div data-customer-contacts>${(Array.isArray(customer?.contacts) ? customer.contacts : []).map(contactRow).join('')}</div></section><section data-customer-panel="notes" hidden>${field('customerObservations', 'observations', 'Observações do cliente', customer?.observations, { area: true, max: 5000, full: true })}</section><p class="customer-form-error" role="alert" tabindex="-1" hidden></p><p class="customer-form-note">Protótipo: dados e vínculos salvos neste navegador.</p><div class="modal-actions">${button('Cancelar', 'close')}<button type="submit" class="btn btn-primary">Salvar cliente</button></div></form>`);
    const form = document.getElementById('accessCompanyForm');
    sessions.set(form, { id: customer?.id || '', original, type, lookupToken: 0, aborter: null, timer: null });
    syncType(form);
  }
  function switchTab(form, selected) {
    form.querySelectorAll('[data-customer-tab]').forEach(button => { const active = button.dataset.customerTab === selected; button.classList.toggle('is-active', active); button.setAttribute('aria-selected', String(active)); });
    form.querySelectorAll('[data-customer-panel]').forEach(panel => { panel.hidden = panel.dataset.customerPanel !== selected; });
  }
  function syncType(form) {
    const session = sessions.get(form), type = session.original ? typeOf(session.original) : form.elements.personType.value;
    form.querySelectorAll('[data-customer-pj-only]').forEach(region => { region.hidden = type !== 'pj'; region.querySelectorAll('input,select,button').forEach(control => { control.disabled = type !== 'pj'; }); });
    form.querySelectorAll('[data-customer-pf-only]').forEach(region => { region.hidden = type !== 'pf'; region.querySelectorAll('input').forEach(control => { control.disabled = type !== 'pf'; control.required = type === 'pf'; }); });
    form.querySelector('#customerDocumentLabel').textContent = type === 'pf' ? 'CPF' : 'CNPJ';
    form.elements.document.inputMode = type === 'pf' ? 'numeric' : 'text';
    form.elements.document.placeholder = type === 'pf' ? '000.000.000-00' : '00.000.000/0000-00';
    session.type = type;
  }
  function showError(form, message, tab) {
    if (tab) switchTab(form, tab);
    const error = form.querySelector('.customer-form-error');
    error.textContent = message; error.hidden = false; error.focus();
  }
  function cancelLookup(form, reason = 'changed') {
    const session = sessions.get(form);
    if (!session) return;
    session.lookupToken++; session.abortReason = reason; session.aborter?.abort();
    if (session.timer) clearTimeout(session.timer);
    const button = form.querySelector('[data-customer-action="lookup"]');
    if (button) { button.disabled = session.type !== 'pj'; button.textContent = 'Consultar CNPJ'; }
  }
  function liveLookup(form, token, documentKey) {
    const session = sessions.get(form);
    return !portal() && form.isConnected && document.querySelector('#accessCompanyForm') === form && document.querySelector('#modalBackdrop')?.classList.contains('open') && session?.lookupToken === token && session.type === 'pj' && key(form.elements.document.value) === documentKey;
  }
  async function lookup(form) {
    if (portal() || !sessions.has(form)) return;
    const session = sessions.get(form), documentKey = key(form.elements.document.value), status = form.querySelector('[data-customer-lookup-status]');
    if (session.type !== 'pj' || !window.ancalIdentity.validDocument(documentKey, 'pj')) { status.textContent = 'A consulta pública é disponível apenas para CNPJ válido. CPF deve ser preenchido manualmente.'; return; }
    if (typeof fetch !== 'function' || typeof AbortController !== 'function') { status.textContent = 'Consulta indisponível neste ambiente. Preencha os dados manualmente.'; return; }
    cancelLookup(form);
    const token = session.lookupToken, controller = new AbortController();
    session.aborter = controller; session.abortReason = '';
    const button = form.querySelector('[data-customer-action="lookup"]');
    button.disabled = true; button.textContent = 'Consultando…'; status.textContent = 'Consultando a BrasilAPI…';
    session.timer = setTimeout(() => { session.abortReason = 'timeout'; controller.abort(); }, 10000);
    try {
      const response = await fetch('https://brasilapi.com.br/api/cnpj/v1/' + documentKey, { signal: controller.signal, headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(response.status === 404 ? 'CNPJ não encontrado na consulta pública.' : 'A consulta pública não respondeu com sucesso.');
      const data = await response.json();
      if (!liveLookup(form, token, documentKey)) return;
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('A consulta pública retornou uma resposta inválida.');
      if (data.cnpj && key(data.cnpj) !== documentKey) throw new Error('A resposta da consulta não corresponde ao CNPJ informado.');
      const mapping = { tradeName: data.nome_fantasia, legalName: data.razao_social, phone: data.ddd_telefone_1, mobile: data.ddd_telefone_2, address: data.logradouro, number: data.numero, complement: data.complemento, neighborhood: data.bairro, postalCode: data.cep, state: data.uf, city: data.municipio };
      let filled = 0;
      Object.entries(mapping).forEach(([name, value]) => { const field = form.elements[name]; if (field && !field.value.trim() && clean(value)) { field.value = clean(value); filled++; } });
      const emailInputs = [...form.querySelectorAll('[data-customer-email]')];
      if (!emailInputs.some(input => input.value.trim()) && typeof data.email === 'string') {
        const emails = data.email.split(/[;,]/).map(clean).filter(email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)).slice(0, 20);
        if (emails.length) { form.querySelector('[data-customer-emails]').innerHTML = emails.map(emailRow).join(''); filled += emails.length; }
      }
      status.textContent = filled ? `${filled} ${filled === 1 ? 'campo vazio preenchido' : 'campos vazios preenchidos'}. Revise os dados e salve para confirmar.` : 'Consulta concluída. Os campos já preenchidos foram preservados.';
    } catch (failure) {
      if (!liveLookup(form, token, documentKey)) return;
      status.textContent = session.abortReason === 'timeout' ? 'A consulta excedeu o tempo de espera. Preencha manualmente ou tente novamente.' : failure.name === 'AbortError' ? 'Consulta interrompida. Os dados digitados foram preservados.' : `${failure.message || 'Consulta indisponível.'} Você pode preencher os dados manualmente.`;
    } finally {
      if (session.lookupToken === token) { clearTimeout(session.timer); session.timer = null; session.aborter = null; button.disabled = session.type !== 'pj'; button.textContent = 'Consultar CNPJ'; }
    }
  }
  function submit(form) {
    if (portal()) return;
    const session = sessions.get(form);
    if (!session) return showError(form, 'Abra novamente o cadastro do cliente.');
    if (!form.checkValidity()) {
      const invalid = form.querySelector(':invalid');
      if (invalid) { const panel = invalid.closest('[data-customer-panel]'); if (panel) switchTab(form, panel.dataset.customerPanel); }
      showError(form, 'Revise os campos obrigatórios e os e-mails informados.'); form.reportValidity(); return;
    }
    const value = name => form.elements[name]?.value || '';
    const type = session.original ? typeOf(session.original) : value('personType');
    const contacts = [...form.querySelectorAll('[data-customer-contact-row]')].map(row => Object.fromEntries([...row.querySelectorAll('[data-customer-contact-field]')].map(input => [input.dataset.customerContactField, input.value.trim()]))).filter(contact => ['name', 'role', 'phone', 'mobile', 'email'].some(field => contact[field]));
    const payload = { personType: type, document: session.original ? session.original.document || session.original.cnpj : value('document'), nickname: value('nickname'), municipalRegistration: value('municipalRegistration'), phone: value('phone'), mobile: value('mobile'), emails: [...form.querySelectorAll('[data-customer-email]')].map(input => input.value.trim()).filter(Boolean), address: value('address'), number: value('number'), postalCode: value('postalCode'), state: value('state'), city: value('city'), neighborhood: value('neighborhood'), complement: value('complement'), endConsumer: form.elements.endConsumer.checked, observations: value('observations'), contacts, showValidity: value('showValidity') };
    if (type === 'pf') payload.name = value('name');
    else { payload.tradeName = value('tradeName'); payload.legalName = value('legalName'); payload.stateRegistration = value('stateRegistration'); }
    const result = session.id ? api().updateCompany(session.id, payload) : api().createCompany(payload);
    if (!result.ok) return showError(form, result.error, /contato|e-mail/.test(result.error) ? 'contacts' : /CEP|UF/.test(result.error) ? 'address' : 'general');
    cancelLookup(form, 'saved'); closeModal();
    if (typeof currentPage !== 'undefined' && currentPage === 'clientes') {
      if (typeof window.render === 'function') window.render();
      else { app.innerHTML = render(); window.ancalNavigation?.sync(); }
    }
    showToast(session.id ? 'Cadastro do cliente atualizado.' : 'Cliente cadastrado.');
  }
  function definition(title, value) { return `<div><dt>${title}</dt><dd>${h(value || 'Não informado')}</dd></div>`; }
  function showDetail(id) {
    if (portal()) return;
    const customer = api().getCompany(id);
    if (!customer) return showToast('Cliente não encontrado.');
    const contacts = Array.isArray(customer.contacts) ? customer.contacts : [];
    openModal('Cadastro do cliente', customer.name, `<div class="customer-detail"><span class="customer-type-pill">${typeOf(customer) === 'pf' ? 'Pessoa física' : 'Pessoa jurídica'}</span><dl class="customer-detail-grid">${definition('Nome', customer.name)}${typeOf(customer) === 'pj' ? definition('Razão social', customer.legalName) : ''}${definition(label(customer), customer.cnpj)}${definition('Apelido', customer.nickname)}${definition('Telefone', customer.phone)}${definition('Celular', customer.mobile)}${definition('E-mails', (customer.emails || []).join('\n'))}${definition('Cidade / UF', cityOf(customer))}${definition('Endereço', [customer.address, customer.number, customer.complement].filter(Boolean).join(', '))}${definition('Bairro / CEP', [customer.neighborhood, customer.postalCode].filter(Boolean).join(' · '))}${typeOf(customer) === 'pj' ? definition('Inscrição estadual', customer.stateRegistration) : ''}${definition('Inscrição municipal', customer.municipalRegistration)}${definition('Consumidor final', customer.endConsumer ? 'Sim' : 'Não')}${definition('Validade nos certificados', { unspecified: 'Não informado', yes: 'Sim', no: 'Não' }[customer.showValidity] || 'Não informado')}${definition('Observações', customer.observations)}</dl><h3 class="customer-detail-title">Contatos</h3>${contacts.length ? `<ul class="customer-detail-contacts">${contacts.map(contact => `<li><strong>${h(contact.name)}</strong><span>${h([contact.role, contact.phone, contact.mobile, contact.email].filter(Boolean).join(' · '))}</span></li>`).join('')}</ul>` : '<p class="customer-detail-note">Nenhum contato cadastrado.</p>'}${window.ancalExpiry?.banner(customer.cnpj) || ''}<div class="modal-actions">${button('Editar cadastro', 'edit', id)}<button type="button" class="btn" data-access-action="company-users" data-access-id="${h(id)}">Gerenciar acessos</button>${button('Fechar', 'close')}</div></div>`);
  }

  document.addEventListener('input', event => {
    if (portal()) return;
    if (event.target.matches('[data-customer-filter="query"]')) { state.query = event.target.value; refresh(); }
    const form = event.target.closest('[data-customer-workspace-form]');
    if (form && event.target.id === 'customerDocument') { cancelLookup(form); form.querySelector('[data-customer-lookup-status]').textContent = ''; }
  });
  document.addEventListener('change', event => {
    if (portal()) return;
    if (event.target.matches('[data-customer-filter]')) { state[event.target.dataset.customerFilter] = event.target.value; refresh(); }
    const form = event.target.closest('[data-customer-workspace-form]');
    if (form && event.target.id === 'customerPersonType') { cancelLookup(form); syncType(form); form.querySelector('[data-customer-lookup-status]').textContent = ''; }
  });
  document.addEventListener('click', event => {
    const control = event.target.closest('[data-customer-action],[data-customer-tab],[data-customer-email-add],[data-customer-email-remove],[data-customer-contact-add],[data-customer-contact-remove]');
    if (!control || portal()) return;
    event.preventDefault();
    const id = control.dataset.customerId, action = control.dataset.customerAction;
    if (action === 'new') return openForm();
    if (action === 'edit') return openForm(id);
    if (action === 'detail') return showDetail(id);
    if (action === 'reset') { Object.assign(state, { query: '', uf: 'all', type: 'all' }); const root = document.querySelector('[data-customer-workspace]'); root?.querySelectorAll('[data-customer-filter]').forEach(input => { input.value = state[input.dataset.customerFilter]; }); return refresh(); }
    const form = control.closest('[data-customer-workspace-form]');
    if (action === 'close') { if (form) cancelLookup(form, 'closed'); return closeModal(); }
    if (!form || !sessions.has(form)) return;
    if (action === 'lookup') return lookup(form);
    if (control.hasAttribute('data-customer-tab')) return switchTab(form, control.dataset.customerTab);
    if (control.hasAttribute('data-customer-email-add')) { const list = form.querySelector('[data-customer-emails]'); if (list.children.length >= 20) return showError(form, 'Use até 20 e-mails.', 'contacts'); list.insertAdjacentHTML('beforeend', emailRow()); list.lastElementChild.querySelector('input').focus(); }
    if (control.hasAttribute('data-customer-email-remove')) control.closest('[data-customer-email-row]').remove();
    if (control.hasAttribute('data-customer-contact-add')) { const list = form.querySelector('[data-customer-contacts]'); if (list.children.length >= 20) return showError(form, 'Use até 20 contatos.', 'contacts'); list.insertAdjacentHTML('beforeend', contactRow()); list.lastElementChild.querySelector('[data-customer-contact-field="name"]').focus(); }
    if (control.hasAttribute('data-customer-contact-remove')) control.closest('[data-customer-contact-row]').remove();
  });
  document.addEventListener('submit', event => { if (!event.target.matches('[data-customer-workspace-form]')) return; event.preventDefault(); if (!portal()) submit(event.target); });
  document.addEventListener('ancal-access-changed', refresh);

  window.ancalCustomersWorkspace = { render, openForm, showDetail };
})();
