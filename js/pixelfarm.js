/*
 * pixelfarm.js — the Pixel theme's background: an original little farm valley, drawn at low resolution
 * on a canvas and scaled up. Follows the real-world season (Mar/Jun/Sep/Dec) and the light/dark mode.
 *
 *   KanbanFarm.render(active, night) -> 'Spring' | 'Summer' | 'Fall' | 'Winter'
 *
 * The canvas is painted once per size/season/mode. Only clouds and drifting bits (petals, leaves, snow,
 * fireflies) move, and those are CSS transforms, so an idle board costs nothing on the main thread.
 */
(function () {
  'use strict';

  var PX = 4; // one art pixel on screen
  var SEASONS = ['Spring', 'Summer', 'Fall', 'Winter'];
  // sky bands top to bottom, far mountains, two hill layers, grass [base, light, dark], foliage [light, mid, dark], flowers
  var DAY = {
    Spring: { sky: ['#6fc4ee', '#86d0f0', '#a3def2', '#c6ecf0', '#e6f5e4'], far: '#8fb9cf', hill: ['#8fcf7a', '#74bd5f'], grass: ['#69b74a', '#86cf5d', '#4c9638'], leaf: ['#f7b6d2', '#e98bb6', '#c2628f'], pine: ['#5aa66a', '#3d8455', '#2b6345'], flowers: ['#ffffff', '#ffd1e6', '#ffe36e', '#c9a4ff'], crop: ['#8fd45c', '#ffe9f2'] },
    Summer: { sky: ['#2fa8ea', '#4cbaf0', '#74cdf3', '#a2e0f2', '#d3f1e6'], far: '#7aa9c9', hill: ['#67bd55', '#4fa945'], grass: ['#4da33a', '#6cc04a', '#377f2c'], leaf: ['#7fd058', '#55ab41', '#368232'], pine: ['#4c9a56', '#337a47', '#225a38'], flowers: ['#ffe14d', '#ff7f6b', '#ffffff', '#67b7ff'], crop: ['#57ab3c', '#ffd23f'] },
    Fall: { sky: ['#79b4d8', '#98c4d4', '#c3d4c4', '#ecd9a8', '#fbd58b'], far: '#a99ab0', hill: ['#d09a48', '#b98038'], grass: ['#b39a3f', '#cdb554', '#8d7630'], leaf: ['#f7a53c', '#e0742c', '#b04a26'], pine: ['#7f8f48', '#5f7340', '#455737'], flowers: ['#e0522f', '#ffd166', '#c24b8d', '#f3e3c0'], crop: ['#7d8f35', '#f08a24'] },
    Winter: { sky: ['#8db8dc', '#a5c8e4', '#bfd8ec', '#d8e7f2', '#eef4f6'], far: '#a7bdd3', hill: ['#e3edf4', '#d2e1ee'], grass: ['#eaf2f7', '#ffffff', '#c3d6e6'], leaf: ['#ffffff', '#dbe8f2', '#a9c1d6'], pine: ['#e8f2f8', '#6f9a94', '#4b7477'], flowers: ['#c3d6e6', '#b3cbe0', '#ffffff', '#c3d6e6'], crop: ['#c3d6e6', '#ffffff'] }
  };
  var NIGHT_SKY = ['#0d1433', '#141d47', '#1d2a5c', '#2b3a70', '#43507f'];

  var host = null, canvas = null, key = '', timer = 0, active = false, night = false;

  function season() { return SEASONS[Math.floor(((new Date().getMonth() + 10) % 12) / 3)]; }

  function rng(seed) {
    var s = seed >>> 0;
    return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }
  function hex(c) { var n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function mix(a, b, t) {
    var x = hex(a), y = hex(b);
    return '#' + [0, 1, 2].map(function (i) { return ('0' + Math.round(x[i] + (y[i] - x[i]) * t).toString(16)).slice(-2); }).join('');
  }

  function paint() {
    var W = Math.max(80, Math.ceil(window.innerWidth / PX)), H = Math.max(60, Math.ceil(window.innerHeight / PX));
    var name = season(), P = DAY[name], R = rng(7301 + SEASONS.indexOf(name) * 97);
    canvas.width = W; canvas.height = H;
    canvas.style.width = W * PX + 'px'; canvas.style.height = H * PX + 'px';
    var g = canvas.getContext('2d');
    function tint(c, amount) { return night ? mix(c, '#101a3f', amount == null ? 0.6 : amount) : c; }
    function box(x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
    function wave(x, a) { return Math.sin(x * a[0] + a[1]) * a[2] + Math.sin(x * a[3] + a[4]) * a[5]; }

    var horizon = Math.round(H * 0.56);
    // sky: flat bands with a dithered seam
    var sky = night ? NIGHT_SKY : P.sky, band = Math.ceil((horizon + 6) / sky.length);
    sky.forEach(function (c, i) {
      box(0, i * band, W, band, c);
      if (!i) return;
      g.fillStyle = c;
      for (var x = 0; x < W; x++) {
        if (x % 2 === 0) g.fillRect(x, i * band - 1, 1, 1);
        if (x % 4 === 1) g.fillRect(x, i * band - 2, 1, 1);
        if (x % 8 === 3) g.fillRect(x, i * band - 4, 1, 1);
      }
    });
    if (night) {
      for (var s = 0; s < W * 0.45; s++) {
        var sx = (R() * W) | 0, sy = (R() * horizon * 0.8) | 0;
        box(sx, sy, 1, 1, R() < 0.2 ? '#fff6c9' : R() < 0.5 ? '#b9c6ff' : '#7f8fd0');
        if (R() < 0.05) { box(sx - 1, sy, 3, 1, '#dfe6ff'); box(sx, sy - 1, 1, 3, '#dfe6ff'); }
      }
    }
    // sun or moon, upper right
    var ox = Math.round(W * 0.83), oy = Math.round(H * 0.2), rad = 9;
    function disc(cx, cy, r, c) { for (var y = -r; y <= r; y++) { var w = Math.floor(Math.sqrt(r * r + r * 0.6 - y * y)); if (w >= 0) box(cx - w, cy + y, w * 2 + 1, 1, c); } }
    disc(ox, oy, rad + 2, night ? '#2b3a78' : mix(P.sky[1], '#fff3b8', 0.5));
    disc(ox, oy, rad, night ? '#f4efd0' : '#fff1a6');
    if (night) { box(ox - 4, oy - 3, 3, 2, '#d9d2ac'); box(ox + 2, oy + 2, 4, 2, '#d9d2ac'); box(ox - 2, oy + 4, 2, 1, '#d9d2ac'); } else disc(ox - 1, oy - 1, rad - 3, '#fffbe0');

    // far mountains
    for (var x1 = 0; x1 < W; x1++) {
      var mh = 15 + wave(x1, [0.045, 1.2, 8, 0.11, 0.4, 4]) + Math.abs(((x1 * 0.9) % 26) - 13) * 0.45;
      box(x1, horizon - mh, 1, mh + 8, tint(P.far));
      if (mh > 22) box(x1, horizon - mh, 1, 2 + (x1 % 3 ? 1 : 0), tint(mix(P.far, '#ffffff', 0.65)));
    }
    // two hill layers with a lit rim
    [[9, 0.032, 2.1, 5], [3, 0.05, 0.3, 4]].forEach(function (l, i) {
      for (var x2 = 0; x2 < W; x2++) {
        var hh = l[0] + wave(x2, [l[1], l[2], l[3], l[1] * 2.7, 1, 2]);
        box(x2, horizon - hh, 1, hh + 14, tint(P.hill[i]));
        box(x2, horizon - hh, 1, 1, tint(mix(P.hill[i], '#ffffff', 0.35)));
      }
    });
    // ground
    var ground = horizon + 3;
    box(0, ground, W, H - ground, tint(P.grass[0]));
    for (var k = 0; k < W * 1.6; k++) {
      var gx = (R() * W) | 0, gy = ground + 2 + ((R() * (H - ground - 2)) | 0);
      if (R() < 0.5) { box(gx, gy, 1, 2, tint(P.grass[2])); box(gx + 2, gy, 1, 2, tint(P.grass[2])); box(gx + 1, gy + 1, 1, 1, tint(P.grass[2])); } else box(gx, gy, 2, 1, tint(P.grass[1]));
    }

    function pine(x, y, h) {
      box(x - 1, y - 3, 2, 3, tint('#6b4226'));
      for (var r = 0; r < h; r++) {
        var w = 1 + Math.floor((r % 5) * 0.9) + Math.floor(r / 3);
        var yy = y - 3 - h + r;
        box(x - w, yy, w * 2, 1, tint(P.pine[1]));
        box(x - w, yy, Math.max(1, w - 1), 1, tint(P.pine[0]));
        if (r % 5 === 4) box(x - w, yy, w * 2, 1, tint(P.pine[2]));
      }
    }
    function tree(x, y, r) {
      var top = y - Math.round(r * 1.9);
      box(x - 8, y, 16, 1, tint(P.grass[2])); box(x - 5, y + 1, 10, 1, tint(P.grass[2]));
      box(x - 2, top, 4, y - top, tint('#7a4a28')); box(x + 1, top, 1, y - top, tint('#57321b')); box(x - 3, y - 1, 6, 1, tint('#57321b'));
      // a lumpy canopy: dark underside, mid body, lit crown, then leaf flecks
      [[0, 1, r, 2], [-r * 0.6, 3, r * 0.62, 2], [r * 0.6, 3, r * 0.62, 2], [0, -1, r - 1, 1], [-r * 0.55, 1, r * 0.55, 1], [r * 0.5, 1, r * 0.5, 1], [-2, -r * 0.45, r * 0.5, 0], [-r * 0.6, 0, r * 0.28, 0]].forEach(function (d) {
        disc(Math.round(x + d[0]), Math.round(top + d[1]), Math.max(1, Math.round(d[2])), tint(P.leaf[d[3]]));
      });
      for (var q = 0; q < r * 3; q++) {
        var an = R() * 6.283, ra = Math.sqrt(R()) * r * 0.85, up = R() < 0.5;
        box(x + Math.cos(an) * ra, top + Math.sin(an) * ra, 2, 1, tint(P.leaf[up ? (Math.sin(an) < 0 ? 0 : 1) : 2]));
      }
    }    // treeline along the horizon
    for (var t = 4; t < W; t += 6 + ((R() * 9) | 0)) pine(t, ground + 2 + ((R() * 3) | 0), 9 + ((R() * 7) | 0));

    // winding path
    for (var py = ground + 3; py < H; py++) {
      var f = (py - ground) / (H - ground), pxm = W * 0.36 + Math.sin(f * 4.2) * W * 0.05 - f * W * 0.06, pw = 4 + f * 9;
      box(pxm - pw / 2, py, pw, 1, tint('#d9b778'));
      box(pxm - pw / 2, py, 1, 1, tint('#b08b50')); box(pxm + pw / 2 - 1, py, 1, 1, tint('#b08b50'));
      if (py % 5 === 0) box(pxm - pw / 3 + R() * pw * 0.6, py, 2, 1, tint('#c19f63'));
    }
    // pond
    var bx = Math.round(W * 0.16), by = ground + Math.round((H - ground) * 0.34), bw = 20, bh = 6;
    for (var e = -bh; e <= bh; e++) {
      var ew = Math.round(bw * Math.sqrt(1 - (e * e) / (bh * bh + 4)));
      box(bx - ew - 1, by + e, ew * 2 + 2, 1, tint('#8a6b42'));
      box(bx - ew, by + e, ew * 2, 1, name === 'Winter' ? tint('#cfe6f5') : tint('#4aa3d8', 0.5));
      if (e % 3 === 0) box(bx - ew * 0.4 + e, by + e, 6, 1, name === 'Winter' ? tint('#ffffff') : tint('#9adcf5', 0.4));
    }
    // cottage
    var hx = Math.round(W * 0.31), hy = ground + 9;
    box(hx, hy - 12, 24, 12, tint('#c98d52')); for (var wl = 0; wl < 12; wl += 3) box(hx, hy - 12 + wl, 24, 1, tint('#a96f3c'));
    box(hx - 1, hy - 12, 1, 12, tint('#6b3f20')); box(hx + 24, hy - 12, 1, 12, tint('#6b3f20')); box(hx - 1, hy, 26, 1, tint('#8f8a84'));
    for (var rr = 0; rr < 9; rr++) { box(hx - 4 + rr, hy - 12 - rr, 32 - rr * 2, 1, tint(name === 'Winter' && rr > 4 ? '#f4f9fc' : rr % 3 ? '#b8493a' : '#93352c')); }
    box(hx + 18, hy - 23, 4, 8, tint('#9c948b')); box(hx + 17, hy - 24, 6, 1, tint('#6f6861'));
    box(hx + 10, hy - 8, 5, 8, tint('#6b3f20')); box(hx + 11, hy - 7, 3, 7, tint('#8c5429')); box(hx + 13, hy - 4, 1, 1, '#ffd76a');
    [3, 18].forEach(function (wx) { box(hx + wx - 1, hy - 9, 5, 5, tint('#6b3f20')); box(hx + wx, hy - 8, 3, 3, night ? '#ffd76a' : '#bfe6f2'); box(hx + wx + 1, hy - 8, 1, 3, tint('#6b3f20')); });
    if (night) { g.globalAlpha = 0.12; disc(hx + 4, hy - 7, 4, '#ffd76a'); disc(hx + 19, hy - 7, 4, '#ffd76a'); g.globalAlpha = 1; }
    for (var sm = 0; sm < 4; sm++) { g.globalAlpha = 0.5 - sm * 0.1; disc(hx + 20 + sm * 2, hy - 28 - sm * 4, 1 + (sm > 1 ? 1 : 0), tint('#f2f2f2', 0.4)); } g.globalAlpha = 1;

    // barn + silo on the right
    var ax = Math.round(W * 0.72), ay = ground + 8;
    box(ax + 30, ay - 22, 9, 22, tint('#b9c0c6')); box(ax + 30, ay - 22, 2, 22, tint('#dfe5e8')); box(ax + 37, ay - 22, 2, 22, tint('#8e969d')); disc(ax + 34, ay - 22, 4, tint('#8a3a34'));
    box(ax, ay - 14, 28, 14, tint('#b5402f')); for (var bl = 2; bl < 28; bl += 4) box(ax + bl, ay - 14, 1, 14, tint('#8f2e25'));
    for (var br = 0; br < 9; br++) { var iw = br < 4 ? br * 0.8 : br * 2 - 4; box(ax - 2 + iw, ay - 15 - br, 32 - iw * 2, 1, tint(name === 'Winter' && br > 4 ? '#f4f9fc' : '#6b3a2c')); }
    box(ax + 9, ay - 10, 10, 10, tint('#f2e3c4')); box(ax + 10, ay - 9, 8, 9, tint('#8f2e25'));
    for (var xd = 0; xd < 8; xd++) { box(ax + 10 + xd, ay - 9 + xd, 1, 1, tint('#f2e3c4')); box(ax + 17 - xd, ay - 9 + xd, 1, 1, tint('#f2e3c4')); }
    box(ax + 12, ay - 19, 4, 3, night ? '#ffd76a' : tint('#f2e3c4'));

    // tilled rows with the season's crop
    var cx = Math.round(W * 0.47), cy = ground + Math.round((H - ground) * 0.3), cols = Math.max(6, Math.floor(W * 0.22 / 7)), rows = Math.max(3, Math.floor((H - cy - 16) / 8));
    box(cx - 2, cy - 2, cols * 7 + 3, rows * 8 + 2, tint('#6b4424'));
    for (var ry = 0; ry < rows; ry++) for (var rx = 0; rx < cols; rx++) {
      var tx = cx + rx * 7, ty = cy + ry * 8;
      box(tx, ty, 6, 6, tint('#8a5a30')); box(tx, ty + 2, 6, 1, tint('#7a4d28')); box(tx, ty + 4, 6, 1, tint('#7a4d28'));
      if (name === 'Winter') { box(tx, ty, 6, 2, tint('#eaf2f7')); continue; }
      if (R() < 0.12) continue;
      box(tx + 2, ty + 1, 2, 4, tint(mix(P.crop[0], '#1f3d14', 0.35))); box(tx + 1, ty, 1, 2, tint(P.crop[0])); box(tx + 4, ty, 1, 2, tint(P.crop[0])); box(tx + 2, ty - 1, 2, 2, tint(P.crop[0]));
      if (R() < 0.7) { box(tx + 2, ty + 2, 3, 3, tint(P.crop[1])); box(tx + 2, ty + 2, 1, 1, tint(mix(P.crop[1], '#ffffff', 0.5))); }
    }
    // fence round the field
    function post(x, y) { box(x, y - 5, 2, 6, tint('#9c6a3a')); box(x, y - 5, 1, 6, tint('#c08a50')); }
    function rail(x, y, w) { box(x, y - 4, w, 1, tint('#b57f47')); box(x, y - 2, w, 1, tint('#8a5c31')); }
    var fx0 = cx - 8, fx1 = cx + cols * 7 + 6, fyB = cy - 6;
    rail(fx0, fyB, fx1 - fx0); for (var fp = fx0; fp <= fx1; fp += 8) post(fp, fyB);
    for (var fy = fyB; fy < H; fy += 8) { post(fx0, fy); post(fx1, fy); }

    // a few big trees and the flowers in the foreground
    [[0.05, 0.3, 8], [0.25, 0.75, 9], [0.93, 0.34, 9], [0.86, 0.82, 10], [0.03, 0.9, 10]].forEach(function (q) { tree(Math.round(W * q[0]), ground + Math.round((H - ground) * q[1]) + 6, q[2]); });
    for (var fl = 0; fl < W * 0.4; fl++) {
      var lx = (R() * W) | 0, ly = ground + 8 + ((R() * (H - ground - 10)) | 0);
      if (lx > fx0 - 3 && lx < fx1 + 3 && ly > fyB - 6) continue;
      box(lx, ly + 1, 1, 2, tint(P.grass[2])); box(lx - 1, ly, 3, 1, tint(P.flowers[(R() * 4) | 0])); box(lx, ly - 1, 1, 3, tint(P.flowers[(R() * 4) | 0])); box(lx, ly, 1, 1, tint('#ffd23f'));
    }
  }

  // drifting clouds + seasonal bits (own random, rebuilt with the scene)
  function extras() {
    var name = season(), html = '', i;
    for (i = 0; i < 5; i++) {
      var w = 96 + Math.round(Math.random() * 5) * 16, dur = 120 + Math.random() * 110;
      html += '<i class="pf-cloud" style="top:' + (7 + Math.random() * 27).toFixed(1) + '%;width:' + w + 'px;height:' + w / 4 + 'px;--x:' + (i * 20 + Math.random() * 12).toFixed(0) + 'vw;--dur:' + dur.toFixed(0) + 's;--delay:' + (-dur * (i + Math.random()) / 5).toFixed(0) + 's"></i>';
    }
    var flies = night && name !== 'Winter';
    var tone = flies ? ['#fff3a0', '#d8ff8a'] : name === 'Spring' ? ['#ffd1e6', '#f7a9cb', '#ffffff'] : name === 'Summer' ? ['#ffffff', '#fff3b0'] : name === 'Fall' ? ['#f7a53c', '#e0742c', '#c9502a', '#f5cf5b'] : ['#ffffff', '#eaf4ff'];
    var n = flies ? 18 : name === 'Winter' ? 36 : name === 'Summer' ? 12 : 22;
    for (i = 0; i < n; i++) {
      var d = flies ? 5 + Math.random() * 6 : 11 + Math.random() * 13, size = flies || name === 'Summer' ? 4 : Math.random() < 0.4 ? 8 : 4;
      html += '<i class="pf-bit' + (flies ? ' pf-fly' : '') + '" style="left:' + (Math.random() * 102 - 1).toFixed(1) + '%;' + (flies ? 'top:' + (52 + Math.random() * 44).toFixed(1) + '%;' : '') +
        'width:' + size + 'px;height:4px;background:' + tone[(Math.random() * tone.length) | 0] + ';--dx:' + (flies ? Math.random() * 80 - 40 : -(40 + Math.random() * 160)).toFixed(0) + 'px;--dy:' + (Math.random() * 60 - 50).toFixed(0) + 'px;--dur:' + d.toFixed(1) + 's;--delay:' + (-Math.random() * d).toFixed(1) + 's"></i>';
    }
    return html;
  }

  function build() {
    if (!host) host = document.getElementById('pixel-farm');
    if (!host) return;
    if (!active) {
      if (host.firstChild) { host.innerHTML = ''; canvas = null; }
      key = '';
      return;
    }
    var next = [season(), night, window.innerWidth, window.innerHeight].join('|');
    if (next === key) return;
    key = next;
    host.innerHTML = '<canvas></canvas>' + extras();
    canvas = host.firstChild;
    document.documentElement.setAttribute('data-farm-season', season().toLowerCase());
    try { paint(); } catch (e) { /* the flat sky/grass background in the css stays */ }
  }

  window.addEventListener('resize', function () {
    if (!active) return;
    clearTimeout(timer);
    timer = setTimeout(build, 180);
  });

  window.KanbanFarm = {
    render: function (on, isNight) { active = !!on; night = !!isNight; build(); return active ? season() : ''; },
    season: season
  };
})();
