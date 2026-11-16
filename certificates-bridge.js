(function () {
  'use strict';
  // Legacy service/calibration buttons resolve documents through the same guarded store.
  function download(id, cnpj) {
    const store = window.ancalCertificates;
    const ui = window.ancalCertificatesUI;
    if (!store || !ui) return false;
    const document = store.get(id);
    if (document && document.status !== 'cancelled' && (!cnpj || document.cnpj === cnpj)) {
      return ui.download(document.id);
    }
    const documents = store.forOrder(id, cnpj).filter(item => item.status !== 'cancelled');
    if (!documents.length) {
      showToast(portalMode ? 'Nenhum certificado assinado disponível para esta ordem.' : 'Esta ordem ainda não possui certificado disponível.');
      return false;
    }
    if (documents.length === 1) return ui.download(documents[0].id);
    openModal('Certificados da ordem', id, `<ul class="certificate-order-picker">${documents.map(item => `<li><div><strong>${escapeHtml(item.code)}</strong><span>${escapeHtml(item.equipmentName)} · ${escapeHtml(item.tag)}</span><small>${escapeHtml(item.status === 'signed' ? 'Assinado' : 'Aguardando assinatura')}</small></div><button type="button" class="btn" data-certificate-bridge-id="${escapeHtml(item.id)}">⇩ ${item.status === 'signed' ? 'Baixar PDF' : 'Prévia'}</button></li>`).join('')}</ul>`);
    return true;
  }
  document.addEventListener('click', event => {
    const control = event.target.closest('[data-certificate-bridge-id]');
    if (control) window.ancalCertificatesUI?.download(control.dataset.certificateBridgeId);
  });
  window.ancalCertificateBridge = { download };
})();
