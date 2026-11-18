(function () {
  'use strict';

  const text = value => value == null ? '' : typeof value === 'string' || typeof value === 'number' ? String(value).replace(/\r\n?/g, '\n') : '';
  const h = value => typeof escapeHtml === 'function' ? escapeHtml(value) : text(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const fold = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const fields = {
    parties: ['requesterName', 'requesterCnpj', 'requesterAddress', 'customerName', 'customerCnpj', 'customerAddress'],
    issuer: ['name','document','stateRegistration','address','phone','email','website','documentControl'],
    instrument: ['quantity','manufacturer', 'model', 'range', 'resolution', 'location', 'className', 'calibrationPlace', 'capacityMin', 'capacityMax', 'division'],
    environment: ['temperature', 'pressure', 'humidity', 'liquidTemperature'],
    standards: ['code', 'description', 'certificate', 'traceability', 'validUntilISO'],
    row: ['reference', 'indication', 'error', 'uncertainty', 'veff', 'k', 'test', 'acceptance', 'result'],
    observations: ['text', 'admissibleDeviation', 'criterionUnit', 'criterionDescription', 'periodicityMonths', 'nextCalibrationISO']
  };
  const columnLabels = { reference: 'Referência', indication: 'Indicação do instrumento', error: 'Erro', uncertainty: 'Incerteza', veff: 'Veff', k: 'Fator k', test: 'Ensaio / ponto', acceptance: 'Critério de aceitação', result: 'Resultado' };
  const definitions = [
    { id: 'general', label: 'Geral', keys: ['reference', 'indication', 'error', 'uncertainty', 'veff', 'k'] },
    { id: 'volumetric', label: 'Volumétricos', keys: ['reference', 'indication', 'error', 'uncertainty', 'k'], labels: { indication: 'Média das leituras' } },
    { id: 'temperature', label: 'Temperatura', keys: ['reference', 'indication', 'error', 'uncertainty', 'veff', 'k'], labels: { reference: 'Valor indicado padrão', indication: 'Valor indicado instrumento' } },
    { id: 'mass', label: 'Massa / peso padrão', keys: ['reference', 'indication', 'uncertainty', 'k'], labels: { reference: 'Valor nominal', indication: 'Valor do instrumento' } },
    { id: 'balance', label: 'Balanças', keys: ['reference', 'indication', 'error', 'uncertainty', 'k'], labels: { reference: 'Carga de referência', indication: 'Indicação da balança' } },
    { id: 'qualification', label: 'Qualificações', keys: ['test', 'reference', 'indication', 'acceptance', 'result'] }
  ];
  const contexts = new WeakMap();

  function template(id) {
    const definition = definitions.find(item => item.id === id) || definitions[0];
    return { id: definition.id, label: definition.label, columns: definition.keys.map(key => ({ key, label: definition.labels?.[key] || columnLabels[key] })) };
  }

  function templates() { return definitions.map(definition => template(definition.id)); }
  function orderedResultKeys(id) {
    const visible = template(id).columns.map(column => column.key);
    return [...visible, ...fields.row.filter(key => !visible.includes(key))];
  }
  function pick(value, keys) { return Object.fromEntries(keys.map(key => [key, text(value?.[key])])); }
  function blankRow() { return pick({}, fields.row); }
  function blankStandard() { return pick({}, fields.standards); }

  function normalize(value) {
    if (!object(value)) return null;
    const sourceParties = object(value.parties) ? value.parties : {};
    const parties = { ...pick(sourceParties, fields.parties), customerSameAsRequester: sourceParties.customerSameAsRequester === true };
    if (parties.customerSameAsRequester) {
      parties.customerName = parties.requesterName;
      parties.customerCnpj = parties.requesterCnpj;
      parties.customerAddress = parties.requesterAddress;
    }
    const observations = object(value.observations) ? value.observations : {};
    return {
      version: 1,
      templateId: template(value.templateId).id,
      parties,
      issuer: pick(value.issuer, fields.issuer),
      instrument: pick(value.instrument, fields.instrument),
      environment: pick(value.environment, fields.environment),
      procedure: text(value.procedure),
      standards: (Array.isArray(value.standards) ? value.standards : []).map(standard => pick(standard, fields.standards)),
      results: { unit: text(value.results?.unit), rows: (Array.isArray(value.results?.rows) ? value.results.rows : []).map(row => pick(row, fields.row)) },
      observations: {
        ...pick(observations, fields.observations),
        showValidity: observations.showValidity !== false,
        includeConformity: observations.includeConformity === true,
        criterionType: ['fixed', 'percent_range', 'custom'].includes(observations.criterionType) ? observations.criterionType : 'fixed',
        decision: ['not_declared', 'approved', 'rejected'].includes(observations.decision) ? observations.decision : 'not_declared',
        nextCalibrationPrecision: ['day', 'month'].includes(observations.nextCalibrationPrecision) ? observations.nextCalibrationPrecision : /^\d{4}-\d{2}$/.test(text(observations.nextCalibrationISO)) ? 'month' : 'day',
        includeSchedule: observations.includeSchedule === true
      },
      supplement: text(value.supplement)
    };
  }

  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function validMonth(value) {
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && validDate(`${value}-01`);
  }

  function validate(value, calibrationDateISO) {
    const technical = normalize(value);
    if (!technical) return 'Os dados técnicos devem ser um objeto válido.';
    const tooLong = entry => typeof entry === 'string' ? entry.length > 5000 : Array.isArray(entry) ? entry.some(tooLong) : object(entry) ? Object.values(entry).some(tooLong) : false;
    const issuerLimits={name:300,document:60,stateRegistration:80,address:700,phone:160,email:254,website:254,documentControl:120};
    if(Object.entries(issuerLimits).some(([field,limit])=>technical.issuer[field].length>limit))return 'Revise o tamanho dos dados do laboratório emitente e do rodapé.';
    if (tooLong(technical)) return 'Cada campo técnico deve conter no máximo 5.000 caracteres.';
    if (technical.standards.length > 20) return 'Use no máximo 20 padrões por certificado.';
    if (technical.results.rows.length > 50) return 'Use no máximo 50 linhas de resultados por certificado.';
    if (technical.standards.some(standard => standard.validUntilISO && !validDate(standard.validUntilISO))) return 'Informe uma data real para a validade de cada padrão preenchido.';
    const observations = technical.observations;
    if (observations.periodicityMonths && (!/^\d+$/.test(observations.periodicityMonths) || Number(observations.periodicityMonths) > 1200)) return 'A periodicidade deve ser um número inteiro entre 0 e 1.200 meses. Zero omite a periodicidade no certificado.';
    if (observations.nextCalibrationISO) {
      const monthly = observations.nextCalibrationPrecision === 'month';
      if (monthly ? !validMonth(observations.nextCalibrationISO) : !validDate(observations.nextCalibrationISO)) return monthly ? 'Informe um mês e ano reais para a próxima calibração.' : 'Informe uma data real para a próxima calibração.';
      if (validDate(calibrationDateISO || '') && observations.nextCalibrationISO < (monthly ? calibrationDateISO.slice(0, 7) : calibrationDateISO)) return 'A próxima calibração não pode anteceder a data desta calibração.';
    }
    if (observations.includeConformity) {
      if (!observations.admissibleDeviation.trim()) return 'Informe o desvio admissível para incluir o parecer de conformidade.';
      if (observations.criterionType !== 'fixed' && !observations.criterionDescription.trim()) return 'Descreva o critério e sua base de avaliação para o parecer percentual ou personalizado.';
    }
    return '';
  }

  function defaults(certificate = {}, order = {}, equipment = {}) {
    if (certificate.technical) return normalize(certificate.technical);
    const name = fold([certificate.equipmentName, certificate.equipmentType, equipment.name, equipment.equipmentType, order.service].join(' '));
    const templateId = /qualifica|autoclave|estufa|camara/.test(name) ? 'qualification' : /balanca/.test(name) ? 'balance' : /peso|massa/.test(name) ? 'mass' : /termomet|temperatura|termohigro|controlador/.test(name) ? 'temperature' : /pipeta|proveta|balao|picnometro|repetidor|bureta/.test(name) ? 'volumetric' : 'general';
    const ranges = Array.isArray(equipment.measurementRanges) ? equipment.measurementRanges : [];
    const rangeText = ranges.map(range => `${text(range.label)}: ${text(range.min)} a ${text(range.max)} ${text(range.unit)}`.trim()).join('\n');
    const resolutionText = ranges.filter(range => text(range.resolution)).map(range => `${ranges.length > 1 ? text(range.label) + ': ' : ''}${text(range.resolution)} ${text(range.unit)}`.trim()).join('\n');
    const instrument = { ...pick(equipment, fields.instrument) };
    if (!instrument.range && rangeText) instrument.range = rangeText;
    if (!instrument.resolution && resolutionText) instrument.resolution = resolutionText;
    if (!instrument.location) instrument.location = text(equipment.clientSector);
    const frequency = Number(equipment.calibrationFrequencyMonths);
    const periodicity = Number.isInteger(frequency) && frequency > 0 && frequency <= 1200 ? String(frequency) : '';
    let certificateObservation = text(equipment.certificateObservation);
    if (!['signed','cancelled'].includes(certificate.status) && equipment.id && typeof window.ancalEquipment?.get === 'function') {
      const current = window.ancalEquipment.get(equipment.id);
      const owner = window.ancalIdentity?.key(order.cnpj || certificate.cnpj || equipment.cnpj);
      if (current && current.id === equipment.id && window.ancalIdentity?.key(current.cnpj) === owner && Object.hasOwn(current,'certificateObservation')) certificateObservation = text(current.certificateObservation);
    }
    const additional = Array.isArray(equipment.additionalFields) ? equipment.additionalFields.map(field => `${text(field.label)}: ${text(field.value)}`).join('\n') : '';
    const ownerKey = window.ancalIdentity?.key(order.cnpj || certificate.cnpj) || order.cnpj || certificate.cnpj;
    const requester = order.customerSnapshot || window.ancalAccess?.getCompanies().find(company => (window.ancalIdentity?.key(company.cnpj) || company.cnpj) === ownerKey) || {};
    const customer = order.certificateCustomerId && order.certificateCustomerId !== 'same' ? order.certificateCustomerSnapshot || requester : requester;
    const customerPreference = ['yes','no'].includes(customer.showValidity) ? customer.showValidity : requester.showValidity;
    const showValidity = customerPreference !== 'no';
    const address = party => [party.address,party.number,party.complement,party.neighborhood,party.city,party.state,party.postalCode].filter(Boolean).join(' · ');
    const sameParty = !order.certificateCustomerId || order.certificateCustomerId === 'same' || (window.ancalIdentity?.key(customer.cnpj) || customer.cnpj) === (window.ancalIdentity?.key(requester.cnpj) || requester.cnpj);
    return normalize({
      templateId,
      parties: { requesterName: requester.legalName || requester.name || order.client || certificate.client || '', requesterCnpj: order.cnpj || certificate.cnpj || '', requesterAddress: order.requesterAddress || order.clientAddress || address(requester), customerSameAsRequester: sameParty, customerName: customer.legalName || customer.name || '', customerCnpj: customer.cnpj || '', customerAddress: address(customer) },
      instrument, supplement: additional,
      standards: [], results: { unit: '', rows: [blankRow()] }, observations: { text: certificateObservation, includeConformity: false, decision: 'not_declared', showValidity, periodicityMonths: periodicity, includeSchedule: Boolean(periodicity) && showValidity }
    });
  }

  function dateLabel(value) { return validDate(value || '') || validMonth(value || '') ? value.split('-').reverse().join('/') : text(value); }

  function observations(value) {
    const technical = normalize(value);
    if (!technical) return [];
    const selected = technical.observations;
    const lines = selected.text ? selected.text.split('\n') : [];
    if (selected.includeConformity) {
      const deviation = selected.admissibleDeviation.trim();
      const unit = selected.criterionUnit.trim();
      if (deviation) lines.push(`Desvio admissível informado pelo cliente: ${deviation}${unit ? ` ${unit}` : ''}.`);
      if (selected.criterionDescription.trim()) lines.push(`Critério informado: ${selected.criterionDescription}`);
      if (selected.decision === 'approved') lines.push('Parecer informado pela equipe: APROVADO para uso.');
      else if (selected.decision === 'rejected') lines.push('Parecer informado pela equipe: REPROVADO para uso.');
    }
    if (selected.includeSchedule && selected.showValidity) {
      if (Number(selected.periodicityMonths) > 0) lines.push(`Periodicidade de calibração informada pelo cliente: ${selected.periodicityMonths} ${Number(selected.periodicityMonths) === 1 ? 'mês' : 'meses'}.`);
      if (selected.nextCalibrationISO) lines.push(`Próxima calibração: ${dateLabel(selected.nextCalibrationISO)}.`);
    }
    return lines;
  }

  function input(path, label, value, options = {}) {
    const id = `ct-${path.replace(/\./g, '-')}`;
    const attrs = `id="${h(id)}" name="technical_${h(path.replace(/\./g, '_'))}" data-technical-field="${h(path)}"`;
    const control = options.area ? `<textarea ${attrs} rows="${options.rows || 3}" maxlength="5000">${h(value)}</textarea>` : `<input ${attrs} type="${options.type || 'text'}" maxlength="5000" value="${h(value)}"${options.min ? ` min="${h(options.min)}"` : ''}${options.max ? ` max="${h(options.max)}"` : ''}${options.step ? ` step="${h(options.step)}"` : ''}>`;
    return `<div class="certificate-technical-field${options.full ? ' certificate-technical-full' : ''}"><label for="${id}">${h(label)}</label>${control}${options.help ? `<small>${h(options.help)}</small>` : ''}</div>`;
  }

  function checkbox(path, label, checked) {
    return `<label class="certificate-technical-check"><input type="checkbox" name="technical_${h(path.replace(/\./g, '_'))}" data-technical-field="${h(path)}"${checked ? ' checked' : ''}><span>${h(label)}</span></label>`;
  }

  function select(path, label, value, options) {
    const id = `ct-${path.replace(/\./g, '-')}`;
    return `<div class="certificate-technical-field"><label for="${id}">${h(label)}</label><select id="${id}" name="technical_${h(path.replace(/\./g, '_'))}" data-technical-field="${h(path)}">${options.map(([key, caption]) => `<option value="${h(key)}"${key === value ? ' selected' : ''}>${h(caption)}</option>`).join('')}</select></div>`;
  }

  function standardRow(standard) {
    const labels = ['Código', 'Descrição', 'Certificado', 'Rastreabilidade', 'Validade'];
    return `<tr data-technical-row="standards">${fields.standards.map((key, index) => `<td><input type="${key === 'validUntilISO' ? 'date' : 'text'}" data-technical-cell="${key}" maxlength="5000" value="${h(standard[key])}" aria-label="${labels[index]} do padrão"></td>`).join('')}<td><button type="button" class="certificate-technical-remove" data-technical-remove aria-label="Remover padrão">×</button></td></tr>`;
  }

  function resultRow(row, templateId) {
    const columns = template(templateId).columns;
    return `<tr data-technical-row="results">${orderedResultKeys(templateId).map(key => `<td data-technical-column="${key}"${columns.some(column => column.key === key) ? '' : ' hidden'}><input type="text" data-technical-cell="${key}" maxlength="5000" value="${h(row[key])}" aria-label="${h(columns.find(column => column.key === key)?.label || columnLabels[key])}"></td>`).join('')}<td><button type="button" class="certificate-technical-remove" data-technical-remove aria-label="Remover linha de resultados">×</button></td></tr>`;
  }

  function section(number, title, content, opened = false) {
    return `<details class="certificate-technical-section"${opened ? ' open' : ''}><summary><span>${number}</span>${title}</summary><div class="certificate-technical-section-body">${content}</div></details>`;
  }

  function form(value) {
    const technical = normalize(value) || defaults();
    const parties = technical.parties, instrument = technical.instrument, environment = technical.environment, selected = technical.observations;
    const issuerLabels={name:'Nome do laboratório emitente',document:'CPF/CNPJ do emitente',stateRegistration:'Inscrição estadual',address:'Endereço completo do laboratório',phone:'Telefone',email:'E-mail',website:'Site',documentControl:'Controle do documento / procedimento (rodapé)'};
    const issuerForm='<details class="certificate-technical-section"><summary>Laboratório emitente e rodapé</summary><div class="certificate-technical-section-body"><p class="certificate-technical-help">Somente os dados preenchidos serão exibidos no rodapé deste certificado. Clientes e solicitantes permanecem separados do laboratório emitente.</p><div class="certificate-technical-grid">'+fields.issuer.map(key=>input('issuer.'+key,issuerLabels[key],technical.issuer[key],{full:key==='address'})).join('')+'</div></div></details>';
    const partiesForm = `<p class="certificate-technical-help">O solicitante é quem contrata e envia o instrumento. O cliente final pode ser outra empresa; isso não altera a empresa responsável pela OS nem concede acesso ao portal.</p><div class="certificate-technical-grid">${input('parties.requesterName', 'Solicitante / empresa contratante', parties.requesterName, { full: true })}${input('parties.requesterCnpj', 'CPF/CNPJ do solicitante', parties.requesterCnpj)}${input('parties.requesterAddress', 'Endereço do solicitante', parties.requesterAddress, { full: true })}</div>${checkbox('parties.customerSameAsRequester', 'Cliente final é o próprio solicitante', parties.customerSameAsRequester)}<div class="certificate-technical-grid" data-technical-customer${parties.customerSameAsRequester ? ' hidden' : ''}>${input('parties.customerName', 'Cliente final', parties.customerName, { full: true })}${input('parties.customerCnpj', 'CPF/CNPJ do cliente final', parties.customerCnpj)}${input('parties.customerAddress', 'Endereço do cliente final', parties.customerAddress, { full: true })}</div>`;
    const instrumentLabels = { quantity: 'Quantidade', manufacturer: 'Fabricante', model: 'Modelo', range: 'Faixa de indicação', resolution: 'Resolução', location: 'Localização do instrumento', className: 'Classe', calibrationPlace: 'Local da calibração', capacityMin: 'Capacidade mínima', capacityMax: 'Capacidade máxima', division: 'Divisão' };
    const instrumentForm = `<p class="certificate-technical-help">Dados específicos deste certificado. O cadastro do equipamento e a OS permanecem preservados.</p><div class="certificate-technical-grid">${fields.instrument.map(key => input(`instrument.${key}`, instrumentLabels[key], instrument[key])).join('')}${window.ancalOptionalDate.render({id:'ct-observations-nextCalibrationISO',name:'technical_observations_nextCalibrationISO',label:'Próxima calibração',value:selected.nextCalibrationISO,field:'observations.nextCalibrationISO',precisionField:'observations.nextCalibrationPrecision',help:'Dia opcional. Somente mês e ano: exibe MM/AAAA. Tudo vazio: não aparece no certificado.'})}</div>`;
    const environmentLabels = { temperature: 'Temperatura ambiente', pressure: 'Pressão barométrica', humidity: 'Umidade relativa', liquidTemperature: 'Temperatura do líquido' };
    const standardsForm = `<div class="certificate-technical-scroll"><table class="certificate-technical-table"><thead><tr><th>Código</th><th>Descrição</th><th>Certificado</th><th>Rastreabilidade</th><th>Validade</th><th></th></tr></thead><tbody data-technical-rows="standards">${technical.standards.map(standardRow).join('')}</tbody></table></div><button type="button" class="btn certificate-technical-add" data-technical-add="standards">＋ Adicionar padrão</button><small class="certificate-technical-help">Até 20 padrões. Informe a rastreabilidade utilizada nesta calibração.</small>`;
    const columns = template(technical.templateId).columns;
    const resultsForm = `${input('results.unit', 'Unidade dos resultados', technical.results.unit)}<p class="certificate-technical-help">Valores transcritos pela equipe. Nenhum erro, incerteza ou parecer é calculado automaticamente. A troca de modelo preserva os campos já digitados.</p><div class="certificate-technical-scroll"><table class="certificate-technical-table certificate-technical-results"><thead><tr>${orderedResultKeys(technical.templateId).map(key => `<th data-technical-column="${key}"${columns.some(column => column.key === key) ? '' : ' hidden'}>${h(columns.find(column => column.key === key)?.label || columnLabels[key])}</th>`).join('')}<th></th></tr></thead><tbody data-technical-rows="results">${technical.results.rows.map(row => resultRow(row, technical.templateId)).join('')}</tbody></table></div><button type="button" class="btn certificate-technical-add" data-technical-add="results">＋ Adicionar resultado</button><small class="certificate-technical-help">Até 50 linhas de resultados por instrumento.</small>`;
    const observationsForm = `${input('observations.text', 'Observações específicas deste instrumento', selected.text, { area: true, full: true, rows: 4 })}${checkbox('observations.includeConformity', 'Incluir critério de conformidade nas observações', selected.includeConformity)}<div class="certificate-technical-grid certificate-technical-inset" data-technical-conformity${selected.includeConformity ? '' : ' hidden'}>${select('observations.criterionType', 'Tipo de critério informado', selected.criterionType, [['fixed', 'Valor fixo'], ['percent_range', 'Percentual da faixa'], ['custom', 'Personalizado']])}${input('observations.admissibleDeviation', 'Desvio admissível', selected.admissibleDeviation)}${input('observations.criterionUnit', 'Unidade / símbolo do critério', selected.criterionUnit)}${select('observations.decision', 'Parecer informado pela equipe', selected.decision, [['not_declared', 'Não declarar'], ['approved', 'Aprovado'], ['rejected', 'Reprovado']])}${input('observations.criterionDescription', 'Descrição do critério e da base de avaliação', selected.criterionDescription, { area: true, full: true, help: 'Obrigatória para percentual ou critério personalizado. Descreva a faixa/base e como o erro e a incerteza são considerados, conforme orientação técnica do cliente.' })}<p class="certificate-technical-help certificate-technical-full">O parecer é opcional e informado pela equipe para este instrumento. Escolha Não declarar para incluir somente o critério. Os valores não geram aprovação automática.</p></div><div class="certificate-technical-grid">${input('observations.periodicityMonths', 'Periodicidade de calibração (meses)', selected.periodicityMonths, { type: 'number', min: '0', max: '1200', step: '1', help: 'Zero omite a periodicidade no certificado.' })}</div>${checkbox('observations.showValidity', 'Exibir validade e próxima calibração no certificado', selected.showValidity)}${checkbox('observations.includeSchedule', 'Repetir periodicidade e próxima calibração nas observações', selected.includeSchedule)}${input('supplement', 'Complemento específico do modelo / instrumento', technical.supplement, { area: true, full: true })}`;
    return `<div class="certificate-technical-editor" data-certificate-technical><div class="certificate-technical-intro"><div><strong>Conteúdo técnico por instrumento</strong><p>Campos opcionais podem ser preenchidos conforme o modelo e as solicitações de cada cliente.</p></div>${select('templateId', 'Modelo de certificado', technical.templateId, templates().map(item => [item.id, item.label]))}</div>${section(1, 'Solicitante e cliente final', partiesForm, true)}${section(2, 'Dados do instrumento calibrado', instrumentForm)}${section(3, 'Dados do ambiente', `<div class="certificate-technical-grid">${fields.environment.map(key => input(`environment.${key}`, environmentLabels[key], environment[key])).join('')}</div>`)}${section(4, 'Padrões utilizados', standardsForm)}${section(5, 'Procedimento', input('procedure', 'Procedimento aplicado', technical.procedure, { area: true, full: true, rows: 4 }))}${section(6, 'Resultados da calibração', resultsForm)}${section(7, 'Observações e solicitações específicas', observationsForm)}${issuerForm}<p class="certificate-technical-error" role="alert" tabindex="-1" data-technical-error hidden></p><button type="button" class="btn" data-technical-preview>Visualizar prévia técnica</button><div class="certificate-technical-preview" data-technical-preview-region hidden></div></div>`;
  }

  function assign(target, path, value) {
    const keys = path.split('.');
    let node = target;
    keys.slice(0, -1).forEach(key => { node[key] = node[key] || {}; node = node[key]; });
    node[keys[keys.length - 1]] = value;
  }

  function read(formElement) {
    const root = formElement.matches?.('[data-certificate-technical]') ? formElement : formElement.querySelector('[data-certificate-technical]');
    if (!root) return null;
    for(const picker of root.querySelectorAll('[data-optional-date]')) { if(!window.ancalOptionalDate.sync(picker).ok){picker.closest('details')?.setAttribute('open','');return null;} }
    const value = {};
    root.querySelectorAll('[data-technical-field]').forEach(control => assign(value, control.dataset.technicalField, control.type === 'checkbox' ? control.checked : control.value));
    value.standards = Array.from(root.querySelectorAll('[data-technical-row="standards"]')).map(row => Object.fromEntries(Array.from(row.querySelectorAll('[data-technical-cell]')).map(control => [control.dataset.technicalCell, control.value])));
    value.results = value.results || {};
    value.results.rows = Array.from(root.querySelectorAll('[data-technical-row="results"]')).map(row => Object.fromEntries(Array.from(row.querySelectorAll('[data-technical-cell]')).map(control => [control.dataset.technicalCell, control.value])));
    return normalize(value);
  }

  function definitionList(pairs) {
    return `<dl class="certificate-technical-definition">${pairs.map(([label, value]) => `<div><dt>${h(label)}</dt><dd>${value ? h(value) : '<span class="certificate-technical-blank">Não informado</span>'}</dd></div>`).join('')}</dl>`;
  }

  function readonlySection(number, title, content) {
    return `<section class="certificate-technical-readonly-section"><h3><span>${number}</span>${title}</h3>${content}</section>`;
  }

  function detail(certificate) {
    if(window.ancalCertificateDocument)return window.ancalCertificateDocument.render(certificate);
    const technical = normalize(certificate?.technical);
    if (!technical) return '<div class="certificate-technical-legacy-note">Este certificado preserva o histórico já liberado. Não há um detalhamento técnico cadastrado neste protótipo.</div>';
    const parties = technical.parties, instrument = technical.instrument, environment = technical.environment;
    const columns = template(technical.templateId).columns;
    const standards = technical.standards.length ? `<div class="certificate-technical-scroll"><table class="certificate-technical-table certificate-technical-readonly-table"><thead><tr><th>Código</th><th>Descrição</th><th>Certificado</th><th>Rastreabilidade</th><th>Validade</th></tr></thead><tbody>${technical.standards.map(standard => `<tr>${fields.standards.map(key => `<td>${h(key === 'validUntilISO' ? dateLabel(standard[key]) : standard[key]) || '—'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<p class="certificate-technical-blank">Padrões não informados.</p>';
    const results = technical.results.rows.length ? `<div class="certificate-technical-scroll"><table class="certificate-technical-table certificate-technical-readonly-table"><thead><tr>${columns.map(column => `<th>${h(column.label)}</th>`).join('')}</tr></thead><tbody>${technical.results.rows.map(row => `<tr>${columns.map(column => `<td>${h(row[column.key]) || '—'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<p class="certificate-technical-blank">Resultados não informados.</p>';
    const observationLines = observations(technical);
    return `<div class="certificate-technical-detail"><div class="certificate-technical-detail-heading"><strong>Conteúdo técnico do certificado</strong><span>${h(template(technical.templateId).label)}</span></div>${readonlySection(1, 'Dados do solicitante e cliente final', definitionList([['Solicitante', parties.requesterName], ['CPF/CNPJ do solicitante', parties.requesterCnpj], ['Endereço do solicitante', parties.requesterAddress], ['Cliente final', parties.customerName], ['CPF/CNPJ do cliente final', parties.customerCnpj], ['Endereço do cliente final', parties.customerAddress]]))}${readonlySection(2, 'Dados do instrumento calibrado', definitionList([['Instrumento', certificate.equipmentName], ['Identificação', certificate.tag], ['Número de série', certificate.serial], ['Fabricante', instrument.manufacturer], ['Modelo', instrument.model], ['Faixa de indicação', instrument.range], ['Resolução', instrument.resolution], ['Localização', instrument.location], ['Classe', instrument.className], ['Local da calibração', instrument.calibrationPlace], ['Capacidade mínima', instrument.capacityMin], ['Capacidade máxima', instrument.capacityMax], ['Divisão', instrument.division], ['Ordem de serviço', certificate.orderId], ['Data da calibração', dateLabel(certificate.calibrationDateISO)], ...(technical.observations.showValidity && technical.observations.nextCalibrationISO ? [['Próxima calibração', dateLabel(technical.observations.nextCalibrationISO)]] : [])]))}${readonlySection(3, 'Dados do ambiente', definitionList([['Temperatura ambiente', environment.temperature], ['Pressão barométrica', environment.pressure], ['Umidade relativa', environment.humidity], ['Temperatura do líquido', environment.liquidTemperature]]))}${readonlySection(4, 'Padrões utilizados', standards)}${readonlySection(5, 'Procedimento', `<p class="certificate-technical-prose">${h(technical.procedure) || '<span class="certificate-technical-blank">Procedimento não informado.</span>'}</p>`)}${readonlySection(6, 'Resultados da calibração', `${technical.results.unit ? `<p class="certificate-technical-unit">Unidade: ${h(technical.results.unit)}</p>` : ''}${results}`)}${readonlySection(7, 'Observações', `<div class="certificate-technical-prose">${observationLines.length ? observationLines.map(line => `<p>${h(line) || '<br>'}</p>`).join('') : '<p class="certificate-technical-blank">Observações não informadas.</p>'}${technical.supplement ? `<p><strong>Complemento:</strong></p><p>${h(technical.supplement)}</p>` : ''}</div>`)}</div>`;
  }

  function bind(formElement, certificate) { contexts.set(formElement, certificate || {}); }

  function editorError(root, message) {
    const element = root.querySelector('[data-technical-error]');
    element.textContent = message;
    element.hidden = false;
    element.focus();
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('change', event => {
      const control = event.target;
      const root = control.closest?.('[data-certificate-technical]');
      if (!root || (typeof portalMode !== 'undefined' && portalMode)) return;
      if (control.dataset.technicalField === 'parties.customerSameAsRequester') root.querySelector('[data-technical-customer]').hidden = control.checked;
      if (control.dataset.technicalField === 'observations.includeConformity') root.querySelector('[data-technical-conformity]').hidden = !control.checked;
      if (control.dataset.technicalField === 'templateId') {
        const columns = template(control.value).columns;
        root.querySelectorAll('[data-technical-column]').forEach(cell => {
          const definition = columns.find(column => column.key === cell.dataset.technicalColumn);
          cell.hidden = !definition;
          if (definition && cell.tagName === 'TH') cell.textContent = definition.label;
          else if (definition) cell.querySelector('input')?.setAttribute('aria-label', definition.label);
        });
        root.querySelectorAll('.certificate-technical-results tr').forEach(row => {
          const action = row.lastElementChild;
          orderedResultKeys(control.value).forEach(key => {
            const cell = row.querySelector(`[data-technical-column="${key}"]`);
            if (cell) row.insertBefore(cell, action);
          });
        });
      }
    });
    document.addEventListener('click', event => {
      const button = event.target.closest?.('[data-technical-add],[data-technical-remove],[data-technical-preview]');
      if (!button) return;
      const root = button.closest('[data-certificate-technical]');
      if (!root) return;
      event.preventDefault();
      if (typeof portalMode !== 'undefined' && portalMode) return;
      root.querySelector('[data-technical-error]').hidden = true;
      if (button.hasAttribute('data-technical-remove')) {
        const row = button.closest('[data-technical-row]');
        const fallback = row.parentElement.closest('.certificate-technical-section-body').querySelector('[data-technical-add]');
        row.remove(); fallback?.focus();
      } else if (button.hasAttribute('data-technical-add')) {
        const kind = button.dataset.technicalAdd;
        const body = root.querySelector(`[data-technical-rows="${kind}"]`);
        const limit = kind === 'standards' ? 20 : 50;
        if (body.children.length >= limit) return editorError(root, `Limite de ${limit} ${kind === 'standards' ? 'padrões' : 'linhas de resultados'} por certificado.`);
        body.insertAdjacentHTML('beforeend', kind === 'standards' ? standardRow(blankStandard()) : resultRow(blankRow(), root.querySelector('[data-technical-field="templateId"]').value));
        body.lastElementChild.querySelector('input')?.focus();
      } else {
        const formElement = root.closest('form');
        const certificate = contexts.get(formElement) || {};
        const region = root.querySelector('[data-technical-preview-region]');
        const previewTechnical=read(root);
        if(!previewTechnical)return editorError(root,'Revise os seletores da próxima calibração. Selecione mês e ano; o dia é opcional.');
        window.ancalSignatureImages?.dispose(region);
        region.innerHTML = detail({ ...certificate, code: formElement.querySelector('[name="code"]')?.value ?? certificate.code, calibrationDateISO: formElement.querySelector('[name="calibrationDateISO"]')?.value ?? certificate.calibrationDateISO, activityType: formElement.querySelector('[name="activityType"]')?.value ?? certificate.activityType, technical: previewTechnical });
        region.hidden = false;
        window.ancalSignatureImages?.hydrate(region);
        region.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  window.ancalCertificateTechnical = { normalize, validate, defaults, templates, template, form, read, detail, observations, bind };
}());
