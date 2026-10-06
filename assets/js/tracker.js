/* Past Sales tracker: a picture of the USA with a small plane on each aircraft's general area,
   plus one row per plane. Data comes from the fleet-tracker Worker. */
(function () {
  var API = 'https://fleet-tracker.ontheriseventures.workers.dev';
  var REFRESH_MS = 60000;
  // Projection used to draw assets/images/usa-map.svg (Albers equal-area, lower 48).
  var P = { lon0: -96, lat0: 37.5, p1: 29.5, p2: 45.5, scale: 1296.3401, tx: 490.17, ty: 329.212, w: 960, h: 604.47 };

  var mapEl = document.getElementById('tracker-map');
  var rowsEl = document.getElementById('tracker-rows');
  var statusEl = document.getElementById('tracker-status');
  if (!mapEl || !rowsEl) return;

  var pinsEl = document.createElement('div');
  pinsEl.className = 'trk-pins';
  mapEl.appendChild(pinsEl);
  var tipEl = document.createElement('div');
  tipEl.className = 'trk-tip';
  mapEl.appendChild(tipEl);

  var rad = Math.PI / 180;
  var N = (Math.sin(P.p1 * rad) + Math.sin(P.p2 * rad)) / 2;
  var C = Math.pow(Math.cos(P.p1 * rad), 2) + 2 * N * Math.sin(P.p1 * rad);
  var RHO0 = Math.sqrt(C - 2 * N * Math.sin(P.lat0 * rad)) / N;

  // lat/lon -> percent position on the picture
  function project(lat, lon) {
    var rho = Math.sqrt(C - 2 * N * Math.sin(lat * rad)) / N;
    var th = N * (lon - P.lon0) * rad;
    var x = P.tx + P.scale * rho * Math.sin(th);
    var y = P.ty - P.scale * (RHO0 - rho * Math.cos(th));
    return { left: Math.max(1, Math.min(99, x / P.w * 100)), top: Math.max(2, Math.min(98, y / P.h * 100)) };
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var STATUS = {
    flying: 'Flying now', landing: 'Just landed', parked: 'Parked', lost: 'Last seen airborne',
    unknown: 'No ADS-B contact yet', pending: 'Checking'
  };

  function when(ms) {
    return new Date(ms).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
      timeZone: 'America/New_York', timeZoneName: 'short'
    });
  }

  function ago(ms) {
    var s = Math.max(0, (Date.now() - ms) / 1000);
    if (s < 90) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' hr ago';
    var d = Math.round(s / 86400);
    return d < 60 ? d + ' days ago' : Math.round(d / 30) + ' months ago';
  }

  function airportText(ap) {
    return esc(ap.name) + ' (' + esc(ap.ident) + ')' +
      (ap.city ? ', ' + esc(ap.city) + (ap.state ? ' ' + esc(ap.state) : '') : '');
  }

  function place(a) {
    if (a.status === 'flying' && a.pos) return 'In the air';
    if (a.airport) return airportText(a.airport);
    if (a.near) return 'Near ' + airportText(a.near);
    if (a.pos) return a.pos.lat.toFixed(2) + ', ' + a.pos.lon.toFixed(2);
    return 'Unknown';
  }

  function end(ap) { return ap ? esc(ap.ident) : 'Unknown'; }

  function flight(a) {
    var f = a.lastFlight;
    if (!f) return 'No flight found yet';
    var dur = f.durationMin >= 60
      ? Math.floor(f.durationMin / 60) + 'h ' + (f.durationMin % 60) + 'm' : f.durationMin + ' min';
    return esc(when(f.end)) + '<br>' + end(f.depart) + ' &rarr; ' + end(f.arrive) + ' &middot; ' + dur;
  }

  // Year, make and model for planes we know; others come from the ADS-B registration data.
  var NAMES = {
    N31309: '1973 Beechcraft Baron 55', N5495T: '1972 Piper Arrow II', N6265F: '1975 Cessna 182P',
    N1552Z: '1989 Beechcraft Bonanza F33A', N9106U: '1976 Cessna 150M', N450JL: '1979 Piper Seneca II',
    N5223Q: '1971 Cessna 150L', N6917S: 'Cessna 150H'
  };

  function prettyDesc(d) {
    d = String(d || '').split('/')[0].trim();
    return d.replace(/\b[A-Z]{4,}\b/g, function (w) { return w.charAt(0) + w.slice(1).toLowerCase(); });
  }

  function typeText(a) {
    var name = NAMES[a.tail] || prettyDesc(a.desc) || a.type || '';
    if (a.year && !/^\d{4}\b/.test(name)) name = a.year + ' ' + name;
    return esc(name.trim());
  }

  function badges(a) {
    var out = '<span class="trk-badge ' + esc(a.status) + '">' + esc(STATUS[a.status] || a.status) + '</span>';
    if (a.src === 'watch' && a.expiresAt) {
      var h = Math.max(1, Math.round((a.expiresAt - Date.now()) / 3600000));
      out += '<span class="trk-badge trk-watch">24h watch &middot; ' + h + 'h left</span>';
    }
    return out;
  }

  function rank(a) {
    if (a.status === 'flying') return 0;
    if (a.status === 'landing') return 1;
    return a.pos ? 2 : 3;
  }

  var PLANE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/></svg>';

  function render(list) {
    list.sort(function (x, y) {
      return rank(x) - rank(y) || ((y.pos && y.pos.seenAt) || 0) - ((x.pos && x.pos.seenAt) || 0) || x.tail.localeCompare(y.tail);
    });

    rowsEl.innerHTML = list.map(function (a) {
      var seen = a.status === 'flying' ? 'live' : (a.pos && a.pos.seenAt ? ago(a.pos.seenAt) : '');
      return '<div class="trk-row" data-tail="' + esc(a.tail) + '">' +
        '<div class="trk-tail">' + esc(a.tail) + badges(a) + '</div>' +
        '<div><span class="trk-label">Aircraft</span><span class="trk-val trk-model">' + (typeText(a) || 'Unknown') + '</span></div>' +
        '<div><span class="trk-label">Location</span><span class="trk-val">' + place(a) + '</span></div>' +
        '<div><span class="trk-label">Last flight</span><span class="trk-val">' + flight(a) + '</span></div>' +
        '<div class="trk-seen">' + esc(seen) + '</div></div>';
    }).join('');

    // Planes at the same airport would sit on top of each other: fan them out a little.
    var used = [];
    pinsEl.innerHTML = '';
    list.forEach(function (a) {
      if (!a.pos) return;
      var p = project(a.pos.lat, a.pos.lon);
      var n = used.filter(function (u) { return Math.abs(u.left - p.left) < 1.6 && Math.abs(u.top - p.top) < 2.4; }).length;
      used.push(p);
      var left = p.left + (n % 3) * 2.2 - (n ? 1.1 : 0), top = p.top + Math.floor(n / 3) * 3.2 + (n % 2 ? 1.2 : 0);
      var pin = document.createElement('button');
      pin.type = 'button';
      pin.className = 'trk-plane ' + esc(a.status) + (a.src === 'watch' ? ' watch' : '');
      pin.setAttribute('data-tail', a.tail);
      pin.setAttribute('aria-label', a.tail + ': ' + (STATUS[a.status] || a.status));
      pin.style.left = left + '%';
      pin.style.top = top + '%';
      pin.innerHTML = PLANE;
      if (a.status === 'flying' && typeof a.pos.track === 'number') pin.firstChild.style.transform = 'rotate(' + a.pos.track + 'deg)';
      pin._tip = '<strong>' + esc(a.tail) + '</strong> ' + typeText(a) + '<br>' + place(a) +
        '<br><small>' + esc(STATUS[a.status] || a.status) + (a.pos.seenAt && a.status !== 'flying' ? ' &middot; ' + esc(ago(a.pos.seenAt)) : '') + '</small>';
      pinsEl.appendChild(pin);
    });
  }

  function showTip(pin) {
    tipEl.innerHTML = pin._tip;
    tipEl.style.left = pin.style.left;
    tipEl.style.top = pin.style.top;
    tipEl.classList.toggle('flip', parseFloat(pin.style.left) > 60);
    tipEl.classList.add('show');
  }

  pinsEl.addEventListener('mouseover', function (e) { var p = e.target.closest('.trk-plane'); if (p) showTip(p); });
  pinsEl.addEventListener('focusin', function (e) { var p = e.target.closest('.trk-plane'); if (p) showTip(p); });
  pinsEl.addEventListener('mouseout', function () { tipEl.classList.remove('show'); });
  pinsEl.addEventListener('focusout', function () { tipEl.classList.remove('show'); });
  pinsEl.addEventListener('click', function (e) { var p = e.target.closest('.trk-plane'); if (p) showTip(p); });

  rowsEl.addEventListener('click', function (e) {
    var row = e.target.closest('.trk-row');
    if (!row) return;
    var pin = pinsEl.querySelector('.trk-plane[data-tail="' + row.getAttribute('data-tail') + '"]');
    if (!pin) return;
    mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showTip(pin);
    pin.classList.add('ping');
    setTimeout(function () { pin.classList.remove('ping'); }, 1600);
  });

  function refresh() {
    fetch(API + '/api/sold', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        render(data.aircraft || []);
        var n = (data.aircraft || []).length;
        statusEl.textContent = data.stale
          ? 'Live updates are catching up. Showing the most recent data.'
          : n + ' aircraft tracked. Updated ' + ago(data.updatedAt) + '.';
      })
      .catch(function () {
        statusEl.textContent = 'The tracker is temporarily unavailable. Please check back soon.';
      });
  }

  var form = document.getElementById('watch-form');
  var msg = document.getElementById('watch-msg');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      msg.textContent = 'Adding...';
      fetch(API + '/api/sold/watch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tail: form.tail.value })
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) { msg.textContent = res.j.error || 'Something went wrong.'; return; }
          msg.textContent = res.j.note || (res.j.tail + ' will be tracked for 24 hours.');
          form.tail.value = '';
          refresh();
        })
        .catch(function () { msg.textContent = 'Could not reach the tracker. Try again in a moment.'; });
    });
  }

  refresh();
  setInterval(refresh, REFRESH_MS);
})();
