(function () {
  'use strict';

  const storageKey = 'ancal-certificates-v1';
  const copy = value => JSON.parse(JSON.stringify(value));
  const text = value => String(value == null ? '' : value).trim();
  const digits = value => window.ancalIdentity ? window.ancalIdentity.key(value) : text(value).replace(/\D/g, '');
  const validOwner = value => window.ancalIdentity ? window.ancalIdentity.validDocument(value) : [11,14].includes(digits(value).length);
  const tagKey = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const formatCnpj = value => window.ancalIdentity ? window.ancalIdentity.format(value) : digits(value).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  const equipmentId = (cnpj, tag) => validOwner(cnpj) && tagKey(tag) ? digits(cnpj) + '-' + tagKey(tag) : '';
  const states = ['awaiting_signature', 'signed', 'cancelled'];
  const signingRoles = ['admin', 'authorized_signer'];
  let actor = { id: 'isabela-jurado', name: 'Isabela Jurado', role: 'admin' };
  let state = { certificates: [], orders: [], audit: [] };

  function portal() { return typeof portalMode !== 'undefined' && portalMode === true; }
  function error(message) { return { ok: false, error: message }; }
  function now() { return new Date().toISOString(); }
  function has(object, key) { return Object.prototype.hasOwnProperty.call(object || {}, key); }
  function technicalBounds(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Informe os dados técnicos como um objeto válido.';
    if (Array.isArray(value.standards) && value.standards.length > 20) return 'Os dados técnicos permitem até 20 padrões de referência.';
    if (Array.isArray(value.results?.rows) && value.results.rows.length > 50) return 'Os dados técnicos permitem até 50 linhas de resultados.';
    const ancestors = new WeakSet();
    let nodes = 0;
    function inspect(entry, depth) {
      if (++nodes > 10000 || depth > 24) return 'A estrutura dos dados técnicos excede o limite permitido.';
      if (typeof entry === 'string' && entry.length > 5000) return 'Cada texto dos dados técnicos deve conter até 5.000 caracteres.';
      if (!entry || typeof entry !== 'object') return '';
      if (ancestors.has(entry)) return 'Os dados técnicos contêm uma referência circular inválida.';
      ancestors.add(entry);
      for (const child of Object.values(entry)) {
        const invalid = inspect(child, depth + 1);
        if (invalid) { ancestors.delete(entry); return invalid; }
      }
      ancestors.delete(entry); return '';
    }
    try { return inspect(value, 0); } catch (_) { return 'Não foi possível ler os dados técnicos informados.'; }
  }
  function validateTechnical(value, calibrationDateISO) {
    const bounds = technicalBounds(value);
    if (bounds) return bounds;
    const helper = window.ancalCertificateTechnical;
    if (typeof helper?.validate !== 'function') return 'O formulário técnico não está disponível. Recarregue o protótipo antes de salvar.';
    try {
      const invalid = helper.validate(copy(value), calibrationDateISO);
      return typeof invalid === 'string' ? invalid : 'Não foi possível validar os dados técnicos.';
    } catch (_) { return 'Não foi possível validar os dados técnicos informados.'; }
  }
  function normalizeTechnical(value, calibrationDateISO) {
    const bounds = technicalBounds(value);
    if (bounds) return error(bounds);
    const helper = window.ancalCertificateTechnical;
    if (typeof helper?.normalize !== 'function') return error('O formulário técnico não está disponível. Recarregue o protótipo antes de salvar.');
    try {
      const normalized = helper.normalize(copy(value));
      if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) return error('Informe os dados técnicos em um formato válido.');
      const invalid = validateTechnical(normalized, calibrationDateISO);
      return invalid ? { ok: false, error: invalid, normalized: copy(normalized) } : { ok: true, value: copy(normalized) };
    } catch (_) { return error('Não foi possível ler os dados técnicos informados.'); }
  }
  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    if (year < 1000 || month < 1 || month > 12 || day < 1) return false;
    return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
  }
  function validTimestamp(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) || !validDate(value.slice(0, 10))) return false;
    const hour = Number(value.slice(11, 13)), minute = Number(value.slice(14, 16)), second = Number(value.slice(17, 19));
    return hour < 24 && minute < 60 && second < 60 && !Number.isNaN(new Date(value).getTime());
  }
  function signature(value) {
    if (!value || typeof value !== 'object' || !text(value.actorId) || !text(value.name) || !signingRoles.includes(value.role) || !validTimestamp(value.signedAt) || value.simulated !== true) return null;
    return { actorId: text(value.actorId), name: text(value.name), role: value.role, signedAt: value.signedAt, simulated: true };
  }
  function sourceOrder(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || !text(value.id) || !validOwner(value.cnpj)) return null;
    try { return { ...copy(value), id: text(value.id), cnpj: formatCnpj(value.cnpj), client: text(value.client) }; } catch (_) { return null; }
  }
  function orderKey(order) { return digits(order.cnpj) + '|' + order.id; }
  function documentKey(document) { return digits(document.cnpj) + '|' + document.orderId + '|' + document.equipmentId; }
  function orderSources() {
    const map = new Map(state.orders.map(order => [orderKey(order), order]));
    const live = typeof records !== 'undefined' && Array.isArray(records) ? records : [];
    live.forEach(value => { const order = sourceOrder(value); if (order) map.set(orderKey(order), order); });
    return [...map.values()];
  }
  function rawItems(order) {
    return Array.isArray(order.equipments) && order.equipments.length ? order.equipments : [{ name: order.equipment, tag: order.tag, serial: order.serial, manufacturer: order.manufacturer, equipmentType: order.equipmentType }];
  }
  function rawItemFor(order, item) {
    return rawItems(order).find(raw => raw && typeof raw === 'object' && equipmentId(raw.cnpj || order.cnpj, raw.tag == null ? order.tag : raw.tag) === item.id) || {};
  }
  function extractEquipment(order) {
    if (!order || !validOwner(order.cnpj)) return [];
    const owner = digits(order.cnpj), seen = new Set();
    let normalized;
    try {
      normalized = window.ancalEquipment?.fromOrder(order) || rawItems(order).filter(item => item && typeof item === 'object').map(item => ({
        cnpj: item.cnpj || order.cnpj, client: item.client || order.client, name: item.name || item.equipment || order.equipment,
        tag: item.tag == null ? order.tag : item.tag, serial: item.serial == null ? order.serial : item.serial, manufacturer: item.manufacturer || ''
      }));
    } catch (_) { return []; }
    return normalized.filter(item => item && typeof item === 'object').map(item => {
      const id = equipmentId(item.cnpj || order.cnpj, item.tag);
      const snapshot = {
        id, cnpj: formatCnpj(item.cnpj || order.cnpj), client: text(order.client || item.client), name: text(item.name || item.equipment),
        tag: text(item.tag), serial: text(item.serial), manufacturer: text(item.manufacturer)
      };
      const raw = rawItemFor(order, snapshot);
      snapshot.equipmentType = text(raw.equipmentType || raw.type || snapshot.name);
      if (has(raw, 'model') || has(item, 'model')) snapshot.model = text(raw.model || item.model);
      if (has(raw, 'location') || has(item, 'location')) snapshot.location = text(raw.location || item.location);
      ['clientSector', 'className', 'certificateObservation'].forEach(key => { if (has(raw,key) || has(item,key)) snapshot[key] = key === 'certificateObservation' ? String((has(raw,key) ? raw[key] : item[key]) ?? '').replace(/\r\n?/g,'\n') : text(has(raw,key) ? raw[key] : item[key]); });
      ['measurementRanges', 'additionalFields'].forEach(key => { if (Array.isArray(raw[key]) || Array.isArray(item[key])) snapshot[key] = copy(Array.isArray(raw[key]) ? raw[key] : item[key]); });
      if (has(raw,'calibrationFrequencyMonths') || has(item,'calibrationFrequencyMonths')) snapshot.calibrationFrequencyMonths = has(raw,'calibrationFrequencyMonths') ? raw.calibrationFrequencyMonths : item.calibrationFrequencyMonths;
      if (has(raw, 'calibrationDateISO')) snapshot.calibrationDateISO = validDate(raw.calibrationDateISO) ? raw.calibrationDateISO : '';
      if (text(raw.certificateId)) snapshot.certificateId = text(raw.certificateId);
      return snapshot;
    }).filter(item => {
      if (!item.id || digits(item.cnpj) !== owner || !item.name || !item.tag || seen.has(item.id)) return false;
      seen.add(item.id); return true;
    });
  }
  function selectedCompany() {
    const account = window.ancalAccess?.getPreviewAccount();
    if (!account || account.status !== 'active') return null;
    const selected = document.querySelector('#clientCompanySelect')?.value;
    const allowed = window.ancalAccess.getAllowedCompanies(account.id);
    return allowed.find(company => company.id === selected) || null;
  }
  function mayReadCompany(cnpj) {
    if (!portal()) return validOwner(cnpj);
    const selected = selectedCompany();
    return Boolean(selected && digits(selected.cnpj) === digits(cnpj));
  }
  function published(document) {
    return document.status === 'signed' && Boolean(signature(document.signature)) && validDate(document.calibrationDateISO) && Boolean(text(document.code)) && Boolean(text(document.activityType));
  }
  function mayRead(document) { return !portal() || (published(document) && mayReadCompany(document.cnpj)); }
  function getAll() { return portal() ? [] : copy(state.certificates); }
  function forCompany(cnpj) {
    if (!mayReadCompany(cnpj)) return [];
    return copy(state.certificates.filter(document => digits(document.cnpj) === digits(cnpj) && published(document)));
  }
  function get(id) {
    const document = state.certificates.find(item => item.id === id);
    return document && mayRead(document) ? copy(document) : null;
  }
  function forOrder(orderId, cnpj) {
    if (portal() && cnpj && !mayReadCompany(cnpj)) return [];
    return copy(state.certificates.filter(item => item.orderId === orderId && (!cnpj || digits(item.cnpj) === digits(cnpj)) && mayRead(item)));
  }
  function getOrders() { return portal() ? [] : copy(orderSources()); }
  function getEquipmentForOrder(orderId, cnpj) {
    if (portal()) return [];
    const orders = orderSources().filter(order => order.id === orderId && (!cnpj || digits(order.cnpj) === digits(cnpj)));
    return copy(orders.flatMap(extractEquipment));
  }
  function getActor() { return copy(actor); }
  function canSign() { return !portal() && signingRoles.includes(actor.role); }
  function setActor(value) {
    if (portal()) return error('O perfil só pode ser alterado na área interna.');
    if (!value || !text(value.id) || !text(value.name) || !text(value.role)) return error('Informe um perfil de demonstração válido.');
    actor = { id: text(value.id), name: text(value.name), role: text(value.role) };
    return { ok: true, actor: getActor() };
  }
  function getAudit() { return portal() ? [] : copy(state.audit); }
  function audit(action, certificateId, detail = {}) {
    state.audit.unshift({ id: 'cert-event-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8), date: now(), actor: actor.name, actorId: actor.id, actorRole: actor.role, action, certificateId, ...copy(detail) });
  }
  function persist() {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch (_) { /* Keep prototype metadata available for this session. */ }
    document.dispatchEvent(new CustomEvent('ancal-certificates-changed'));
  }
  function uniqueCode(code, exceptId) { return !state.certificates.some(item => item.id !== exceptId && text(item.code).toLowerCase() === text(code).toLowerCase()); }
  function requiredFields(document, exceptId) {
    if (!text(document.code) || text(document.code).length > 120) return 'Informe um código de certificado com até 120 caracteres.';
    if (!uniqueCode(document.code, exceptId)) return 'Este código já pertence a outro certificado.';
    if (!validDate(document.calibrationDateISO)) return 'Informe uma data de calibração válida.';
    if (!text(document.activityType) || text(document.activityType).length > 120) return 'Informe o tipo de atividade com até 120 caracteres.';
    if (has(document, 'technical')) return validateTechnical(document.technical, document.calibrationDateISO);
    return '';
  }
  function stableDocumentId(order, item) { return 'cert-' + order.id + '-' + item.id; }
  function hasCertificateMetadata(value) {
    return Boolean(value && (text(value.certificateId) || text(value.certificateCode) || has(value, 'certificateStatus') || has(value, 'signature') || value.certificateReleased === true));
  }
  function calibrationDate(order, item, count) {
    const raw = rawItemFor(order, item);
    if (has(raw, 'calibrationDateISO')) return validDate(raw.calibrationDateISO) ? raw.calibrationDateISO : '';
    if (count === 1 && has(order, 'calibrationDateISO')) return validDate(order.calibrationDateISO) ? order.calibrationDateISO : '';
    return count === 1 && validDate(order.completedISO) ? order.completedISO : '';
  }
  function observationTechnical(document, order, equipment) {
    if (document.technical || document.status === 'signed' || document.status === 'cancelled') return null;
    const technical = window.ancalCertificateTechnical?.defaults(document, order, equipment);
    return technical?.observations?.text?.trim() ? technical : null;
  }
  function getSigningTechnical(id) {
    if (portal()) return null;
    const document = state.certificates.find(item => item.id === id);
    if (!document || document.status !== 'awaiting_signature') return null;
    if (document.technical) return copy(document.technical);
    const order = orderSources().find(item => item.id === document.orderId && digits(item.cnpj) === digits(document.cnpj));
    const equipment = order && extractEquipment(order).find(item => item.id === document.equipmentId);
    return order && equipment ? observationTechnical(document, order, equipment) : null;
  }
  function documentFrom(order, item, index, count) {
    const raw = rawItemFor(order, item);
    const base = text(order.certificateId || order.certificateCode) || 'CERT-' + order.id.replace(/^OS-/, '');
    const code = text(raw.certificateId || raw.certificateCode) || (count === 1 ? base : base + '-' + String(index + 1).padStart(2, '0'));
    const requestedStatus = has(raw, 'certificateStatus') ? raw.certificateStatus : order.certificateStatus;
    const incomingSignature = signature(has(raw, 'signature') ? raw.signature : count === 1 ? order.signature : null);
    const document = {
      id: stableDocumentId(order, item), code, orderId: order.id, cnpj: formatCnpj(order.cnpj), client: text(order.client || item.client),
      equipmentId: item.id, equipmentName: item.name, equipmentType: item.equipmentType || item.name, tag: item.tag, serial: item.serial,
      calibrationDateISO: calibrationDate(order, item, count), activityType: text(raw.activityType || order.activityType || order.service) || 'Calibração',
      status: requestedStatus === 'cancelled' ? 'cancelled' : 'awaiting_signature', signature: incomingSignature,
      cancelReason: text(raw.cancelReason || order.cancelReason), createdAt: validTimestamp(raw.certificateCreatedAt || order.certificateCreatedAt) ? raw.certificateCreatedAt || order.certificateCreatedAt : now()
    };
    const technicalSource = has(raw, 'technical') ? raw : count === 1 && has(order, 'technical') ? order : null;
    if (has(raw,'certificateVersion') || has(order,'certificateVersion')) document.version = text(has(raw,'certificateVersion') ? raw.certificateVersion : order.certificateVersion);
    if (has(raw,'certificateLaboratory') || has(order,'certificateLaboratory')) document.laboratory = text(has(raw,'certificateLaboratory') ? raw.certificateLaboratory : order.certificateLaboratory);
    if (technicalSource) {
      const prepared = normalizeTechnical(technicalSource.technical, document.calibrationDateISO);
      if (!prepared.ok) {
        const failure = new Error(prepared.error);
        failure.certificateTechnical = true;
        throw failure;
      }
      document.technical = prepared.value;
    }
    if (!document.technical && !['signed','cancelled'].includes(requestedStatus)) {
      const inherited = observationTechnical(document,order,item);
      if (inherited) document.technical = inherited;
    }
    if (requestedStatus === 'signed' && incomingSignature && !requiredFields(document)) document.status = 'signed';
    if (document.status === 'awaiting_signature') document.signature = null;
    return document;
  }
  function registerOrders(values) {
    if (portal()) return error('Registros de certificados são gerenciados na área interna.');
    if (!Array.isArray(values)) return error('Informe uma lista de ordens de serviço.');
    let added = 0, changed = false;
    const previousState = state;
    state = { certificates: [...state.certificates], orders: [...state.orders], audit: [...state.audit] };
    try {
      values.forEach(value => {
        const order = sourceOrder(value);
        if (!order) return;
        const index = state.orders.findIndex(item => orderKey(item) === orderKey(order));
        if (index < 0) { state.orders.push(order); changed = true; }
        else if (JSON.stringify(state.orders[index]) !== JSON.stringify(order)) { state.orders[index] = order; changed = true; }
        const items = extractEquipment(order);
        items.forEach((item, itemIndex) => {
          const raw = rawItemFor(order, item);
          if (!['review', 'done'].includes(order.type) && !hasCertificateMetadata(order) && !hasCertificateMetadata(raw)) return;
          const key = digits(order.cnpj) + '|' + order.id + '|' + item.id;
          if (state.certificates.some(existing => documentKey(existing) === key)) return;
          const document = documentFrom(order, item, itemIndex, items.length);
          state.certificates.push(document); added++; changed = true;
          audit('Documento registrado', document.id, { orderId: order.id, code: document.code, status: document.status });
        });
      });
    } catch (failure) {
      state = previousState;
      return error(failure.certificateTechnical ? failure.message : 'Não foi possível registrar os certificados informados.');
    }
    if (changed) persist();
    return { ok: true, added, orders: values.length };
  }
  function create(values) {
    if (portal()) return error('A criação de certificados está disponível na área interna.');
    if (!values || typeof values !== 'object') return error('Informe os dados do certificado.');
    const candidates = orderSources().filter(order => order.id === values.orderId && (!values.cnpj || digits(order.cnpj) === digits(values.cnpj)));
    let order, equipment;
    candidates.some(candidate => {
      const item = extractEquipment(candidate).find(entry => entry.id === values.equipmentId);
      if (!item) return false;
      order = candidate; equipment = item; return true;
    });
    if (!order || !equipment) return error('Selecione uma OS real e um equipamento vinculado à mesma empresa.');
    const key = digits(order.cnpj) + '|' + order.id + '|' + equipment.id;
    if (state.certificates.some(item => documentKey(item) === key)) return error('Esta OS já possui um certificado para o equipamento selecionado.');
    const document = {
      id: stableDocumentId(order, equipment), code: text(values.code), orderId: order.id, cnpj: formatCnpj(order.cnpj), client: text(order.client || equipment.client),
      equipmentId: equipment.id, equipmentName: equipment.name, equipmentType: equipment.equipmentType || equipment.name, tag: equipment.tag, serial: equipment.serial,
      calibrationDateISO: text(values.calibrationDateISO), activityType: text(values.activityType), status: 'awaiting_signature', signature: null, cancelReason: '', createdAt: now()
    };
    if (has(values, 'technical')) {
      const prepared = normalizeTechnical(values.technical, document.calibrationDateISO);
      if (!prepared.ok) return error(prepared.error);
      document.technical = prepared.value;
    }
    if (!document.technical) {
      const inherited = observationTechnical(document,order,equipment);
      if (inherited) document.technical = inherited;
    }
    const invalid = requiredFields(document);
    if (invalid) return error(invalid);
    if (!state.orders.some(item => orderKey(item) === orderKey(order))) state.orders.push(copy(order));
    state.certificates.push(document);
    audit('Certificado criado', document.id, { orderId: order.id, code: document.code }); persist();
    return { ok: true, certificate: copy(document) };
  }
  function update(id, patch) {
    if (portal()) return error('A edição de certificados está disponível na área interna.');
    const document = state.certificates.find(item => item.id === id);
    if (!document) return error('Certificado não encontrado.');
    if (document.status !== 'awaiting_signature') return error('Somente certificados aguardando assinatura podem ser editados.');
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return error('Informe os campos que deseja atualizar.');
    const allowed = ['code', 'calibrationDateISO', 'activityType', 'equipmentType', 'technical'];
    if (Object.keys(patch).some(key => !allowed.includes(key))) return error('A OS, a empresa, o instrumento e a situação do certificado não podem ser alterados nesta edição.');
    const next = { ...document };
    Object.keys(patch).filter(key => key !== 'technical').forEach(key => { next[key] = text(patch[key]); });
    if (has(patch, 'technical')) {
      const prepared = normalizeTechnical(patch.technical, next.calibrationDateISO);
      if (!prepared.ok) return error(prepared.error);
      next.technical = prepared.value;
    }
    const invalid = requiredFields(next, id);
    if (invalid) return error(invalid);
    Object.assign(document, next);
    audit('Certificado atualizado', id, { code: document.code }); persist();
    return { ok: true, certificate: copy(document) };
  }
  function sign(id) {
    if (!canSign()) return error('A assinatura é permitida a administradores e signatários autorizados.');
    const document = state.certificates.find(item => item.id === id);
    if (!document) return error('Certificado não encontrado.');
    if (document.status !== 'awaiting_signature') return error(document.status === 'cancelled' ? 'Um certificado cancelado não pode ser assinado.' : 'Este certificado já foi assinado.');
    const invalid = requiredFields(document, id);
    if (invalid) return error(invalid);
    if (!document.technical) {
      const inherited = getSigningTechnical(id);
      if (inherited) {
        const prepared = normalizeTechnical(inherited, document.calibrationDateISO);
        if (!prepared.ok) return error(prepared.error);
        document.technical = prepared.value;
      }
    }
    document.status = 'signed';
    document.signature = { actorId: actor.id, name: actor.name, role: actor.role, signedAt: now(), simulated: true };
    audit('Assinatura simulada registrada', id, { code: document.code }); persist();
    return { ok: true, certificate: copy(document) };
  }
  function cancel(id, reason) {
    if (!canSign()) return error('O cancelamento é permitido a administradores e signatários autorizados.');
    const document = state.certificates.find(item => item.id === id);
    if (!document) return error('Certificado não encontrado.');
    if (document.status === 'cancelled') return error('Este certificado já foi cancelado.');
    const value = text(reason);
    if (!value || value.length > 500) return error('Informe o motivo do cancelamento com até 500 caracteres.');
    const previousStatus = document.status;
    document.status = 'cancelled'; document.cancelReason = value;
    audit('Certificado cancelado', id, { code: document.code, reason: value, previousStatus }); persist();
    return { ok: true, certificate: copy(document) };
  }
  function normalizeSaved(value) {
    if (!value || typeof value !== 'object' || !text(value.id) || !text(value.orderId)) return null;
    const storedSignature = signature(value.signature);
    const document = {
      id: text(value.id), code: text(value.code), orderId: text(value.orderId), cnpj: formatCnpj(value.cnpj), client: text(value.client),
      equipmentId: text(value.equipmentId), equipmentName: text(value.equipmentName), equipmentType: text(value.equipmentType), tag: text(value.tag), serial: text(value.serial),
      calibrationDateISO: validDate(value.calibrationDateISO) ? value.calibrationDateISO : '', activityType: text(value.activityType),
      status: states.includes(value.status) ? value.status : 'awaiting_signature', signature: storedSignature,
      cancelReason: text(value.cancelReason), createdAt: validTimestamp(value.createdAt) ? value.createdAt : now()
    };
    ['version','laboratory'].forEach(key=>{if(has(value,key)) document[key]=text(value[key]);});
    if (has(value, 'technical')) {
      if (value.status === 'signed' || value.status === 'cancelled') document.technical = copy(value.technical);
      else {
        const prepared = normalizeTechnical(value.technical, document.calibrationDateISO);
        document.technical = prepared.ok ? prepared.value : has(prepared, 'normalized') ? prepared.normalized : copy(value.technical);
      }
    }
    if (document.status === 'signed' && (!storedSignature || !validDate(document.calibrationDateISO) || !document.code || !document.activityType || !validOwner(document.cnpj) || !document.equipmentId)) document.status = 'awaiting_signature';
    if (document.status === 'awaiting_signature') document.signature = null;
    return document;
  }
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (!saved || typeof saved !== 'object') return;
      const orders = new Map();
      (Array.isArray(saved.orders) ? saved.orders : []).forEach(value => { const order = sourceOrder(value); if (order) orders.set(orderKey(order), order); });
      state.orders = [...orders.values()];
      const documents = new Map();
      (Array.isArray(saved.certificates) ? saved.certificates : []).forEach(value => {
        const document = normalizeSaved(value);
        if (!document) return;
        const key = document.equipmentId && validOwner(document.cnpj) ? documentKey(document) : 'id:' + document.id;
        const previous = documents.get(key);
        const rank = item => ({ awaiting_signature: 0, signed: 1, cancelled: 2 }[item.status]);
        if (!previous || rank(document) > rank(previous)) documents.set(key, document);
      });
      state.certificates = [...documents.values()];
      state.audit = (Array.isArray(saved.audit) ? saved.audit : []).filter(event => event && typeof event === 'object').map(event => copy(event));
      const codes = new Set();
      state.certificates.forEach(document => {
        const code = document.code.toLowerCase();
        if (document.status === 'signed' && codes.has(code)) { document.status = 'awaiting_signature'; document.signature = null; }
        if (code) codes.add(code);
      });
    } catch (_) { /* Keep existing OS data untouched if this prototype store cannot be read. */ }
  }

  load();
  window.ancalCertificates = { getAll, forCompany, get, forOrder, registerOrders, create, update, sign, cancel, getActor, canSign, setActor, getAudit, getOrders, getEquipmentForOrder, getSigningTechnical };
  registerOrders(typeof records !== 'undefined' && Array.isArray(records) ? records : []);
})();
