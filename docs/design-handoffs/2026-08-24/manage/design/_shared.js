/* ATHLETIC SPECIMEN — the behaviour a screen needs to work on its own.
   Round 2026-08-24. The canvas pages own navigation, but a screen opened
   directly (or reviewed on its own) still has to answer a tap. Delegated, so it
   costs nothing on screens that have none of these controls. */
(function () {
  // A game you can see is a game you can score. On the player-facing pools and
  // bracket pages, tapping a game opens the same card the organizer uses — pools
  // take a real score, bracket games only need a winner.
  var sheet = null, source = null, was = { had: false, a: 0, b: 0 }, pair = ['', ''];

  function txt(el) { return el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : ''; }

  // Opening and closing anything on this page moves the page: heights animate,
  // so the rows below glide instead of jumping. Same durations and curves as the
  // rest of the motion system.
  function grow(el) {
    if (reducedMotion()) return;
    var full = el.offsetHeight;
    el.style.overflow = 'hidden';
    el.style.height = '0px';
    el.style.opacity = '0';
    void el.offsetWidth;
    el.style.transition = 'height 200ms cubic-bezier(.2,.7,.3,1), opacity 140ms cubic-bezier(.2,.7,.3,1)';
    el.style.height = full + 'px';
    el.style.opacity = '1';
    setTimeout(function () {
      el.style.height = '';
      el.style.overflow = '';
      el.style.transition = '';
      el.style.opacity = '';
    }, 230);
  }
  function shrink(el, done) {
    if (reducedMotion()) { el.remove(); if (done) done(); return; }
    var h = el.offsetHeight;
    el.style.overflow = 'hidden';
    el.style.height = h + 'px';
    void el.offsetWidth;
    el.style.transition = 'height 180ms cubic-bezier(.4,0,1,1), opacity 120ms cubic-bezier(.4,0,1,1)';
    el.style.height = '0px';
    el.style.opacity = '0';
    setTimeout(function () { el.remove(); if (done) done(); }, 200);
  }
  function collapse(el, hide) {
    if (reducedMotion()) { el.hidden = hide; return; }
    if (hide) {
      var h = el.offsetHeight;
      el.style.overflow = 'hidden';
      el.style.height = h + 'px';
      void el.offsetWidth;
      el.style.transition = 'height 200ms cubic-bezier(.4,0,1,1), opacity 140ms cubic-bezier(.4,0,1,1)';
      el.style.height = '0px';
      el.style.opacity = '0';
      setTimeout(function () {
        el.hidden = true;
        el.removeAttribute('style');
      }, 220);
    } else {
      el.hidden = false;
      grow(el);
    }
  }
  function reducedMotion() {
    return document.body.classList.contains('no-motion') ||
      (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  // any edit arms the page's Save and says so
  function dirty(from) {
    var scope = (from && from.closest('#app-content')) || document;
    var save = scope.querySelector('[data-mg-save]');
    if (save) save.disabled = false;
    var st = scope.querySelector('.mgr-status');
    if (st) st.textContent = 'Unsaved changes';
  }
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || !e.target || !e.target.classList) return;
    if (e.target.classList.contains('rlv-lin')) {
      e.preventDefault();
      var more = e.target.closest('.rlv-lines').querySelector('[data-rlv-line]');
      if (more) more.click();
    } else if (e.target.classList.contains('rlv-tin')) {
      e.preventDefault();
      var first = e.target.closest('.rlv-card').querySelector('.rlv-lin');
      if (first) first.focus();
    }
  });
  document.addEventListener('input', function (e) {
    if (e.target && e.target.matches && e.target.matches('.set-in, .pk-fv, .rf-tinput, .rf-pinput')) dirty(e.target);
  });

  function fill(sel, value) {
    var els = sheet.querySelectorAll(sel);
    for (var i = 0; i < els.length; i++) els[i].textContent = value;
  }

  function reset() {
    var rows = sheet.querySelectorAll('.mgs-row');
    for (var i = 0; i < rows.length; i++) {
      rows[i].classList.remove('is-won');
      var wb = rows[i].querySelector('[data-mgss-win]');
      if (wb) wb.setAttribute('aria-pressed', 'false');
    }
    var a = sheet.querySelector('#mgss-a'), b = sheet.querySelector('#mgss-b');
    if (a) a.textContent = '0';
    if (b) b.textContent = '0';
    var cta = sheet.querySelector('.mgs-cta');
    var winnerOnly = !a && !b;
    if (cta) cta.textContent = winnerOnly ? 'Save winner' : 'Save score';
    var lb = sheet.querySelector('[data-mgss="live"]');
    if (lb) lb.textContent = 'Save live score';
    var h0 = sheet.querySelector('.mgs-hint');
    if (h0 && h0.getAttribute('data-mgss-hint0') === null) h0.setAttribute('data-mgss-hint0', txt(h0));
    if (h0) h0.textContent = h0.getAttribute('data-mgss-hint0') || txt(h0);
  }

  // Any game can be reopened, finished or not: whatever is already recorded comes
  // back into the card so it can be corrected, and the button says so.
  function prefill(game) {
    var cta = sheet.querySelector('.mgs-cta');
    var a = sheet.querySelector('#mgss-a'), b = sheet.querySelector('#mgss-b');
    var lb = sheet.querySelector('[data-mgss="live"]');

    var live = liveOf(game);
    if (live) {
      if (a) a.textContent = live.a;
      if (b) b.textContent = live.b;
      if (cta) cta.textContent = 'Finish game';
      if (lb) lb.textContent = 'Update live score';
      setHint('Live score saved \u2014 the schedule shows it, but nothing counts until you finish the game.');
      return;
    }

    if (game.classList.contains('pl-g')) {
      var nums = txt(game.querySelector('.sc')).match(/\d+/g);
      if (a && b && nums && nums.length >= 2) {
        a.textContent = nums[0];
        b.textContent = nums[1];
        was = { had: true, a: parseInt(nums[0], 10) || 0, b: parseInt(nums[1], 10) || 0 };
        if (cta) cta.textContent = 'Update score';
      }
      return;
    }

    if (game.classList.contains('bt-node')) {
      var brows = game.querySelectorAll('.bt-row');
      var wonIndex = -1;
      for (var i = 0; i < brows.length; i++) if (brows[i].classList.contains('win')) wonIndex = i;
      if (wonIndex === -1) return;
      var side = wonIndex === 0 ? 'a' : 'b';
      var target = sheet.querySelector('.mgs-row[data-mgss-row="' + side + '"]');
      if (target) {
        target.classList.add('is-won');
        var wb = target.querySelector('[data-mgss-win]');
        if (wb) wb.setAttribute('aria-pressed', 'true');
        if (cta) cta.textContent = 'Update winner';
      }
    }
  }

  // ---- live scoring ------------------------------------------------------
  // A game in progress has a score too. Every card gets a second action that
  // saves the running score WITHOUT calling the game: the schedule shows the
  // numbers, the game stays LIVE, and standings stay untouched until it is
  // final. Winner-only cards (the bracket) get steppers injected here so both
  // kinds of card behave the same and everything downstream still reads
  // #mgss-a / #mgss-b.
  function stepper(sideName) {
    var w = document.createElement('span');
    w.className = 'mgs-step';
    w.innerHTML = '<button type="button" class="mgs-b" data-mgss-step="' + sideName + '" data-mgss-d="-1" aria-label="Minus one">\u2212</button>' +
      '<span class="mgss-sval mgs-val" id="mgss-' + sideName + '">0</span>' +
      '<button type="button" class="mgs-b" data-mgss-step="' + sideName + '" data-mgss-d="1" aria-label="Plus one">+</button>';
    return w;
  }
  function ensureLive() {
    if (!sheet.querySelector('#mgss-a')) {
      var rows = sheet.querySelectorAll('.mgs-row[data-mgss-row]');
      for (var i = 0; i < rows.length; i++) {
        var sideName = rows[i].getAttribute('data-mgss-row');
        if (sideName === 'a' || sideName === 'b') rows[i].appendChild(stepper(sideName));
      }
      sheet.querySelector('.mgs-card').classList.add('has-live-score');
    }
    var foot = sheet.querySelector('.mgs-foot');
    if (foot && !foot.querySelector('[data-mgss="live"]')) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'mgs-live';
      b.setAttribute('data-mgss', 'live');
      b.textContent = 'Save live score';
      foot.appendChild(b);
    }
  }
  function liveOf(game) {
    var v = game && game.getAttribute && game.getAttribute('data-mgss-live');
    var n = v ? v.split('-') : null;
    return n && n.length === 2 ? { a: parseInt(n[0], 10) || 0, b: parseInt(n[1], 10) || 0 } : null;
  }
  function setHint(text) {
    var h = sheet.querySelector('.mgs-hint');
    if (h) h.textContent = text;
  }

  // saving a score that is not a result yet
  function commitLive() {
    if (!source) { close(); return; }
    var a = sheet.querySelector('#mgss-a'), b = sheet.querySelector('#mgss-b');
    var av = parseInt(a && a.textContent, 10) || 0, bv = parseInt(b && b.textContent, 10) || 0;
    var err = sheet.querySelector('.mgss-err');
    if (!av && !bv) {
      if (err) { err.textContent = 'Add a point to at least one team first.'; err.hidden = false; }
      return;
    }
    if (err) err.hidden = true;

    // a game going back to in-progress gives its result back to the standings
    if (was.had) {
      applyDelta(source.closest('#app-content') || document, pair, was, { a: 0, b: 0 });
      was = { had: false, a: 0, b: 0 };
    }
    source.setAttribute('data-mgss-live', av + '-' + bv);

    if (source.classList.contains('pl-g')) {
      var sc = source.querySelector('.sc');
      if (!sc) {
        sc = document.createElement('span');
        sc.className = 'sc';
        var gt = source.querySelector('.gt');
        if (gt && gt.nextSibling) source.insertBefore(sc, gt.nextSibling); else source.appendChild(sc);
      }
      sc.textContent = av + '\u2013' + bv;
      sc.classList.add('is-live');
      source.classList.add('live');
      var ft = source.querySelector('.ftag');
      if (ft) ft.remove();
      if (!source.querySelector('.pill')) {
        var pill = document.createElement('span');
        pill.className = 'pill';
        pill.textContent = 'LIVE';
        source.appendChild(pill);
      }
      // nothing is decided yet, so no team is bolded as the winner
      var gtxt = source.querySelector('.gt');
      if (gtxt) {
        var names = gtxt.querySelectorAll('.win, .lose');
        for (var k = 0; k < names.length; k++) names[k].classList.remove('win', 'lose');
      }
    } else if (source.classList.contains('bt-node')) {
      source.classList.add('pd-bk-live');
      var brows = source.querySelectorAll('.bt-row');
      for (var r = 0; r < brows.length; r++) {
        brows[r].classList.remove('win');
        var cell = brows[r].querySelector('.bt-sc');
        if (!cell) {
          cell = document.createElement('span');
          cell.className = 'bt-sc';
          brows[r].appendChild(cell);
        }
        cell.textContent = r === 0 ? av : bv;
      }
      var meta = source.querySelector('.bt-meta');
      if (meta) meta.textContent = txt(meta).replace(/ \u00b7 Done$/, '');
    }
    close();
  }

  function open(game, teams, eyebrow, subs) {
    source = game;
    pair = [teams[0], teams[1]];
    was = { had: false, a: 0, b: 0 };
    reset();
    fill('[data-mgss-ta], [data-mgss-na]', teams[0]);
    fill('[data-mgss-tb], [data-mgss-nb]', teams[1]);
    if (subs) { fill('[data-mgss-sa]', subs[0] || ''); fill('[data-mgss-sb]', subs[1] || ''); }
    ensureLive();
    var eb = sheet.querySelector('[data-mgss-eyebrow]');
    if (eb && eyebrow) eb.textContent = eyebrow;
    prefill(game);
    sheet.hidden = false;
    sheet.style.setProperty('display', 'flex', 'important');
    document.body.classList.add('pd-noscroll');
  }

  function close() {
    if (!sheet) return;
    sheet.hidden = true;
    sheet.style.removeProperty('display');
    document.body.classList.remove('pd-noscroll');
    source = null;
  }

  // Standings move with the score, and they move by the DIFFERENCE the edit
  // makes: the table's own numbers are the baseline, so correcting 21–13 to
  // 22–13 shifts one point of differential rather than recomputing the season.
  function applyDelta(scope, teams, was, now) {
    var rows = scope.querySelectorAll('.pl-srow');
    if (!rows.length) return;

    function rowFor(name) {
      for (var i = 0; i < rows.length; i++) {
        var tag = rows[i].getAttribute('data-team');
        if (tag === name) return rows[i];
        if (!tag && txt(rows[i].querySelector('.c2')).indexOf(name) === 0) {
          rows[i].setAttribute('data-team', name);
          return rows[i];
        }
      }
      return null;
    }
    function readRow(row) {
      var wl = txt(row.querySelector('.c3')).match(/\d+/g) || ['0', '0'];
      var d = parseInt(txt(row.querySelector('.c4')).replace(/[^\d-]/g, ''), 10) || 0;
      return { w: parseInt(wl[0], 10) || 0, l: parseInt(wl[1], 10) || 0, diff: d };
    }
    function writeRow(row, s) {
      var c3 = row.querySelector('.c3'), c4 = row.querySelector('.c4');
      if (c3) c3.textContent = Math.max(0, s.w) + '\u2013' + Math.max(0, s.l);
      if (c4) {
        c4.textContent = s.diff > 0 ? '+' + s.diff : String(s.diff);
        c4.classList.toggle('n', s.diff < 0);
      }
    }

    var rA = rowFor(teams[0]), rB = rowFor(teams[1]);
    if (!rA || !rB) return;
    var sA = readRow(rA), sB = readRow(rB);

    // undo what the game used to say, then apply what it says now
    if (was.had) {
      sA.diff -= (was.a - was.b);
      sB.diff -= (was.b - was.a);
      if (was.a > was.b) { sA.w--; sB.l--; } else if (was.b > was.a) { sB.w--; sA.l--; }
    }
    sA.diff += (now.a - now.b);
    sB.diff += (now.b - now.a);
    if (now.a > now.b) { sA.w++; sB.l++; } else if (now.b > now.a) { sB.w++; sA.l++; }

    writeRow(rA, sA);
    writeRow(rB, sB);

    // the table is ranked, so re-sort and renumber it
    var list = [].slice.call(rows);
    var parent = list[0].parentNode;
    var anchor = list[list.length - 1].nextSibling;
    list.sort(function (p, q) {
      var P = readRow(p), Q = readRow(q);
      return (Q.w - P.w) || (Q.diff - P.diff);
    });
    list.forEach(function (row, idx) {
      var c1 = row.querySelector('.c1');
      if (c1) c1.textContent = idx + 1;
      parent.insertBefore(row, anchor);
    });
  }

  // writing the result back onto the game you tapped
  function commit() {
    if (!source) { close(); return; }
    source.removeAttribute('data-mgss-live');
    var won = sheet.querySelector('.mgs-row.is-won');
    var side = won ? won.getAttribute('data-mgss-row') : null;
    var a = sheet.querySelector('#mgss-a'), b = sheet.querySelector('#mgss-b');
    var av = parseInt(a && a.textContent, 10) || 0, bv = parseInt(b && b.textContent, 10) || 0;

    if (source.classList.contains('pl-g')) {
      var sc = source.querySelector('.sc');
      if (!sc) {
        sc = document.createElement('span');
        sc.className = 'sc';
        var gt = source.querySelector('.gt');
        if (gt && gt.nextSibling) source.insertBefore(sc, gt.nextSibling); else source.appendChild(sc);
      }
      sc.textContent = (av || bv) ? (av + '\u2013' + bv) : 'Final';
      source.classList.remove('live');
      // LIVE is a .pill, Done is a .ftag: saving a score retires the one and
      // guarantees the other, so the row never loses its status badge
      var live = source.querySelector('.pill');
      if (live) live.remove();
      var ftag = source.querySelector('.ftag');
      if (!ftag) {
        ftag = document.createElement('span');
        ftag.className = 'ftag';
        source.appendChild(ftag);
      }
      ftag.textContent = 'DONE';
      applyDelta(source.closest('#app-content') || document, pair, was, { a: av, b: bv });      var gtxt = source.querySelector('.gt');
      if (gtxt && side) {
        var names = gtxt.querySelectorAll('.win, .lose');
        if (!names.length) {
          var parts = txt(gtxt).split(' vs ');
          if (parts.length === 2) {
            gtxt.innerHTML = '<span class="' + (side === 'a' ? 'win' : 'lose') + '"><b>' + parts[0] + '</b></span> <span class="vs">vs</span> <span class="' + (side === 'a' ? 'lose' : 'win') + '">' + parts[1] + '</span>';
          }
        }
      }
    } else if (source.classList.contains('bt-node')) {
      var rows = source.querySelectorAll('.bt-row');
      for (var i = 0; i < rows.length; i++) {
        rows[i].classList.toggle('win', (side === 'a' && i === 0) || (side === 'b' && i === rows.length - 1));
      }
      source.classList.remove('pd-bk-live');
      var lp = source.querySelectorAll('.pill, [class*="live"]');
      for (var k = 0; k < lp.length; k++) if (lp[k] !== source) lp[k].remove();
      var meta = source.querySelector('.bt-meta');
      if (meta && txt(meta).indexOf('Done') === -1) meta.textContent = txt(meta) + ' \u00b7 Done';
    }
    close();
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    sheet = document.querySelector('#mgss-sheet[data-mgss-auto]');
    if (sheet) {
      if (t.closest('[data-mgss="close"]')) { e.preventDefault(); close(); return; }
      if (t.closest('[data-mgss="final"]')) { e.preventDefault(); commit(); return; }
      if (t.closest('[data-mgss="live"]')) { e.preventDefault(); commitLive(); return; }
      if (t === sheet) { close(); return; }

      // a pool game: the row is the target
      var pg = t.closest('.pl-g');
      if (pg && !t.closest('[data-team-peek]') && !t.closest('.mgs-card')) {
        e.preventDefault();
        var gt = pg.querySelector('.gt');
        var pair = txt(gt).split(' vs ');
        if (pair.length === 2) {
          var net = pg.previousElementSibling;
          while (net && !net.classList.contains('pl-net')) net = net.previousElementSibling;
          open(pg, pair, [txt(pg.querySelector('.rd')), txt(net)].filter(Boolean).join(' \u00b7 '));
        }
        return;
      }

      // a bracket game: the card is the target
      var node = t.closest('.bt-node');
      if (node && !t.closest('[data-team-peek]') && !t.closest('.mgs-card')) {
        var nrows = node.querySelectorAll('.bt-row');
        var n1 = nrows[0] && nrows[0].querySelector('.bt-name');
        var n2 = nrows[nrows.length - 1] && nrows[nrows.length - 1].querySelector('.bt-name');
        var tbd = (n1 && n1.classList.contains('bt-tbd')) || (n2 && n2.classList.contains('bt-tbd'));
        if (n1 && n2 && !tbd) {
          e.preventDefault();
          open(node, [txt(n1).replace(/^\d+/, '').trim(), txt(n2).replace(/^\d+/, '').trim()], txt(node.querySelector('.bt-meta')));
          return;
        }
      }
    }

    // ---- pool controls ----------------------------------------------------
    // Done closes the panel.
    var pcDone = t.closest('[data-mgps-controls]');
    if (pcDone) {
      var panel = document.querySelector('[data-pc-panel]');
      if (panel) {
        e.preventDefault();
        var hide = !panel.hidden;
        collapse(panel, hide);
        // the head's toggle is outside the panel, so there is always a way back
        [].forEach.call(document.querySelectorAll('.pc-toggle'), function (b) {
          b.textContent = hide ? 'Open' : 'Done';
          b.setAttribute('aria-expanded', hide ? 'false' : 'true');
        });
        return;
      }
    }

    // Tapping a team offers the pools it can go to, and moving it actually moves it.
    var pcTeam = t.closest('[data-mgps-team]');
    if (pcTeam && !t.closest('[data-pc-pick]')) {
      e.preventDefault();
      var openPick = document.querySelector('.pc-pick');
      if (openPick) shrink(openPick);
      if (pcTeam.getAttribute('data-pc-open') === '1') { pcTeam.removeAttribute('data-pc-open'); return; }
      [].forEach.call(document.querySelectorAll('[data-pc-open]'), function (b) { b.removeAttribute('data-pc-open'); });
      pcTeam.setAttribute('data-pc-open', '1');
      var here = pcTeam.closest('.pc-card');
      var pick = document.createElement('div');
      pick.className = 'pc-pick';
      var name = txt(pcTeam.querySelector('.pc-tn'));
      var html = '<span class="pc-pl">Move ' + '' + '</span>';
      pick.innerHTML = '<span class="pc-pl"></span>';
      pick.querySelector('.pc-pl').textContent = 'Move ' + name + ' to';
      [].forEach.call(document.querySelectorAll('.pc-card'), function (card) {
        if (card === here) return;
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'pc-pbtn';
        b.setAttribute('data-pc-pick', '1');
        b.textContent = txt(card.querySelector('.pc-name'));
        pick.appendChild(b);
      });
      var cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'pc-pcancel';
      cancel.setAttribute('data-pc-pick', 'cancel');
      cancel.textContent = 'Cancel';
      pick.appendChild(cancel);
      pcTeam.parentNode.insertBefore(pick, pcTeam.nextSibling);
      grow(pick);
      return;
    }

    var pcPick = t.closest('[data-pc-pick]');
    if (pcPick) {
      e.preventDefault();
      var box = pcPick.closest('.pc-pick');
      var row = box.previousElementSibling;
      if (pcPick.getAttribute('data-pc-pick') !== 'cancel') {
        var target = null;
        [].forEach.call(document.querySelectorAll('.pc-card'), function (card) {
          if (txt(card.querySelector('.pc-name')) === txt(pcPick)) target = card;
        });
        if (target && row) {
          var away = row;
          away.style.transition = 'opacity 140ms cubic-bezier(.4,0,1,1), transform 140ms cubic-bezier(.4,0,1,1)';
          away.style.opacity = '0';
          away.style.transform = 'translateX(22px)';
          setTimeout(function () {
            target.appendChild(away);
            away.style.transition = '';
            away.style.transform = 'translateY(8px)';
            void away.offsetWidth;
            away.style.transition = 'opacity 200ms cubic-bezier(.2,.7,.3,1), transform 200ms cubic-bezier(.2,.7,.3,1)';
            away.style.opacity = '1';
            away.style.transform = 'none';
            away.classList.add('m-flash');
            setTimeout(function () {
              away.classList.remove('m-flash');
              away.style.transition = '';
              away.style.transform = '';
              away.style.opacity = '';
            }, 460);
          }, 150);
        }
      }
      if (row) row.removeAttribute('data-pc-open');
      shrink(box);
      return;
    }

    // Edit nets: the label becomes a field, the button becomes Save.
    var pcNets = t.closest('[data-mgps-editnets]');
    if (pcNets) {
      e.preventDefault();
      var hd = pcNets.closest('.pc-hd');
      // NOT named "open": this callback also calls the score card's open(), and a
      // var of that name here hoists over it for the whole handler
      var netField = hd.querySelector('.pc-nin');
      if (!netField) {
        var label = hd.querySelector('.pc-nets');
        var inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'pc-nin';
        inp.value = txt(label);
        inp.setAttribute('aria-label', 'Nets for this pool');
        label.hidden = true;
        hd.insertBefore(inp, label.nextSibling);
        pcNets.textContent = 'Save nets';
        inp.focus();
        inp.select();
      } else {
        var lbl = hd.querySelector('.pc-nets');
        lbl.textContent = (netField.value || '').trim() || txt(lbl);
        lbl.hidden = false;
        netField.remove();
        pcNets.textContent = 'Edit nets';
      }
      return;
    }

    // Reset pools: asks for the name, then really clears the pool results.
    var pcReset = t.closest('[data-mgps-reset]');
    if (pcReset) {
      e.preventDefault();
      var drow = pcReset.closest('.mgv-drow') || pcReset.parentNode;
      if (drow.querySelector('.pc-cin')) { drow.querySelector('.pc-cin').focus(); return; }
      var wrap = document.createElement('div');
      wrap.className = 'pc-confirm';
      wrap.innerHTML =
        '<input class="pc-cin" type="text" placeholder="Type the tournament name" autocomplete="off" aria-label="Type the tournament name">' +
        '<button type="button" class="pc-cgo" data-pc-reset-go>Reset pools</button>' +
        '<button type="button" class="pc-pcancel" data-pc-reset-cancel>Cancel</button>';
      drow.parentNode.insertBefore(wrap, drow.nextSibling);
      grow(wrap);
      wrap.querySelector('.pc-cin').focus();
      return;
    }
    if (t.closest('[data-pc-reset-cancel]')) {
      e.preventDefault();
      var cbox = t.closest('.pc-confirm');
      if (cbox) shrink(cbox);
      return;
    }
    if (t.closest('[data-pc-reset-go]')) {
      e.preventDefault();
      var cwrap = t.closest('.pc-confirm');
      var typed = (cwrap.querySelector('.pc-cin').value || '').trim();
      if (!typed) { cwrap.querySelector('.pc-cin').focus(); return; }
      [].forEach.call(document.querySelectorAll('.pl-g'), function (g) {
        var sc = g.querySelector('.sc'); if (sc) sc.remove();
        var ft = g.querySelector('.ftag'); if (ft) ft.remove();
        var pl = g.querySelector('.pill'); if (pl) pl.remove();
        g.classList.remove('live');
        var gt = g.querySelector('.gt');
        if (gt) {
          var pair = txt(gt).split(' vs ');
          if (pair.length === 2) gt.innerHTML = '<span></span> <span class="vs">vs</span> <span></span>';
          if (pair.length === 2) {
            gt.children[0].textContent = pair[0];
            gt.children[2].textContent = pair[1];
          }
        }
      });
      [].forEach.call(document.querySelectorAll('.pl-srow'), function (r) {
        var c3 = r.querySelector('.c3'), c4 = r.querySelector('.c4');
        if (c3) c3.textContent = '0\u20130';
        if (c4) { c4.textContent = '0'; c4.classList.remove('n'); }
      });
      shrink(cwrap);
      var st2 = document.querySelector('.pl-meta');
      if (st2) st2.textContent = 'Pools reset \u00b7 0 of 12 games done';
      return;
    }

    // Edit a section where it stands: its head and every rule become fields,
    // Done puts them back as text. No trip to another screen to fix a typo.
    var editSect = t.closest('[data-rlv-edit]');
    if (editSect) {
      e.preventDefault();
      var ec = editSect.closest('.rlv-card');
      var titleNow = txt(ec.querySelector('.rl-h'));
      var rulesNow = [].map.call(ec.querySelectorAll('.rlv-lines .rl-li'), function (li) {
        var last = li.querySelector('span:last-child');
        return txt(last);
      }).filter(function (v) { return v; });
      if (!rulesNow.length) {
        var para = txt(ec.querySelector('.rl-p'));
        if (para && para.indexOf('No rules') !== 0) rulesNow = [para];
      }
      ec.className = 'rlv-card is-new';
      ec.innerHTML =
        '<div class="rlv-hd">' +
          '<input class="rlv-tin" type="text" autocomplete="off" aria-label="Section name">' +
          '<button type="button" class="rlv-edit" data-rlv-done><span>Done</span></button>' +
        '</div>' +
        '<div class="rlv-lines"><button type="button" class="rlv-more" data-rlv-line><span>+</span>Add a rule</button></div>';
      ec.querySelector('.rlv-tin').value = titleNow;
      var lbox = ec.querySelector('.rlv-lines');
      var moreBtn = lbox.querySelector('[data-rlv-line]');
      (rulesNow.length ? rulesNow : ['']).forEach(function (r) {
        var row = document.createElement('div');
        row.className = 'rl-li';
        row.innerHTML = '<span class="rl-dot"></span><input class="rlv-lin" type="text" placeholder="Write a rule" autocomplete="off" aria-label="Rule">';
        row.querySelector('input').value = r;
        lbox.insertBefore(row, moreBtn);
      });
      var firstIn = ec.querySelector('.rlv-tin');
      if (firstIn) { firstIn.focus(); firstIn.select(); }
      return;
    }

    // "Add a section" adds a section: a new card, named and filled right here,
    // rather than a trip to the editor for something this small.
    var addSect = t.closest('[data-rlv-add]');
    if (addSect) {
      e.preventDefault();
      var card = document.createElement('div');
      card.className = 'rlv-card is-new';
      card.innerHTML =
        '<div class="rlv-hd">' +
          '<input class="rlv-tin" type="text" placeholder="Section name" autocomplete="off" aria-label="Section name">' +
          '<button type="button" class="rlv-edit" data-rlv-done><span>Done</span></button>' +
        '</div>' +
        '<div class="rlv-lines">' +
          '<div class="rl-li"><span class="rl-dot"></span><input class="rlv-lin" type="text" placeholder="Write a rule" autocomplete="off" aria-label="Rule"></div>' +
          '<button type="button" class="rlv-more" data-rlv-line><span>+</span>Add a rule</button>' +
        '</div>';
      addSect.parentNode.insertBefore(card, addSect);
      var ti = card.querySelector('.rlv-tin');
      if (ti) ti.focus();
      return;
    }

    var addLine = t.closest('[data-rlv-line]');
    if (addLine) {
      e.preventDefault();
      var li = document.createElement('div');
      li.className = 'rl-li';
      li.innerHTML = '<span class="rl-dot"></span><input class="rlv-lin" type="text" placeholder="Write a rule" autocomplete="off" aria-label="Rule">';
      addLine.parentNode.insertBefore(li, addLine);
      li.querySelector('input').focus();
      return;
    }

    // committing the new section turns the inputs into the rules themselves
    var doneSect = t.closest('[data-rlv-done]');
    if (doneSect) {
      e.preventDefault();
      var nc = doneSect.closest('.rlv-card');
      var title = (nc.querySelector('.rlv-tin').value || '').trim();
      if (!title) { nc.remove(); return; }
      var lines = [].map.call(nc.querySelectorAll('.rlv-lin'), function (inp) { return (inp.value || '').trim(); })
        .filter(function (v) { return v; });
      var pencil = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
      // the organizer's words go in as TEXT: a stray angle bracket in a rule
      // must not be able to restructure the card
      nc.className = 'rlv-card';
      nc.innerHTML =
        '<div class="rlv-hd"><div class="rl-h"></div>' +
        '<button type="button" class="rlv-edit" data-rlv-edit>' + pencil + '<span>Edit</span></button></div>' +
        '<div class="rlv-lines"></div>';
      nc.querySelector('.rl-h').textContent = title;
      var box = nc.querySelector('.rlv-lines');
      if (!lines.length) {
        var empty = document.createElement('p');
        empty.className = 'rl-p';
        empty.textContent = 'No rules in this section yet.';
        box.appendChild(empty);
      } else {
        lines.forEach(function (l) {
          var row = document.createElement('div');
          row.className = 'rl-li';
          var dot = document.createElement('span');
          dot.className = 'rl-dot';
          var span = document.createElement('span');
          span.textContent = l;
          row.appendChild(dot);
          row.appendChild(span);
          box.appendChild(row);
        });
      }
      return;
    }

    // switches, and the Save they arm: a toggle that never moves is worse than
    // no toggle, and a settings page that cannot be committed is a picture
    var sw = t.closest('.mg-sw[role="switch"], [data-mges-toggle]');
    if (sw) {
      e.preventDefault();
      var on = sw.getAttribute('aria-checked') !== 'true';
      sw.classList.toggle('on', on);
      sw.setAttribute('aria-checked', on ? 'true' : 'false');
      dirty(sw);
      return;
    }

    var saveBtn = t.closest('[data-mg-save]');
    if (saveBtn && !saveBtn.disabled) {
      e.preventDefault();
      saveBtn.disabled = true;
      var st = document.getElementById('mges-status') || document.querySelector('.mgr-status');
      if (st) st.textContent = 'Saved';
      return;
    }

    // pick the winner: one tap calls the game
    var win = t.closest('[data-mgss-win]');
    if (win) {
      e.preventDefault();
      var card = win.closest('.mgs-card') || document;
      var myRow = win.closest('.mgs-row');
      var rows = card.querySelectorAll('.mgs-row');
      for (var i = 0; i < rows.length; i++) {
        var on = rows[i] === myRow;
        rows[i].classList.toggle('is-won', on);
        var wb = rows[i].querySelector('[data-mgss-win]');
        if (wb) wb.setAttribute('aria-pressed', on ? 'true' : 'false');
      }
      var av = card.querySelector('#mgss-a'), bv = card.querySelector('#mgss-b');
      var kept = (parseInt(av && av.textContent, 10) || 0) + (parseInt(bv && bv.textContent, 10) || 0) > 0;
      var cta = card.querySelector('.mgs-cta');
      if (cta) cta.textContent = kept ? 'Save score' : 'Save winner';
      return;
    }

    // the steppers, so a score card is usable wherever it is opened
    var step = t.closest('[data-mgss-step]');
    if (step) {
      e.preventDefault();
      var side = step.getAttribute('data-mgss-step');
      var d = parseInt(step.getAttribute('data-mgss-d'), 10) || 0;
      var val = document.getElementById('mgss-' + side);
      if (!val) return;
      var n = Math.max(0, (parseInt(val.textContent, 10) || 0) + d);
      val.textContent = n;
      var c2 = step.closest('.mgs-card') || document;
      var cta2 = c2.querySelector('.mgs-cta');
      var a2 = c2.querySelector('#mgss-a'), b2 = c2.querySelector('#mgss-b');
      var any = (parseInt(a2 && a2.textContent, 10) || 0) + (parseInt(b2 && b2.textContent, 10) || 0) > 0;
      if (cta2 && c2.querySelector('.mgs-row.is-won')) cta2.textContent = any ? 'Save score' : 'Save winner';
    }
  });
})();


