// Infra Radar dashboard — renders window.RADAR_DATA (written by main.ts).
// No network: every number on this page comes from the snapshot via data.js.
(function () {
  'use strict';
  var D = window.RADAR_DATA;
  if (!D) { document.body.textContent = 'No radar data loaded.'; return; }

  var INFRA_LENS = {
    'Decentralized AI': 1, 'AI Agents': 1, Chain: 1, DOR: 1, Restaking: 1,
    'Risk Curators': 1, 'Onchain Capital Allocator': 1, 'Collateral Markets': 1
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(v) {
    if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(v);
  }
  function moneyFull(v) { return '$' + Math.round(v).toLocaleString('en-US'); }
  function pct(v) {
    if (v == null) return '<span class="flat">—</span>';
    var c = v > 0 ? 'up' : v < 0 ? 'down' : 'flat';
    return '<span class="' + c + '">' + (v > 0 ? '+' : '') + v.toFixed(1) + '%</span>';
  }
  function ageLabel(days) {
    if (days == null) return '—';
    if (days < 30) return days + 'd';
    if (days < 365) return (days / 30).toFixed(0) + 'mo';
    return (days / 365.25).toFixed(1) + 'y';
  }
  function chainsLabel(chains) {
    if (!chains || !chains.length) return '—';
    return chains.length <= 3 ? chains.join(', ') : chains.slice(0, 3).join(', ') + ' +' + (chains.length - 3);
  }

  // ---- header stats + model strip ----
  var top = D.rows[0];
  document.getElementById('stats').innerHTML =
    '<div class="stat"><b>' + D.rows.length + '</b><span>protocols ranked</span></div>' +
    '<div class="stat"><b>' + D.watchlistSize + '/' + D.watchlistSize + '</b><span>watchlist covered</span></div>' +
    '<div class="stat"><b>' + D.medianMultiple.toFixed(3) + 'x</b><span>anchor multiple</span></div>' +
    '<div class="stat"><b>' + money(top.implied_value_usd) + '</b><span>top implied value</span></div>';
  document.getElementById('model').innerHTML =
    '<code>implied value = TVL × M × D × G × A × C</code> &nbsp;—&nbsp; ' +
    '<b>M</b> = <span class="mval">' + D.medianMultiple.toFixed(3) + 'x</span> median mcap/TVL of ' +
    D.liveInfraSize + ' live infra tokens · <b>D</b> = infra-demand by category · ' +
    '<b>G</b> = 7-day TVL growth · <b>A</b> = maturity · <b>C</b> = chain breadth. ' +
    'Every factor is shown per protocol in its detail view.';

  // ---- category options ----
  var cats = {};
  D.rows.forEach(function (r) { cats[r.category || 'Uncategorized'] = 1; });
  var catSel = document.getElementById('cat');
  Object.keys(cats).sort().forEach(function (c) {
    var o = document.createElement('option');
    o.value = c; o.textContent = c;
    catSel.appendChild(o);
  });

  // ---- comparables ----
  document.getElementById('comps').innerHTML = D.comps.map(function (c) {
    return '<tr><td><span class="nm">' + esc(c.name) + '</span></td>' +
      '<td><span class="tagcat">' + esc(c.category) + '</span></td>' +
      '<td class="num">' + money(c.tvl_usd) + '</td>' +
      '<td class="num">' + money(c.mcap_usd) + '</td>' +
      '<td class="num">' + c.ratio.toFixed(3) + 'x</td></tr>';
  }).join('') +
  '<tr class="med"><td>Median mcap / TVL (the anchor M)</td><td></td><td class="num"></td><td class="num"></td>' +
  '<td class="num">' + D.medianMultiple.toFixed(3) + 'x</td></tr>';
  document.getElementById('src').textContent =
    'Snapshot as of ' + D.asOf + ' · watchlist floor $' + D.floorUsd.toLocaleString('en-US') +
    ' TVL · source: DefiLlama public protocols endpoint, as recorded in the snapshot.';

  // ---- board ----
  var state = { q: '', lens: 'all', cat: '', sort: 'implied', sel: null };

  function readHash() {
    var h = (location.hash || '').replace(/^#/, '');
    h.split('&').forEach(function (kv) {
      var p = kv.split('=');
      if (p.length !== 2) return;
      var k = decodeURIComponent(p[0]), v = decodeURIComponent(p[1]);
      if (k === 'lens' && ['all', 'infra', 'watchlist'].indexOf(v) >= 0) state.lens = v;
      if (k === 'cat') state.cat = v;
      if (k === 'sort' && ['implied', 'tvl', 'growth', 'age', 'chains'].indexOf(v) >= 0) state.sort = v;
      if (k === 'q') state.q = v;
      if (k === 'detail') state.sel = v;
    });
  }
  function writeHash() {
    var parts = [];
    if (state.lens !== 'all') parts.push('lens=' + state.lens);
    if (state.cat) parts.push('cat=' + encodeURIComponent(state.cat));
    if (state.sort !== 'implied') parts.push('sort=' + state.sort);
    if (state.q) parts.push('q=' + encodeURIComponent(state.q));
    if (state.sel) parts.push('detail=' + state.sel);
    history.replaceState(null, '', parts.length ? '#' + parts.join('&') : '#');
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var rows = D.rows.filter(function (r) {
      if (state.lens === 'infra' && !INFRA_LENS[r.category || '']) return false;
      if (state.lens === 'watchlist' && !r.watchlist) return false;
      if (state.cat && (r.category || 'Uncategorized') !== state.cat) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0) return false;
      return true;
    });
    var by = {
      implied: function (a, b) { return b.implied_value_usd - a.implied_value_usd; },
      tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
      growth: function (a, b) { return (b.change_7d || 0) - (a.change_7d || 0); },
      age: function (a, b) { return (b.age_days || 0) - (a.age_days || 0); },
      chains: function (a, b) { return b.chains.length - a.chains.length; }
    }[state.sort];
    return rows.sort(by);
  }

  function renderBoard() {
    var rows = filtered();
    document.getElementById('count').textContent = rows.length + ' of ' + D.rows.length + ' shown';
    document.getElementById('rows').innerHTML = rows.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '"' + (state.sel === r.slug ? ' class="sel"' : '') + '>' +
        '<td class="num">' + r.rank + '</td>' +
        '<td><span class="nm">' + esc(r.name) + '</span>' +
        (r.watchlist ? '<span class="badge">WATCHLIST</span>' : '') +
        '<div class="sub">' + esc(r.slug) + ' · tracked ' + ageLabel(r.age_days) + '</div></td>' +
        '<td><span class="tagcat">' + esc(r.category || '—') + '</span></td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + r.chains.length + '</td>' +
        '<td class="num imp">' + money(r.implied_value_usd) + '</td>' +
        '<td class="num">' + r.factors.demand.toFixed(2) + 'x</td></tr>';
    }).join('');
    document.querySelectorAll('#rows tr').forEach(function (tr) {
      tr.addEventListener('click', function () { select(tr.getAttribute('data-slug')); });
    });
  }

  function select(slug) {
    var r = null;
    D.rows.forEach(function (x) { if (x.slug === slug) r = x; });
    state.sel = slug;
    writeHash();
    renderBoard();
    renderDetail(r);
  }

  function factorRow(label, value, note) {
    return '<tr><td>' + label + '</td><td>' + note + '</td><td>' + value + '</td></tr>';
  }

  function renderDetail(r) {
    var el = document.getElementById('detail');
    if (!r) {
      el.innerHTML = '<p class="empty">Select a protocol on the board to see its value breakdown and 5-step farm plan.</p>';
      return;
    }
    var f = r.factors;
    el.innerHTML =
      '<h2>' + esc(r.name) + '</h2>' +
      '<p class="meta">' + esc(r.category || 'Uncategorized') + ' · ' + esc(chainsLabel(r.chains)) +
      ' · TVL ' + money(r.tvl_usd) + ' · 7d ' + (r.change_7d == null ? '—' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%') +
      ' · tracked ' + ageLabel(r.age_days) + (r.watchlist ? ' · <span class="badge">WATCHLIST</span>' : '') + '</p>' +
      '<div class="biglab">Implied launch value</div><div class="big">' + moneyFull(r.implied_value_usd) + '</div>' +
      '<table class="factors">' +
      factorRow('M — anchor multiple', f.multiple.toFixed(3) + 'x', 'median mcap/TVL, live infra') +
      factorRow('D — infra demand', f.demand.toFixed(2) + 'x', esc(r.category || 'baseline')) +
      factorRow('G — 7d growth', f.growth.toFixed(3) + 'x', r.change_7d == null ? 'not reported' : r.change_7d.toFixed(1) + '%') +
      factorRow('A — maturity', f.maturity.toFixed(3) + 'x', ageLabel(r.age_days) + ' tracked') +
      factorRow('C — chain breadth', f.chainBreadth.toFixed(2) + 'x', r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's')) +
      '</table>' +
      '<h2>Farm plan — 5 steps</h2><ol>' +
      r.farm_steps.map(function (s, i) {
        return '<li><b>Step ' + (i + 1) + '.</b> ' + esc(s) + '</li>';
      }).join('') + '</ol>' +
      '<p class="meta">This protocol records no token in the snapshot. That is DefiLlama’s record, not proof it has none — and no prediction it will issue one.</p>';
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ---- wire controls ----
  var qEl = document.getElementById('q');
  var lensEl = document.getElementById('lens');
  var sortEl = document.getElementById('sort');
  qEl.addEventListener('input', function () { state.q = qEl.value; writeHash(); renderBoard(); });
  lensEl.addEventListener('change', function () { state.lens = lensEl.value; writeHash(); renderBoard(); });
  catSel.addEventListener('change', function () { state.cat = catSel.value; writeHash(); renderBoard(); });
  sortEl.addEventListener('change', function () { state.sort = sortEl.value; writeHash(); renderBoard(); });
  window.addEventListener('hashchange', function () { readHash(); syncControls(); renderBoard(); renderDetail(findSel()); });
  function findSel() {
    var r = null;
    if (state.sel) D.rows.forEach(function (x) { if (x.slug === state.sel) r = x; });
    return r;
  }
  function syncControls() {
    qEl.value = state.q; lensEl.value = state.lens; catSel.value = state.cat; sortEl.value = state.sort;
  }

  readHash();
  syncControls();
  renderBoard();
  renderDetail(findSel());
})();
