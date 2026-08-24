/* ATHLETIC SPECIMEN — MOTION, the three things CSS cannot see.
   Round 2026-08-24. Everything else in the system is in _motion-app.css.

   1. A number or a status changed in place -> bump it, so the change is
      witnessed instead of discovered.
   2. A row was just inserted -> let it arrive rather than appear.
   3. A row is about to leave -> data-m-leave plays it out first.

   No dependencies, no markup requirements, safe to load on any screen. */
(function () {
  var SETTLE = 900;              // ignore the page's own first paint
  var start = Date.now();
  var root = document.getElementById('app-content') || document.body;
  if (!root) return;

  function reduced() {
    return document.body.classList.contains('no-motion') ||
      (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function play(el, cls, ms) {
    if (!el || reduced() || el.dataset.mPlaying) return;
    el.dataset.mPlaying = '1';
    el.classList.add(cls);
    setTimeout(function () {
      el.classList.remove(cls);
      delete el.dataset.mPlaying;
    }, ms);
  }
  // a badge pops, a value bumps — same event, different shape
  function isBadge(el) {
    var c = el.className || '';
    if (typeof c !== 'string') return false;
    return /badge|count|-n$|-num|sectn|pill|tally/.test(c);
  }
  function mark(el) {
    if (!el || el.nodeType !== 1) return;
    if (Date.now() - start < SETTLE) return;
    var t = (el.textContent || '').trim();
    if (!t || t.length > 24) return;            // short values only: scores, counts, states
    play(el, isBadge(el) ? 'm-pop' : 'm-bump', 320);
  }

  new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      if (m.type === 'characterData') {
        mark(m.target.parentElement);
        return;
      }
      if (m.type === 'attributes') {
        // a panel or row coming out of [hidden] restarts its own CSS entrance;
        // a class flip to a new state does not, so flash the row
        if (m.attributeName === 'class' && Date.now() - start > SETTLE) {
          var el = m.target;
          if (/is-(on|done|paid|in|win|now)/.test(el.className || '') && /-row|-net|-lnet|-prow/.test(el.className || '')) {
            play(el, 'm-flash', 460);
          }
        }
        return;
      }
      Array.prototype.forEach.call(m.addedNodes, function (n) {
        if (n.nodeType === 3) { mark(m.target); return; }
        if (n.nodeType !== 1 || Date.now() - start < SETTLE) return;
        if (n.children && n.children.length > 6) return;   // a whole view swap, not a row
        play(n, 'm-in', 320);
      });
    });
  }).observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'hidden'] });

  // opt-in exit: anything that wants a row gone plays it out first
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-m-leave]');
    if (!t || reduced()) return;
    var row = t.closest(t.getAttribute('data-m-leave') || '[class*="-row"]');
    if (!row) return;
    row.style.transition = 'opacity var(--m-elem) var(--e-leave), transform var(--m-elem) var(--e-leave)';
    row.style.opacity = '0';
    row.style.transform = 'translateX(26px)';
  }, true);
})();