/* Round 2026-08-24 — "i want the lines that connect the games to be even and in
   the middle", then "the game cards are moving, they shouldnt" and "when the
   brackets first show up no lines are showing".

   All three were the same mistake: measuring rendered boxes. The cards animate
   in with a stagger and carry a 90ms transform transition, so every rect read is
   mid-flight — which made the first drawing wrong, forced a wait for the motion
   to end (no lines on arrival), and then visibly nudged the cards when the
   correction landed. This measures LAYOUT instead (offsetTop/offsetHeight,
   which animation cannot touch) and offsets with 'top' rather than a transform,
   so the geometry is right on the first frame, nothing waits, and nothing moves
   twice. A game sits on the exact midpoint of the games feeding it, and the
   connector is drawn the way a bracket is drawn: a stub off each feeder, ONE
   shared riser, one line into the middle of the next game. */
(function () {
  function feederRange(srcLen, dstLen, dstIndex) {
    var per = Math.max(1, Math.ceil(srcLen / dstLen));
    return { from: dstIndex * per, to: Math.min(srcLen, dstIndex * per + per) };
  }

  // layout position relative to the canvas, walking the offsetParent chain
  function offsetIn(node, canvas) {
    var x = 0, y = 0, el = node;
    while (el && el !== canvas) {
      x += el.offsetLeft;
      y += el.offsetTop;
      el = el.offsetParent;
    }
    return { x: x, y: y };
  }

  function model(canvas) {
    var cols = [].map.call(canvas.querySelectorAll('.bt-col'), function (col) {
      return [].map.call(col.querySelectorAll('.bt-node'), function (n) {
        n.style.top = '';
        return { node: n, cy: 0, cy0: 0, x1: 0, x2: 0 };
      });
    });
    for (var i = 0; i < cols.length; i++) {
      for (var j = 0; j < cols[i].length; j++) {
        var it = cols[i][j];
        var o = offsetIn(it.node, canvas);
        it.cy = it.cy0 = o.y + it.node.offsetHeight / 2;
        it.x2 = o.x;
        it.x1 = o.x + it.node.offsetWidth;
      }
    }
    for (var c = 1; c < cols.length; c++) {
      for (var k = 0; k < cols[c].length; k++) {
        var rg = feederRange(cols[c - 1].length, cols[c].length, k);
        if (rg.to <= rg.from) continue;
        var sum = 0, count = 0;
        for (var f = rg.from; f < rg.to; f++) { sum += cols[c - 1][f].cy; count++; }
        cols[c][k].cy = sum / count;
      }
    }
    return { cols: cols, w: canvas.offsetWidth, h: canvas.offsetHeight };
  }

  // 'top' on an already-relative node: instant, never animated, and it leaves
  // the hover lift (a transform) alone
  function apply(m) {
    for (var i = 0; i < m.cols.length; i++) {
      for (var j = 0; j < m.cols[i].length; j++) {
        var it = m.cols[i][j];
        var dy = Math.round(it.cy - it.cy0);
        it.node.style.top = dy ? dy + 'px' : '';
      }
    }
  }

  function paint(canvas, m) {
    var svg = canvas.querySelector('.bt-links');
    if (!svg) {
      svg = canvas.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'bt-links');
      canvas.insertBefore(svg, canvas.firstChild);
    }
    svg.setAttribute('width', m.w);
    svg.setAttribute('height', m.h);
    svg.setAttribute('viewBox', '0 0 ' + m.w + ' ' + m.h);

    var d = '';
    for (var i = 0; i < m.cols.length - 1; i++) {
      var src = m.cols[i], dst = m.cols[i + 1];
      if (!src.length || !dst.length) continue;
      for (var j = 0; j < dst.length; j++) {
        var rg = feederRange(src.length, dst.length, j);
        if (rg.to <= rg.from) continue;
        var x2 = Math.round(dst[j].x2), y2 = Math.round(dst[j].cy);
        var x1 = 0, lo = Infinity, hi = -Infinity;
        for (var k = rg.from; k < rg.to; k++) {
          x1 = Math.max(x1, Math.round(src[k].x1));
          lo = Math.min(lo, Math.round(src[k].cy));
          hi = Math.max(hi, Math.round(src[k].cy));
        }
        var mx = Math.round(x1 + (x2 - x1) / 2);
        for (var q = rg.from; q < rg.to; q++) d += 'M' + Math.round(src[q].x1) + ' ' + Math.round(src[q].cy) + 'H' + mx + ' ';
        if (hi - lo > 1) d += 'M' + mx + ' ' + lo + 'V' + hi + ' ';
        d += 'M' + mx + ' ' + y2 + 'H' + x2 + ' ';
      }
    }
    svg.innerHTML = d ? '<path d="' + d + '"/>' : '';
  }

  // a fingerprint of the layout, so a redraw on a bracket that has not changed
  // costs nothing and moves nothing
  function keyOf(canvas) {
    var nodes = canvas.querySelectorAll('.bt-node');
    var k = canvas.offsetWidth + 'x' + canvas.offsetHeight + '|' + nodes.length;
    for (var i = 0; i < nodes.length; i++) k += '|' + nodes[i].offsetHeight + ',' + nodes[i].offsetLeft;
    return k;
  }

  function draw(scope) {
    var root = scope && scope.querySelectorAll ? scope : document;
    var pans = root.querySelectorAll('.bk-pv-pan, .bt-pan');
    for (var p = 0; p < pans.length; p++) {
      if (!pans[p].offsetWidth) continue;
      var canvas = pans[p].querySelector('.bt-canvas');
      if (!canvas) continue;
      var key = keyOf(canvas);
      if (canvas.__btKey === key && canvas.querySelector('.bt-links path')) continue;
      var m = model(canvas);
      apply(m);
      paint(canvas, m);
      canvas.__btKey = keyOf(canvas);
    }
  }

  window.__btLinks = draw;
  function kick() { draw(document); }
  // fonts landing or a pane opening changes the layout, so the drawing follows
  // the canvas rather than being run once on load
  var watched = [];
  function watch() {
    if (typeof ResizeObserver !== 'function') return;
    var panes = document.querySelectorAll('.bk-pv-pan, .bt-pan');
    for (var i = 0; i < panes.length; i++) {
      var canvas = panes[i].querySelector('.bt-canvas');
      if (!canvas || watched.indexOf(canvas) !== -1) continue;
      watched.push(canvas);
      var ro = new ResizeObserver(function () { clearTimeout(watch.t); watch.t = setTimeout(kick, 60); });
      ro.observe(canvas);
      ro.observe(panes[i]);
    }
  }
  function boot() { kick(); watch(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  if (document.fonts && document.fonts.ready && document.fonts.ready.then) document.fonts.ready.then(boot);
  window.addEventListener('resize', function () { clearTimeout(boot.t); boot.t = setTimeout(boot, 90); });
  window.addEventListener('load', boot);
})();
