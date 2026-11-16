(function () {
  'use strict';

  const shown = new Set();
  const pending = new Set();
  function notify(cnpj) {
    const external = !!cnpj;
    if (!window.ancalExpiry || external !== portalMode) return;
    const accountId = external ? window.ancalAccess.getPreviewAccount()?.id : 'admin';
    const entries = external ? window.ancalExpiry.forCompany(cnpj) : window.ancalExpiry.all();
    if (!entries.length) return;
    const fingerprint = entries.map(item => item.id + ':' + item.nextCalibrationISO).sort().join('|');
    const key = [accountId, cnpj || 'all', window.ancalExpiry.todayISO(), fingerprint].join('/');
    if (shown.has(key) || pending.has(key)) return;
    pending.add(key);
    window.setTimeout(() => {
      pending.delete(key);
      if (document.getElementById('modalBackdrop').classList.contains('open') || document.getElementById('sidebar').classList.contains('open')) return;
      if (external) {
        if (!portalMode || window.ancalAccess.getPreviewAccount()?.id !== accountId) return;
        const selected = document.getElementById('clientCompanySelect').value;
        if (!window.ancalAccess.getAllowedCompanies(accountId).some(company => company.id === selected && company.cnpj === cnpj)) return;
        if (!window.ancalExpiry.forCompany(cnpj).length) return;
        window.ancalExpiry.openCompany(cnpj);
      } else {
        if (portalMode || currentPage !== 'calibracoes' || !window.ancalExpiry.all().length) return;
        window.ancalExpiry.openAll();
      }
      shown.add(key);
    }, 0);
  }
  function afterView() { if (!portalMode && currentPage === 'calibracoes') notify(); }
  function afterClient(cnpj) { if (portalMode && cnpj) notify(cnpj); }
  window.ancalExpiryUI = { afterView, afterClient };
  afterView();
})();
