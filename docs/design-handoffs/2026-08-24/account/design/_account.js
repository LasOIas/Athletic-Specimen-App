/* Account + auth flow behaviour. Validation, reveal, meter, and the one
   hand-off the canvas can't do from a click: a form that only navigates
   once its fields are actually good. */
(function () {
  var TK = 'as-account-toast';

  function toast(msg) {
    if (!msg) return;
    var t = document.createElement('div');
    t.className = 'cik-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('is-leaving'); }, 1700);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2100);
  }

  // A save lands on the NEXT screen, so the message rides across the swap.
  try {
    var pend = sessionStorage.getItem(TK);
    if (pend) { sessionStorage.removeItem(TK); toast(pend); }
  } catch (e) {}

  function go(id, msg) {
    if (msg) { try { sessionStorage.setItem(TK, msg); } catch (e) {} }
    if (!id) { if (msg) toast(msg); return; }
    try {
      var host = window.parent && window.parent !== window ? window.parent.__canvas : null;
      if (host && host.show(id)) return;
    } catch (e) {}
    window.location.href = id + '.html';
  }

  function score(v) {
    if (v.length < 8) return v.length >= 4 ? 1 : 0;
    var kinds = 0;
    if (/[a-z]/.test(v)) kinds++;
    if (/[A-Z]/.test(v)) kinds++;
    if (/[0-9]/.test(v)) kinds++;
    if (/[^A-Za-z0-9]/.test(v)) kinds++;
    if (v.length >= 12 && kinds >= 2) return 3;
    return kinds >= 3 ? 3 : 2;
  }
  var LAB = ['', 'Weak', 'OK', 'Strong'];

  function meter(inp) {
    var box = inp.form ? inp.form.querySelector('[data-sbox]') : null;
    if (!box) return;
    var s = inp.value ? score(inp.value) : 0;
    box.classList.remove('is-1', 'is-2', 'is-3');
    if (s) box.classList.add('is-' + s);
    var lab = box.querySelector('.au-slab');
    if (lab) lab.textContent = LAB[s];
  }

  function clearErr(form) {
    var e = form && form.querySelector('.auth-err');
    if (e && !e.hidden) { e.hidden = true; e.textContent = ''; }
  }

  document.addEventListener('input', function (e) {
    var inp = e.target;
    if (!inp || !inp.hasAttribute) return;
    if (inp.hasAttribute('data-strength')) meter(inp);
    clearErr(inp.form);
  });

  document.addEventListener('click', function (e) {
    var r = e.target.closest('[data-reveal]');
    if (r) {
      var inp = document.getElementById(r.getAttribute('data-reveal'));
      if (!inp) return;
      var hidden = inp.type === 'password';
      inp.type = hidden ? 'text' : 'password';
      r.textContent = hidden ? 'Hide' : 'Show';
      return;
    }
    var x = e.target.closest('[data-vb-x]');
    if (x) { var vb = x.closest('.vb'); if (vb) vb.classList.add('is-gone'); return; }
    var rs = e.target.closest('[data-resend]');
    if (rs) { rs.disabled = true; rs.textContent = 'Sent again'; toast('Email sent'); return; }
    // a plain button that only reports (Cancel this change)
    var tb = e.target.closest('[data-toast]:not(form)');
    if (tb && tb.tagName === 'BUTTON' && tb.type !== 'submit') {
      try { sessionStorage.setItem(TK, tb.getAttribute('data-toast')); } catch (err) {}
    }
  });

  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (!f || f.tagName !== 'FORM') return;
    e.preventDefault();
    var box = f.querySelector('.auth-err');
    function fail(msg, el) {
      if (box) { box.textContent = msg; box.hidden = false; }
      if (el) el.focus();
    }
    var fields = f.querySelectorAll('input');
    for (var i = 0; i < fields.length; i++) {
      var inp = fields[i], v = inp.value.trim();
      if (inp.required && !v) return fail('Fill in every field.', inp);
      if (inp.type === 'email' && !/^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(v)) return fail("That email doesn't look right.", inp);
      // a current-password field is the wrong-password state's home
      if (inp.hasAttribute('data-current') && v.length < 6) return fail('That password is wrong.', inp);
      var min = parseInt(inp.getAttribute('data-min'), 10);
      if (min && v.length < min) return fail('Your new password needs at least ' + min + ' characters.', inp);
      var match = inp.getAttribute('data-match');
      if (match) {
        var other = document.getElementById(match);
        if (other && other.value !== inp.value) return fail("Those two passwords don't match.", inp);
      }
    }
    if (box) { box.hidden = true; box.textContent = ''; }
    go(f.getAttribute('data-go'), f.getAttribute('data-toast'));
  });
})();
