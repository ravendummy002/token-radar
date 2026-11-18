// Token Launch Radar — the board, its filters and the detail view.
//
// Data comes from ../data.js (window.RADAR), written by main.ts from the same
// board as board.json. State also lives in the URL hash, so a filtered view or a
// protocol's detail can be linked: #p=<slug> opens a protocol, #cat=, #chain=,
// #status=, #sort= and #q= set the filters.

(function () {
  'use strict';
  var R = window.RADAR;
  if (!R) { document.getElementById('rows').innerHTML = '<tr><td colspan="6">No radar data loaded.</td></tr>'; return; }

  var $ = function (id) { return document.getElementById(id); };
  var rowsEl = $('rows'), detailEl = $('detail'), countEl = $('count');
  var state = { q: '', cat: '', chain: '', status: '', sort: 'value', selected: null };

  // ---------- formatting ----------
  function money(n) {
    if (n === null || n === undefined) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n) {
    if (n === null || n === undefined) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function ageText(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days < 30) return days + 'd';
    if (days < 365) return (days / 30.44).toFixed(0) + 'mo';
    return (days / 365.25).toFixed(1) + 'y';
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---------- header ----------
  var total = R.rows.reduce(function (a, r) { return a + r.implied_value_usd; }, 0);
  $('stats').innerHTML =
    '<div><dt>Ranked</dt><dd>' + R.rows.length + '</dd></div>' +
    '<div><dt>Watchlist</dt><dd>' + R.watchlist_size + '</dd></div>' +
    '<div><dt>Pre-token in snapshot</dt><dd>' + R.pre_token_size + '</dd></div>' +
    '<div><dt>Total implied value</dt><dd>' + money(total) + '</dd></div>';
  $('model-text').innerHTML = '<code>' + esc(R.model) + '</code>';
  $('asof').textContent = R.as_of;
  $('foot-note').textContent = R.snapshot_size + ' protocols in the snapshot at or above $5M TVL; ' +
    R.set_aside_size + ' record a token already trading and are listed separately, never ranked as launches.';

  // ---------- filter options ----------
  var cats = {}, chains = {};
  R.rows.forEach(function (r) {
    if (r.category) cats[r.category] = 1;
    r.chains.forEach(function (c) { chains[c] = 1; });
  });
  Object.keys(cats).sort().forEach(function (c) {
    var o = document.createElement('option'); o.value = c; o.textContent = c; $('cat').appendChild(o);
  });
  Object.keys(chains).sort().forEach(function (c) {
    var o = document.createElement('option'); o.value = c; o.textContent = c; $('chain').appendChild(o);
  });

  // ---------- filtering & sorting ----------
  function visibleRows() {
    var list = R.rows;
    if (state.status === 'live') return R.live.slice();
    if (state.status === 'watchlist') list = list.filter(function (r) { return r.watchlist; });
    if (state.status === 'early') list = list.filter(function (r) { return !r.watchlist; });
    if (state.status === 'flagged') list = list.filter(function (r) { return r.name_flag; });
    if (state.cat) list = list.filter(function (r) { return r.category === state.cat; });
    if (state.chain) list = list.filter(function (r) { return r.chains.indexOf(state.chain) >= 0; });
    if (state.q) {
      var q = state.q.toLowerCase();
      list = list.filter(function (r) { return r.name.toLowerCase().indexOf(q) >= 0 || r.slug.indexOf(q) >= 0; });
    }
    return list.slice();
  }
  var sorters = {
    value: function (a, b) { return (b.implied_value_usd || 0) - (a.implied_value_usd || 0); },
    tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
    growth: function (a, b) { return (b.change_7d === null ? -Infinity : b.change_7d) - (a.change_7d === null ? -Infinity : a.change_7d); },
    age: function (a, b) { return (b.age_days === null ? -1 : b.age_days) - (a.age_days === null ? -1 : a.age_days); },
    name: function (a, b) { return a.name.localeCompare(b.name); },
    rank: function (a, b) { return (a.rank || 0) - (b.rank || 0); }
  };
  function sorted(list) {
    var fn = sorters[state.sort] || sorters.value;
    return list.sort(function (a, b) { return fn(a, b) || (a.slug < b.slug ? -1 : 1); });
  }

  // ---------- board ----------
  function renderBoard() {
    var list = sorted(visibleRows());
    var live = state.status === 'live';
    document.querySelectorAll('#board th').forEach(function (th) {
      th.classList.toggle('sorted', th.getAttribute('data-sort') === state.sort ||
        (state.sort === 'value' && th.getAttribute('data-sort') === 'value'));
    });
    if (list.length === 0) {
      rowsEl.innerHTML = '<tr><td colspan="6">No protocols match these filters.</td></tr>';
    } else {
      rowsEl.innerHTML = list.map(function (r) {
        var chg = r.change_7d;
        var cls = chg === null ? '' : (chg >= 0 ? 'up' : 'down');
        var badge = live ? '<span class="badge live">Trading</span>'
          : r.watchlist ? '<span class="badge watch">Watchlist</span>'
          : r.name_flag ? '<span class="badge flag">Name-flagged</span>' : '';
        var val = live ? money(r.mcap_usd) : money(r.implied_value_usd);
        var rankCell = live ? '—' : '#' + r.rank;
        return '<tr data-slug="' + esc(r.slug) + '" tabindex="0"' + (state.selected === r.slug ? ' class="selected"' : '') + '>' +
          '<td class="num">' + rankCell + '</td>' +
          '<td><strong>' + esc(r.name) + '</strong>' + badge + '<span class="cat">' + esc(r.category || 'Uncategorized') + ' · ' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</span></td>' +
          '<td class="num">' + money(r.tvl_usd) + '</td>' +
          '<td class="num ' + cls + '">' + pct(chg) + '</td>' +
          '<td class="num">' + (live ? '—' : ageText(r.age_days)) + '</td>' +
          '<td class="num"><strong>' + val + '</strong></td></tr>';
      }).join('');
    }
    countEl.textContent = list.length + (live ? ' protocols whose token already trades' : ' of ' + R.rows.length + ' ranked protocols');
    rowsEl.querySelectorAll('tr[data-slug]').forEach(function (tr) {
      tr.addEventListener('click', function () { select(tr.getAttribute('data-slug')); });
      tr.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(tr.getAttribute('data-slug')); }
      });
    });
  }

  // ---------- detail ----------
  function findRow(slug) {
    for (var i = 0; i < R.rows.length; i++) if (R.rows[i].slug === slug) return R.rows[i];
    for (var j = 0; j < R.live.length; j++) if (R.live[j].slug === slug) return R.live[j];
    return null;
  }
  function renderDetail() {
    var r = state.selected ? findRow(state.selected) : null;
    if (!r) { detailEl.innerHTML = '<h3>Pick a protocol</h3><p class="note">Click any row on the board to see its detail, its implied value and its farm plan.</p>'; return; }
    var isLive = r.implied_value_usd === undefined;
    var html = '<h3>' + esc(r.name) + '</h3><p class="slug">' + esc(r.slug) + '</p>';
    if (isLive) {
      html += '<p class="value-big">' + money(r.mcap_usd) + ' <span style="font-size:13px;color:var(--muted)">market cap</span></p>' +
        '<p class="note">This protocol\'s token already trades' + (r.symbol ? ' as ' + esc(r.symbol) : '') +
        ', so it is not a launch candidate and carries no implied value and no farm plan. It is listed here so the board\'s separation is visible.</p>';
    } else {
      html += '<p class="value-big">' + money(r.implied_value_usd) + ' <span style="font-size:13px;color:var(--muted)">implied value</span></p>' +
        '<p class="note">Rank #' + r.rank + ' of ' + R.rows.length + (r.watchlist ? ' · on the watchlist' : ' · early, below the $50M floor') +
        (r.name_flag ? ' · name-flagged: ' + esc(r.name_flag) : '') + ' · records no token.</p>' +
        '<div class="formula">TVL ' + money(r.tvl_usd) + ' × 0.30 = ' + money(r.value.base_usd) +
        ' base<br>× growth ' + r.value.growth_factor.toFixed(2) + ' (7d ' + pct(r.change_7d) + ')' +
        '<br>× age ' + r.value.age_factor.toFixed(2) + ' (' + ageText(r.age_days) + ' listed)' +
        '<br>× breadth ' + r.value.breadth_factor.toFixed(2) + ' (' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + ')' +
        '<br>= <strong>' + money(r.implied_value_usd) + '</strong></div>';
    }
    html += '<dl class="meta">' +
      '<div><dt>TVL</dt><dd>' + money(r.tvl_usd) + '</dd></div>' +
      '<div><dt>7-day change</dt><dd>' + pct(r.change_7d) + '</dd></div>' +
      '<div><dt>Category</dt><dd>' + esc(r.category || 'Uncategorized') + '</dd></div>' +
      '<div><dt>' + (isLive ? 'Token' : 'Age with no token') + '</dt><dd>' + (isLive ? esc(r.symbol || '—') : ageText(r.age_days)) + '</dd></div>' +
      '<div><dt>Chains</dt><dd>' + esc(r.chains.join(', ')) + '</dd></div>' +
      '<div><dt>Listed</dt><dd>' + esc(r.listed_at || 'unknown') + '</dd></div>' +
      '</dl>';
    if (!isLive) {
      html += '<h2>How to farm it</h2><ol class="steps">' +
        r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
        '<p class="note">A token is never promised: farm with money you can afford to lose, and check the protocol\'s own pages before you deposit.</p>';
    }
    detailEl.innerHTML = html;
  }

  // ---------- state & hash ----------
  function readHash() {
    var h = window.location.hash.replace(/^#/, '');
    var params = new URLSearchParams(h);
    state.q = params.get('q') || '';
    state.cat = params.get('cat') || '';
    state.chain = params.get('chain') || '';
    state.status = params.get('status') || '';
    state.sort = params.get('sort') || 'value';
    state.selected = params.get('p') || (R.rows[0] ? R.rows[0].slug : null);
    $('q').value = state.q;
    $('cat').value = state.cat;
    $('chain').value = state.chain;
    $('status').value = state.status;
    $('sort').value = state.sort;
  }
  function writeHash() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.cat) p.set('cat', state.cat);
    if (state.chain) p.set('chain', state.chain);
    if (state.status) p.set('status', state.status);
    if (state.sort !== 'value') p.set('sort', state.sort);
    if (state.selected) p.set('p', state.selected);
    var next = p.toString();
    if (window.location.hash.replace(/^#/, '') !== next) {
      history.replaceState(null, '', next ? '#' + next : window.location.pathname);
    }
  }
  function refresh() { renderBoard(); renderDetail(); writeHash(); }
  function select(slug) { state.selected = slug; refresh(); detailEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }

  $('q').addEventListener('input', function () { state.q = $('q').value; refresh(); });
  $('cat').addEventListener('change', function () { state.cat = $('cat').value; refresh(); });
  $('chain').addEventListener('change', function () { state.chain = $('chain').value; refresh(); });
  $('status').addEventListener('change', function () { state.status = $('status').value; refresh(); });
  $('sort').addEventListener('change', function () { state.sort = $('sort').value; refresh(); });
  document.querySelectorAll('#board th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () {
      state.sort = th.getAttribute('data-sort') === 'rank' ? 'value' : th.getAttribute('data-sort');
      $('sort').value = state.sort;
      refresh();
    });
  });
  window.addEventListener('hashchange', function () { readHash(); refresh(); });

  readHash();
  refresh();
})();
