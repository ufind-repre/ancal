(function () {
  'use strict';

  const databaseName = 'ancal-certificate-signature-images-v1';
  const maximumBytes = 2 * 1024 * 1024;
  const maximumSide = 4096;
  const maximumPixels = 16 * 1024 * 1024;
  const roles = ['admin', 'authorized_signer'];
  const activeImages = new Map();
  const pendingSlots = new Set();
  const generations = new WeakMap();
  const writes = new Set();
  const h = value => String(value == null ? '' : value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const fail = error => ({ ok: false, error });
  const portal = () => typeof portalMode !== 'undefined' && portalMode === true;
  let databasePromise;

  function canonical(id) {
    const certificate = window.ancalCertificates?.get(id);
    return certificate && certificate.id === id && certificate.status !== 'cancelled' && (!portal() || certificate.status === 'signed') ? certificate : null;
  }
  function actor() { return window.ancalCertificates?.getActor?.() || null; }
  function actorKey(value) { return JSON.stringify([value?.id || value?.actorId || '', value?.name || '', value?.role || '']); }
  function uploadAllowed(id, expectedActor) {
    const current = actor();
    return !portal() && roles.includes(current?.role) && window.ancalCertificates?.canSign?.() === true && (!expectedActor || actorKey(current) === expectedActor) && Boolean(canonical(id));
  }
  function contextKey() {
    return JSON.stringify([portal(), document.querySelector('#clientCompanySelect')?.value || '', actorKey(actor())]);
  }
  function guarded(guard) { try { return guard(); } catch (_) { return false; } }
  const staleMessage = 'O certificado, o perfil ou a janela de consulta mudou. Abra o certificado e tente novamente.';

  function database() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new Error('O navegador não oferece armazenamento de imagens. A imagem não foi salva.'));
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('images')) request.result.createObjectStore('images', { keyPath: 'certificateId' }); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Não foi possível abrir o armazenamento de imagens. A imagem não foi salva.'));
      request.onblocked = () => reject(new Error('O armazenamento está bloqueado por outra janela. Feche a outra consulta e tente novamente.'));
    }).catch(error => { databasePromise = null; throw error; });
    return databasePromise;
  }

  function validDimensions(width, height) {
    return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 && width <= maximumSide && height <= maximumSide && width * height <= maximumPixels;
  }
  function header(bytes) {
    if (bytes.length >= 24 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) {
      if (String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') return null;
      const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return { type: 'image/png', width: data.getUint32(16), height: data.getUint32(20) };
    }
    if (bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) return null;
    const frames = [192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207];
    let position = 2;
    while (position < bytes.length) {
      if (bytes[position] !== 255) return null;
      while (position < bytes.length && bytes[position] === 255) position++;
      const marker = bytes[position++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      if (position + 2 > bytes.length) return null;
      const length = bytes[position] * 256 + bytes[position + 1];
      if (length < 2 || position + length > bytes.length) return null;
      if (frames.includes(marker)) {
        if (length < 8) return null;
        return { type: 'image/jpeg', width: bytes[position + 5] * 256 + bytes[position + 6], height: bytes[position + 3] * 256 + bytes[position + 4] };
      }
      position += length;
    }
    return null;
  }

  async function decode(file) {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file);
      try { return { width: bitmap.width, height: bitmap.height }; }
      finally { bitmap.close?.(); }
    }
    if (typeof Image !== 'function' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') throw new Error('Este navegador não consegue validar a imagem. Tente outro navegador atualizado.');
    const url = URL.createObjectURL(file);
    try {
      return await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => reject(new Error('A imagem está corrompida ou não pôde ser decodificada.'));
        image.src = url;
      });
    } finally { URL.revokeObjectURL(url); }
  }

  function transactionRead(db, id) {
    return new Promise((resolve, reject) => {
      let result = null;
      const transaction = db.transaction('images', 'readonly'), request = transaction.objectStore('images').get(id);
      request.onsuccess = () => { result = request.result || null; };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = transaction.onabort = () => reject(new Error('Não foi possível recuperar a imagem armazenada.'));
    });
  }
  function restorePrevious(db, id, revision, previous) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('images', 'readwrite'), store = transaction.objectStore('images'), request = store.get(id);
      request.onsuccess = () => { if (request.result?.revision === revision) previous ? store.put(previous) : store.delete(id); };
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () => reject(new Error('Não foi possível desfazer o envio interrompido. Tente novamente na área interna.'));
    });
  }
  function persistImage(db, record, guard) {
    return new Promise((resolve, reject) => {
      if (!guarded(guard)) return resolve(fail(staleMessage));
      let previous = null, abortedForContext = false;
      const transaction = db.transaction('images', 'readwrite'), store = transaction.objectStore('images');
      const pending = { transaction, guard, abort() { abortedForContext = true; try { transaction.abort(); } catch (_) {} } };
      writes.add(pending);
      const request = store.get(record.certificateId);
      request.onsuccess = () => {
        previous = request.result || null;
        if (!guarded(guard)) return pending.abort();
        const write = store.put(record);
        write.onsuccess = () => { if (!guarded(guard)) pending.abort(); };
      };
      transaction.onabort = () => { writes.delete(pending); resolve(fail(abortedForContext ? staleMessage : 'O armazenamento não concluiu o envio. A imagem anterior foi preservada.')); };
      transaction.onerror = () => { writes.delete(pending); reject(new Error('Não foi possível salvar a imagem. Verifique o espaço disponível no navegador.')); };
      transaction.oncomplete = async () => {
        writes.delete(pending);
        if (!guarded(guard)) {
          try { await restorePrevious(db, record.certificateId, record.revision, previous); resolve(fail(staleMessage)); }
          catch (error) { reject(error); }
          return;
        }
        resolve({ ok: true });
      };
    });
  }

  async function upload(certificateId, file, options = {}) {
    if (!uploadAllowed(certificateId)) return fail('Somente administradores e signatários autorizados podem enviar imagens na área interna.');
    const currentActor = actor(), expectedActor = actorKey(currentActor);
    const guard = () => uploadAllowed(certificateId, expectedActor) && (typeof options.isCurrent !== 'function' || options.isCurrent());
    if (!guarded(guard)) return fail(staleMessage);
    if (!file || typeof file.arrayBuffer !== 'function' || !Number.isInteger(file.size) || file.size <= 0 || file.size > maximumBytes) return fail('Selecione uma imagem PNG ou JPEG de até 2 MB.');
    if (file.type && !['image/png', 'image/jpeg', 'image/jpg'].includes(file.type.toLowerCase())) return fail('Use uma imagem PNG ou JPEG. SVG e outros formatos não são aceitos.');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!guarded(guard)) return fail(staleMessage);
      const metadata = header(bytes);
      if (!metadata) return fail('O conteúdo do arquivo não é um PNG ou JPEG válido.');
      if (file.type && (file.type.toLowerCase() === 'image/png' ? metadata.type !== 'image/png' : metadata.type !== 'image/jpeg')) return fail('O tipo informado pelo arquivo não corresponde ao conteúdo da imagem.');
      if (!validDimensions(metadata.width, metadata.height)) return fail('A imagem deve ter até 4.096 pixels por lado e no máximo 16 megapixels.');
      let dimensions;
      try { dimensions = await decode(file); }
      catch (_) { return fail('Não foi possível decodificar a imagem. Envie um PNG ou JPEG íntegro.'); }
      if (!guarded(guard)) return fail(staleMessage);
      if (!validDimensions(dimensions.width, dimensions.height)) return fail('As dimensões da imagem ultrapassam o limite de 4.096 pixels por lado.');
      const db = await database();
      if (!guarded(guard)) return fail(staleMessage);
      const record = {
        certificateId, filename: String(file.name || (metadata.type === 'image/png' ? 'assinatura.png' : 'assinatura.jpg')).slice(0, 240),
        blob: file, width: dimensions.width, height: dimensions.height, contentType: metadata.type,
        createdAt: new Date().toISOString(), actor: { id: currentActor.id || currentActor.actorId || '', name: currentActor.name || '', role: currentActor.role },
        revision: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
      };
      const result = await persistImage(db, record, guard);
      if (result.ok) document.dispatchEvent(new CustomEvent('ancal-signature-images-changed', { detail: { certificateId } }));
      return result;
    } catch (error) { return fail(error.message || 'A imagem não foi salva. Verifique o armazenamento do navegador.'); }
  }

  async function checkedRead(certificateId) {
    if (!canonical(certificateId)) return { ok: true, record: null };
    try {
      const db = await database();
      if (!canonical(certificateId)) return { ok: true, record: null };
      const record = await transactionRead(db, certificateId);
      if (!canonical(certificateId) || !record || record.certificateId !== certificateId || typeof record.blob?.arrayBuffer !== 'function' || record.blob.size <= 0 || record.blob.size > maximumBytes || !['image/png', 'image/jpeg'].includes(record.contentType) || !validDimensions(record.width, record.height)) return { ok: true, record: null };
      return { ok: true, record: { ...record, actor: { ...record.actor } } };
    } catch (error) { return { ok: false, record: null, error: error.message || 'Não foi possível consultar a imagem neste navegador.' }; }
  }
  async function get(certificateId) { return (await checkedRead(certificateId)).record; }

  function matchesRoot(root, element) { return root === document || root === element || root.contains?.(element); }
  function slots(root) {
    const found = Array.from(root.querySelectorAll?.('[data-certificate-signature-slot][data-certificate-id]') || []);
    if (root.matches?.('[data-certificate-signature-slot][data-certificate-id]')) found.unshift(root);
    return found;
  }
  function revokeSlot(slot) {
    generations.set(slot, (generations.get(slot) || 0) + 1);
    pendingSlots.delete(slot);
    const previous = activeImages.get(slot);
    if (previous) URL.revokeObjectURL(previous.url);
    activeImages.delete(slot);
    slot.querySelectorAll?.('[data-certificate-signature-image]').forEach(image => image.remove());
    if (previous?.previousAriaHidden != null) slot.setAttribute('aria-hidden', previous.previousAriaHidden);
    slot.removeAttribute?.('aria-busy');
  }
  function slotAllowed(slot) {
    const backdrop = slot.closest?.('#modalBackdrop');
    return slot.isConnected !== false && (!backdrop || backdrop.classList.contains('open')) && Boolean(canonical(slot.dataset.certificateId));
  }
  function cleanup() {
    [...activeImages.keys(), ...pendingSlots].forEach(slot => { if (!slotAllowed(slot)) revokeSlot(slot); });
    writes.forEach(pending => { if (!guarded(pending.guard)) pending.abort(); });
  }
  function dispose(root = document) {
    new Set([...slots(root), ...Array.from(activeImages.keys()).filter(slot => matchesRoot(root, slot)), ...Array.from(pendingSlots).filter(slot => matchesRoot(root, slot))]).forEach(revokeSlot);
    cleanup();
  }
  function controls(certificate) {
    const id = certificate?.id;
    if (!id || !uploadAllowed(id)) return '';
    const inputId = `certificate-signature-file-${String(id).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 150)}`;
    return `<section class="certificate-signature-image-panel" data-certificate-signature-controls data-certificate-id="${h(id)}"><h3>Imagem da assinatura</h3><p>A imagem aparece somente na consulta digital. Ela não será impressa nem incluída no PDF.</p><p>Enviar uma imagem não assina o documento e não altera sua situação. A assinatura do certificado segue a ação Assinar.</p><form data-certificate-signature-form data-certificate-id="${h(id)}"><label for="${inputId}">Imagem PNG ou JPEG</label><div class="certificate-signature-image-fields"><input id="${inputId}" type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" data-certificate-signature-file required><button type="submit" class="btn" data-certificate-signature-save>Salvar imagem</button></div><small>Até 2 MB e 4.096 pixels por lado. Enviar outra imagem substitui somente a imagem desta consulta.</small><p class="certificate-signature-image-status" data-certificate-signature-status role="status" aria-live="polite"></p><p class="certificate-signature-image-error" data-certificate-signature-error role="alert" hidden></p></form></section>`;
  }
  function displayReadError(root, id, message) {
    const candidates = Array.from(root.querySelectorAll?.('[data-certificate-signature-controls]') || []);
    candidates.filter(control => control.dataset.certificateId === id).forEach(control => {
      const error = control.querySelector('[data-certificate-signature-error]');
      if (error) { error.textContent = message; error.hidden = false; }
    });
  }
  async function hydrate(root = document) {
    cleanup();
    await Promise.all(slots(root).map(async slot => {
      revokeSlot(slot);
      if (!slotAllowed(slot)) return;
      const id = slot.dataset.certificateId, generation = generations.get(slot), scope = contextKey();
      pendingSlots.add(slot); slot.setAttribute('aria-busy', 'true');
      const result = await checkedRead(id);
      if (generations.get(slot) !== generation || !slotAllowed(slot) || slot.dataset.certificateId !== id || scope !== contextKey() || !matchesRoot(root, slot)) { if (generations.get(slot) === generation) revokeSlot(slot); return; }
      pendingSlots.delete(slot); slot.removeAttribute('aria-busy');
      if (!result.ok) { displayReadError(root, id, result.error); return; }
      if (!result.record) return;
      const url = URL.createObjectURL(result.record.blob), image = document.createElement('img');
      image.src = url; image.alt = 'Imagem de assinatura anexada à consulta do certificado'; image.setAttribute('data-certificate-signature-image', '');
      const previousAriaHidden = slot.getAttribute('aria-hidden'); slot.removeAttribute('aria-hidden');
      slot.appendChild(image); activeImages.set(slot, { url, certificateId: id, previousAriaHidden });
    }));
  }

  function openPrint(certificateId) {
    const certificate = canonical(certificateId);
    if (!certificate) return fail('Certificado indisponível para impressão neste acesso.');
    if (typeof window.ancalCertificatePDF?.build !== 'function') return fail('O gerador do certificado para impressão não está disponível.');
    let popup, url;
    try {
      const pdf = window.ancalCertificatePDF.build(certificate);
      if (!pdf || !canonical(certificateId)) return fail('Não foi possível preparar o certificado para impressão.');
      popup = window.open('about:blank', '_blank');
      if (!popup) return fail('O navegador bloqueou a nova aba. Permita pop-ups para abrir o certificado para impressão.');
      popup.opener = null;
      url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
      popup.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return { ok: true };
    } catch (_) {
      if (url) URL.revokeObjectURL(url);
      try { popup?.close?.(); } catch (_) {}
      return fail('Não foi possível abrir o PDF para impressão. O arquivo de impressão não inclui a imagem da assinatura.');
    }
  }

  function currentForm(form, id, expectedActor) {
    return form.isConnected === true && document.querySelector('[data-certificate-signature-form]') === form && form.dataset.certificateId === id && document.querySelector('#modalBackdrop')?.classList.contains('open') && uploadAllowed(id, expectedActor);
  }
  async function submit(form) {
    const id = form.dataset.certificateId, expectedActor = actorKey(actor());
    if (!currentForm(form, id, expectedActor)) return;
    const input = form.querySelector('[data-certificate-signature-file]'), file = input?.files?.[0], button = form.querySelector('[data-certificate-signature-save]');
    const status = form.querySelector('[data-certificate-signature-status]'), error = form.querySelector('[data-certificate-signature-error]');
    if (button.disabled) return;
    error.hidden = true; error.textContent = ''; status.textContent = 'Validando e armazenando a imagem…'; button.disabled = true;
    try {
      const result = await upload(id, file, { isCurrent: () => currentForm(form, id, expectedActor) && input.files?.[0] === file });
      if (!currentForm(form, id, expectedActor)) return;
      if (input.files?.[0] !== file) { status.textContent = ''; error.textContent = 'O arquivo selecionado mudou durante o envio. Salve a nova imagem selecionada.'; error.hidden = false; return; }
      status.textContent = result.ok ? 'Imagem salva para a consulta digital. Ela não será impressa nem incluída no PDF.' : '';
      if (!result.ok) { error.textContent = result.error; error.hidden = false; }
      else { form.querySelector('[data-certificate-signature-file]').value = ''; await hydrate(document.querySelector('#modalBody') || document); }
    } finally { button.disabled = false; }
  }
  document.addEventListener('submit', event => { if (!event.target.matches?.('[data-certificate-signature-form]')) return; event.preventDefault(); submit(event.target); });
  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-certificate-signature-print]'); if (!button) return;
    event.preventDefault(); const result = openPrint(button.dataset.certificateSignaturePrint);
    if (!result.ok && typeof showToast === 'function') showToast(result.error);
  });
  ['ancal-signature-images-changed', 'ancal-certificates-changed', 'ancal-access-changed'].forEach(name => document.addEventListener(name, () => { hydrate(document); }));
  if (typeof MutationObserver === 'function' && document.body) {
    let previousContext = contextKey();
    const observer = new MutationObserver(() => {
      const nextContext = contextKey();
      if (nextContext !== previousContext) { previousContext = nextContext; dispose(document); hydrate(document); }
      else cleanup();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-certificate-id'] });
  }
  window.ancalSignatureImages = { controls, hydrate, dispose, upload, get, openPrint };
}());
