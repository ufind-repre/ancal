(function () {
  'use strict';

  const panel = document.getElementById('sidebar');
  const viewport = document.getElementById('topNavViewport');
  const items = document.getElementById('topNavItems');
  const toggleButton = document.getElementById('menuToggle');
  const viewButton = document.getElementById('viewToggleShortcut');
  const scrim = document.getElementById('scrim');
  const main = document.getElementById('mainContent');
  const back = document.querySelector('[data-nav-scroll="back"]');
  const next = document.querySelector('[data-nav-scroll="next"]');
  let returnFocus = null;
  let previousMainInert = false;

  const isOpen = () => panel.classList.contains('open');
  const motion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  const keyOf = button => button?.dataset.page ? 'internal:' + button.dataset.page : button?.dataset.clientPage ? 'client:' + button.dataset.clientPage : '';

  function updateArrows() {
    const maximum = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    back.disabled = viewport.scrollLeft <= 1;
    next.disabled = viewport.scrollLeft >= maximum - 1;
    viewport.classList.toggle('can-scroll-back', !back.disabled);
    viewport.classList.toggle('can-scroll-next', !next.disabled);
  }
  function reveal(button) {
    if (!button) return;
    const parent = viewport.getBoundingClientRect();
    const child = button.getBoundingClientRect();
    if (child.left < parent.left) viewport.scrollBy({ left: child.left - parent.left - 8, behavior: 'auto' });
    else if (child.right > parent.right) viewport.scrollBy({ left: child.right - parent.right + 8, behavior: 'auto' });
  }
  function sync() {
    const focusKey = items.contains(document.activeElement) ? keyOf(document.activeElement.closest('.nav-link')) : '';
    const source = document.getElementById(portalMode ? 'clientNavigation' : 'internalNavigation');
    const links = source && !source.hidden ? [...source.querySelectorAll('.nav-link')] : [];
    const clones = links.map(link => {
      const clone = link.cloneNode(true);
      clone.setAttribute('data-nav-item', '');
      if (clone.classList.contains('active')) clone.setAttribute('aria-current', 'page');
      else clone.removeAttribute('aria-current');
      return clone;
    });
    items.replaceChildren(...clones);
    if (!clones.length) {
      const empty = document.createElement('span');
      empty.className = 'top-nav-empty';
      empty.textContent = portalMode ? 'Nenhuma empresa disponível para consulta' : 'Navegação';
      items.appendChild(empty);
    }
    document.getElementById('headerViewLabel').textContent = portalMode ? 'Visão cliente' : 'Visão geral';
    document.getElementById('optionsHeading').textContent = portalMode ? 'Opções do cliente' : 'Opções do sistema';
    viewButton.setAttribute('aria-label', 'Alternar visualização. Atual: ' + (portalMode ? 'visão cliente' : 'visão geral'));
    const restore = focusKey ? clones.find(clone => keyOf(clone) === focusKey) : null;
    if (restore) restore.focus({ preventScroll: true });
    reveal(restore || clones.find(clone => clone.classList.contains('active')));
    updateArrows();
    window.requestAnimationFrame(updateArrows);
  }
  function setExpanded(value) {
    toggleButton.setAttribute('aria-expanded', String(value));
    viewButton.setAttribute('aria-expanded', String(value));
    toggleButton.setAttribute('aria-label', value ? 'Fechar opções de navegação' : 'Abrir opções de navegação');
    panel.setAttribute('aria-hidden', String(!value));
  }
  function focusable() {
    return [...panel.querySelectorAll('button,select,input,a[href],[tabindex]')].filter(element =>
      !element.disabled && element.getAttribute('tabindex') !== '-1' && !element.closest('[hidden]') && !element.closest('[inert]')
    );
  }
  function open(target) {
    if (!isOpen()) {
      returnFocus = document.activeElement;
      previousMainInert = main.inert;
    }
    panel.inert = false;
    panel.removeAttribute('inert');
    panel.classList.add('open');
    scrim.classList.add('show');
    document.body.classList.add('options-open');
    main.inert = true;
    main.setAttribute('inert', '');
    setExpanded(true);
    let destination;
    if (target === 'company') destination = panel.querySelector('#clientCompanySelect:not(:disabled)');
    if (target === 'view') destination = panel.querySelector('[data-view="' + (portalMode ? 'internal' : 'client') + '"]');
    (destination || focusable()[0])?.focus();
  }
  function close(options = {}) {
    const wasOpen = isOpen();
    panel.classList.remove('open');
    scrim.classList.remove('show');
    document.body.classList.remove('options-open');
    panel.inert = true;
    panel.setAttribute('inert', '');
    setExpanded(false);
    if (wasOpen) {
      main.inert = previousMainInert;
      if (!previousMainInert) main.removeAttribute('inert');
      if (options.restoreFocus !== false) {
        const target = returnFocus?.isConnected && !returnFocus.closest('[inert]') ? returnFocus : toggleButton;
        target.focus({ preventScroll: true });
      }
    }
  }
  function toggle() { if (isOpen()) close(); else open(); }
  function scroll(direction) {
    viewport.scrollBy({ left: (direction === 'back' ? -1 : 1) * Math.max(160, viewport.clientWidth * .75), behavior: motion() });
    window.requestAnimationFrame(updateArrows);
  }

  viewButton.addEventListener('click', () => { if (isOpen()) close(); else open('view'); });
  back.addEventListener('click', () => scroll('back'));
  next.addEventListener('click', () => scroll('next'));
  viewport.addEventListener('scroll', updateArrows, { passive: true });
  viewport.addEventListener('wheel', event => {
    if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
    const maximum = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const delta = event.deltaY * (event.deltaMode === 1 ? 24 : event.deltaMode === 2 ? viewport.clientWidth : 1);
    if ((delta > 0 && viewport.scrollLeft < maximum - 1) || (delta < 0 && viewport.scrollLeft > 1)) {
      event.preventDefault();
      viewport.scrollBy({ left: delta, behavior: 'auto' });
      updateArrows();
    }
  }, { passive: false });
  viewport.addEventListener('keydown', event => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    const links = [...items.querySelectorAll('.nav-link')];
    if (!links.length) return;
    const current = links.indexOf(document.activeElement.closest('.nav-link'));
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? links.length - 1 : Math.min(links.length - 1, Math.max(0, current + (event.key === 'ArrowRight' ? 1 : -1)));
    event.preventDefault();
    links[index].focus({ preventScroll: true });
    reveal(links[index]);
    updateArrows();
  });
  document.addEventListener('keydown', event => {
    if (!isOpen() || document.getElementById('modalBackdrop').classList.contains('open')) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.key !== 'Tab') return;
    const controls = focusable();
    const first = controls[0], last = controls.at(-1);
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
  }, true);
  document.addEventListener('click', event => {
    if (isOpen() && !panel.contains(event.target) && !event.target.closest('#menuToggle,#viewToggleShortcut,[data-client-change-company]')) close({ restoreFocus: false });
  });
  window.addEventListener('resize', () => { reveal(items.querySelector('.active')); updateArrows(); });
  if (typeof ResizeObserver === 'function') new ResizeObserver(updateArrows).observe(viewport);
  document.fonts?.ready?.then(() => { reveal(items.querySelector('.active')); updateArrows(); });

  window.ancalNavigation = { sync, open, toggle, close };
  close({ restoreFocus: false });
  sync();
})();
