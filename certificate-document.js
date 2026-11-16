(function () {
  'use strict';

  const text = value => value == null ? '' : String(value);
  const h = value => typeof escapeHtml === 'function' ? escapeHtml(value) : text(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const nonempty = value => text(value).trim() !== '';
  const display = value => nonempty(value) ? text(value) : '—';
  const dateLabel = value => /^\d{4}-\d{2}-\d{2}$/.test(text(value)) || /^\d{4}-\d{2}$/.test(text(value)) ? text(value).split('-').reverse().join('/') : text(value);

  function labeledRows(values, className = '') {
    const rows = Array.isArray(values) ? values : [];
    return `<dl class="certificate-document-fields ${className}">${rows.map(pair => `<div class="certificate-document-field"><dt>${h(text(pair[0]).replace(/:\s*$/, ''))}:</dt><dd>${h(display(pair[1]))}</dd></div>`).join('')}</dl>`;
  }

  function section(number, title, body, className = '') {
    return `<section class="certificate-document-section ${className}" data-certificate-document-section="${number}"><h3>${number}. ${h(title)}</h3>${body}</section>`;
  }

  function standardsTable(values) {
    const standards = Array.isArray(values) ? values : [];
    return `<table class="certificate-document-standards" data-certificate-document-standards><colgroup><col class="certificate-document-standard-code"><col class="certificate-document-standard-description"><col class="certificate-document-standard-certificate"><col class="certificate-document-standard-traceability"><col class="certificate-document-standard-validity"></colgroup><thead><tr><th scope="col">Código</th><th scope="col">Descrição</th><th scope="col">Certificado</th><th scope="col">Rastreabilidade</th><th scope="col">Validade</th></tr></thead><tbody>${standards.length ? standards.map(standard => `<tr><td>${h(display(standard.code))}</td><td>${h(display(standard.description))}</td><td>${h(display(standard.certificate))}</td><td>${h(display(standard.traceability))}</td><td>${h(display(dateLabel(standard.validUntilISO)))}</td></tr>`).join('') : '<tr><td colspan="5" class="certificate-document-empty">—</td></tr>'}</tbody></table>`;
  }

  function resultHeader(column, attrs = '') {
    return `<th scope="col"${attrs}><span>${h(display(column.label))}</span>${nonempty(column.unit) ? `<span class="certificate-document-column-unit">${h(column.unit)}</span>` : ''}</th>`;
  }

  function resultsTable(results = {}) {
    const columns = Array.isArray(results.columns) ? results.columns : [];
    const rows = Array.isArray(results.rows) ? results.rows : [];
    if (!columns.length) return '<p class="certificate-document-empty">—</p>';
    const grouped = results.groupMass === true && columns.length >= 2;
    const head = grouped ? `<tr><th scope="colgroup" colspan="2">Valor de Massa Convencional</th>${columns.slice(2).map(column => resultHeader(column, ' rowspan="2"')).join('')}</tr><tr>${columns.slice(0, 2).map(column => resultHeader(column)).join('')}</tr>` : `<tr>${columns.map(column => resultHeader(column)).join('')}</tr>`;
    const overallUnit = nonempty(results.unit) && !columns.some(column => nonempty(column.unit));
    return `<div class="certificate-document-results-heading">${nonempty(results.title) ? `<strong>${h(results.title)}</strong>` : ''}${overallUnit ? `<span>Unidade: ${h(results.unit)}</span>` : ''}</div><table class="certificate-document-results${grouped ? ' certificate-document-results-mass' : ''}${columns.length > 5 ? ' certificate-document-results-many' : ''}" data-certificate-document-results><thead>${head}</thead><tbody>${rows.length ? rows.map(row => `<tr>${columns.map(column => `<td>${h(display(row?.[column.key]))}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${columns.length}" class="certificate-document-empty">—</td></tr>`}</tbody></table>`;
  }

  function signatureBlock(signature = {}) {
    const statuses = { signed: 'Assinatura simulada registrada', awaiting_signature: 'Aguardando assinatura — rascunho', cancelled: 'Certificado cancelado' };
    const status = statuses[signature.status] || text(signature.status);
    return `<div class="certificate-document-authentication" data-certificate-document-signature><div class="certificate-document-signature-space" aria-hidden="true"></div><div class="certificate-document-signature-line"></div>${nonempty(signature.name) ? `<strong>${h(signature.name)}</strong>` : ''}${nonempty(signature.role) ? `<span>${h(signature.role)}</span>` : ''}${nonempty(signature.date) ? `<span>${h(signature.date)}</span>` : ''}${nonempty(status) ? `<span class="certificate-document-signature-status">${h(status)}</span>` : ''}<small>Assinatura simulada. Documento de demonstração sem validade técnica.</small></div>`;
  }

  function documentFooter(footer = {}) {
    const lines = Array.isArray(footer.lines) ? footer.lines.filter(nonempty) : [];
    return `<footer class="certificate-document-footer" data-certificate-document-footer>${nonempty(footer.control) ? `<div class="certificate-document-control">${h(footer.control)}</div>` : ''}<div class="certificate-document-issuer">${lines.map(line => `<div>${h(line)}</div>`).join('')}</div></footer>`;
  }

  function render(source) {
    const model = window.ancalCertificatePresentation?.model(source);
    if (!model) return '';
    const technical = model.technical || {};
    const environment = Array.isArray(model.environment) ? model.environment : [];
    const environmentColumns = environment.length === 4 ? 2 : Math.max(1, Math.min(3, environment.length));
    const title = text(model.title).replace(/\s+N[º°o]\s*:?\s*$/i, '');
    const notes = Array.isArray(model.notes) ? model.notes : [];
    const status = text(model.signature?.status);
    const notice = model.legacy ? '<p class="certificate-document-history-note">Prévia deste registro histórico: campos técnicos sem informação permanecem indicados por um traço.</p>' : '';
    const body = section(1, 'Dados do Solicitante', labeledRows(model.parties, 'certificate-document-parties')) +
      section(2, 'Dados do Instrumento Calibrado', `<div class="certificate-document-instrument">${labeledRows(model.instrumentLeft)}${labeledRows(model.instrumentRight)}</div>`) +
      section(3, 'Dados do Ambiente', `<div class="certificate-document-environment" style="--certificate-environment-columns:${environmentColumns}">${environment.map(pair => labeledRows([pair])).join('')}</div>`) +
      section(4, 'Padrões Utilizados', standardsTable(model.standards)) +
      section(5, 'Procedimento', `<div class="certificate-document-procedure">${h(display(model.procedure))}</div>`) +
      section(6, 'Resultados da Calibração', resultsTable(model.results)) +
      section(7, 'Observações', `<div class="certificate-document-observations">${notes.length ? notes.map(note => `<p>${nonempty(note) ? h(note) : '<br>'}</p>`).join('') : '<p>—</p>'}</div>`);
    return `<div class="certificate-document-preview" data-certificate-document-preview>${notice}<div class="certificate-document-scroll" tabindex="0" role="region" aria-label="Prévia A4 do certificado, com rolagem horizontal"><article class="certificate-document-paper" data-certificate-document data-certificate-template="${h(technical.templateId || 'general')}" aria-label="${h(title)} ${h(model.code)}"><header class="certificate-document-header"><div class="certificate-document-brand" aria-label="Ancal Calibrações"><img src="assets/ancal-simbolo-branco.png" alt="Símbolo da Ancal" width="112" height="76"><div class="certificate-document-wordmark"><span>Ancal</span><small>Calibrações</small></div></div><div class="certificate-document-demo"><strong>DEMONSTRAÇÃO</strong><span>Sem validade técnica</span>${/RASCUNHO|AGUARDANDO|CANCELADO/i.test(status) ? `<span>${h(status)}</span>` : ''}</div><h2>${h(title)} Nº: ${h(display(model.code))}</h2></header><div class="certificate-document-body">${body}</div>${signatureBlock(model.signature)}${documentFooter(model.footer)}</article></div></div>`;
  }

  window.ancalCertificateDocument = { render };
}());
