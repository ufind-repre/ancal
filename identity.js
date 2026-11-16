(function () {
  'use strict';
  const digits = value => String(value == null ? '' : value).replace(/\D/g, '');
  function raw(value) { return value && typeof value === 'object' ? value.document || value.cnpj || '' : value; }
  const key = value => String(raw(value) == null ? '' : raw(value)).trim().toUpperCase().replace(/[.\/\-\s]/g, '');
  function validDocument(value, type) {
    const source = String(raw(value) == null ? '' : raw(value)).trim();
    if (!source || !/^[a-zA-Z\d.\/\-\s]+$/.test(source)) return false;
    const document = key(source), cpf = /^\d{11}$/.test(document), cnpj = /^[A-Z\d]{12}\d{2}$/.test(document);
    return type === 'pf' ? cpf : type === 'pj' ? cnpj : cpf || cnpj;
  }
  function format(value) {
    const source = raw(value), document = key(source);
    if (/^\d{11}$/.test(document)) return document.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    if (/^[A-Z\d]{12}\d{2}$/.test(document)) return document.replace(/^([A-Z\d]{2})([A-Z\d]{3})([A-Z\d]{3})([A-Z\d]{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    return String(source == null ? '' : source).trim();
  }
  function label(value) { return value?.personType === 'pf' || /^\d{11}$/.test(key(value)) ? 'CPF' : 'CNPJ'; }
  window.ancalIdentity = { digits, validDocument, format, label, key };
}());
