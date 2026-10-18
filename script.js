'use strict';

/* ==========================================================
   QRForge – logika aplikasi
   Library QR: qr-code-styling (lokal, qr-code-styling.js)
   ========================================================== */

/* ---------- Util ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clone = o => JSON.parse(JSON.stringify(o));

function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
  }
  (Array.isArray(children) ? children : [children]).forEach(c => n.append(c));
  return n;
}

const store = {
  get(k, fb) {
    try { const v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v); } catch { return fb; }
  },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; }
  }
};

let toastTimer;
function toast(msg, kind = 'ok') {
  const t = $('#toast');
  t.textContent = msg;
  t.dataset.kind = kind;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

const KEYS = { state: 'qrforge.state.v1', history: 'qrforge.history.v1', theme: 'qrforge.theme' };

/* ---------- State ---------- */
const DEFAULTS = {
  type: 'url',
  fields: { url: 'https://example.com' },

  dotsType: 'rounded',
  cornerSquareType: 'extra-rounded',
  cornerDotType: 'dot',

  fgMode: 'gradient',
  fg1: '#6d4aff',
  fg2: '#00b4ff',
  gradType: 'linear',
  gradAngle: 45,

  cornerCustom: false,
  cornerSqColor: '#4a2fd6',
  cornerDotColor: '#4a2fd6',

  bg: '#ffffff',
  bgTransparent: false,
  margin: 3,
  ec: 'auto',

  logoMode: 'none',
  logoImage: null,
  logoText: 'QR',
  logoFont: 'sans',
  logoBold: true,
  logoTextColor: '#6d4aff',
  logoShape: 'circle',
  logoBg: '#ffffff',
  logoBorderColor: '#6d4aff',
  logoBorderWidth: 0,
  logoPadding: 14,
  logoSize: 75,
  logoMargin: 6,

  frame: 'none',
  frameColor: '#6d4aff',
  frameTextColor: '#ffffff',
  frameLabel: 'SCAN ME',

  exportFormat: 'png',
  exportSize: 1024
};

const ENUMS = {
  type: ['url', 'text', 'wifi', 'vcard', 'email', 'sms', 'wa', 'tel', 'geo'],
  dotsType: ['square', 'rounded', 'dots', 'extra-rounded', 'classy', 'classy-rounded'],
  cornerSquareType: ['square', 'extra-rounded', 'dot'],
  cornerDotType: ['square', 'dot'],
  fgMode: ['solid', 'gradient'],
  gradType: ['linear', 'radial'],
  ec: ['auto', 'L', 'M', 'Q', 'H'],
  logoMode: ['none', 'image', 'text'],
  logoFont: ['sans', 'serif', 'mono', 'display', 'script'],
  logoShape: ['none', 'circle', 'rounded', 'square'],
  frame: ['none', 'solid', 'label'],
  exportFormat: ['png', 'jpeg', 'webp', 'svg'],
  exportSize: [512, 1024, 2048, 4096]
};
const COLOR_KEYS = ['fg1', 'fg2', 'cornerSqColor', 'cornerDotColor', 'bg', 'logoTextColor', 'logoBg', 'logoBorderColor', 'frameColor', 'frameTextColor'];
const RANGES = {
  gradAngle: [0, 360], margin: [0, 12], logoBorderWidth: [0, 10], logoPadding: [0, 30], logoSize: [20, 100], logoMargin: [0, 20]
};

function sanitize(obj) {
  const out = clone(DEFAULTS);
  if (!obj || typeof obj !== 'object') return out;
  for (const k of Object.keys(DEFAULTS)) {
    if (!(k in obj)) continue;
    const dv = DEFAULTS[k];
    const v = obj[k];
    if (k === 'fields') {
      if (v && typeof v === 'object') {
        out.fields = {};
        for (const [fk, fv] of Object.entries(v)) {
          if (typeof fv === 'string' || typeof fv === 'boolean') out.fields[fk] = fv;
        }
      }
    } else if (k === 'logoImage') {
      out.logoImage = typeof v === 'string' && v.startsWith('data:image/') ? v : null;
    } else if (COLOR_KEYS.includes(k)) {
      if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) out[k] = v.toLowerCase();
    } else if (ENUMS[k]) {
      if (ENUMS[k].includes(v)) out[k] = v;
    } else if (RANGES[k]) {
      const n = Number(v);
      if (Number.isFinite(n)) out[k] = Math.min(RANGES[k][1], Math.max(RANGES[k][0], n));
    } else if (typeof v === typeof dv) {
      out[k] = typeof v === 'string' ? v.slice(0, 300) : v;
    }
  }
  return out;
}

let state = sanitize(store.get(KEYS.state, null));

/* ---------- Tipe konten ---------- */
const val = (f, k) => (f[k] ?? '').toString().trim();
const digits = s => s.replace(/\D/g, '');
const intlPhone = s => { let d = digits(s); if (d.startsWith('0')) d = '62' + d.slice(1); return d; };
const wifiEsc = s => s.replace(/([\\;,:"])/g, '\\$1');
const vEsc = s => s.replace(/([\\;,])/g, '\\$1').replace(/\r?\n/g, '\\n');
function normalizeUrl(u) {
  u = (u || '').trim();
  if (!u) return '';
  if (/^([a-z][a-z0-9+.-]*:\/\/|mailto:|tel:|sms:|smsto:|geo:)/i.test(u)) return u;
  return 'https://' + u;
}

const TYPES = {
  url: {
    label: 'Website', icon: '🔗',
    fields: [{ id: 'url', label: 'Alamat website', type: 'url', ph: 'contoh.com atau https://contoh.com' }],
    build: f => normalizeUrl(val(f, 'url'))
  },
  text: {
    label: 'Teks', icon: '📝',
    fields: [{ id: 'text', label: 'Teks bebas', type: 'textarea', ph: 'Tulis pesan, catatan, atau apa saja…' }],
    build: f => (f.text ?? '').toString()
  },
  wifi: {
    label: 'Wi-Fi', icon: '📶',
    fields: [
      { id: 'ssid', label: 'Nama jaringan (SSID)', type: 'text', ph: 'Nama Wi-Fi' },
      { id: 'wifiPass', label: 'Kata sandi', type: 'text', ph: 'Kosongkan jika tanpa sandi' },
      { id: 'wifiEnc', label: 'Keamanan', type: 'select', options: [['WPA', 'WPA / WPA2 / WPA3'], ['WEP', 'WEP'], ['nopass', 'Tanpa sandi']] },
      { id: 'wifiHidden', label: 'Jaringan tersembunyi', type: 'checkbox' }
    ],
    build: f => {
      const ssid = val(f, 'ssid');
      if (!ssid) return '';
      const enc = val(f, 'wifiEnc') || 'WPA';
      const pass = val(f, 'wifiPass');
      let s = `WIFI:T:${enc};S:${wifiEsc(ssid)};`;
      if (enc !== 'nopass' && pass) s += `P:${wifiEsc(pass)};`;
      if (f.wifiHidden === true) s += 'H:true;';
      return s + ';';
    }
  },
  vcard: {
    label: 'Kontak', icon: '👤',
    fields: [
      { id: 'name', label: 'Nama lengkap', type: 'text', ph: 'Nama kamu' },
      { id: 'org', label: 'Perusahaan', type: 'text', ph: 'Opsional' },
      { id: 'jobTitle', label: 'Jabatan', type: 'text', ph: 'Opsional' },
      { id: 'phone', label: 'Nomor telepon', type: 'tel', ph: '+62 812 3456 7890' },
      { id: 'email', label: 'Email', type: 'email', ph: 'nama@contoh.com' },
      { id: 'website', label: 'Website', type: 'url', ph: 'https://contoh.com' },
      { id: 'address', label: 'Alamat', type: 'text', ph: 'Jakarta, Indonesia' }
    ],
    build: f => {
      const name = val(f, 'name'), phone = val(f, 'phone'), email = val(f, 'email');
      if (!name && !phone && !email) return '';
      const L = ['BEGIN:VCARD', 'VERSION:3.0', `N:;${vEsc(name)};;;`, `FN:${vEsc(name)}`];
      if (val(f, 'org')) L.push(`ORG:${vEsc(val(f, 'org'))}`);
      if (val(f, 'jobTitle')) L.push(`TITLE:${vEsc(val(f, 'jobTitle'))}`);
      if (phone) L.push(`TEL;TYPE=CELL:${vEsc(phone)}`);
      if (email) L.push(`EMAIL:${vEsc(email)}`);
      if (val(f, 'website')) L.push(`URL:${vEsc(normalizeUrl(val(f, 'website')))}`);
      if (val(f, 'address')) L.push(`ADR:;;${vEsc(val(f, 'address'))};;;;`);
      L.push('END:VCARD');
      return L.join('\n');
    }
  },
  email: {
    label: 'Email', icon: '✉️',
    fields: [
      { id: 'to', label: 'Alamat tujuan', type: 'email', ph: 'nama@contoh.com' },
      { id: 'subject', label: 'Subjek', type: 'text', ph: 'Opsional' },
      { id: 'body', label: 'Isi pesan', type: 'textarea', ph: 'Opsional' }
    ],
    build: f => {
      const to = val(f, 'to');
      if (!to) return '';
      const q = [];
      if (val(f, 'subject')) q.push('subject=' + encodeURIComponent(val(f, 'subject')));
      if (val(f, 'body')) q.push('body=' + encodeURIComponent(f.body));
      return `mailto:${to}${q.length ? '?' + q.join('&') : ''}`;
    }
  },
  sms: {
    label: 'SMS', icon: '💬',
    fields: [
      { id: 'phone', label: 'Nomor tujuan', type: 'tel', ph: '+62 812 3456 7890' },
      { id: 'message', label: 'Pesan', type: 'textarea', ph: 'Opsional' }
    ],
    build: f => val(f, 'phone') ? `SMSTO:${val(f, 'phone').replace(/\s+/g, '')}:${(f.message ?? '').toString()}` : ''
  },
  wa: {
    label: 'WhatsApp', icon: '🟢',
    fields: [
      { id: 'phone', label: 'Nomor WhatsApp', type: 'tel', ph: '0812 3456 7890', hint: 'Awalan 0 otomatis diganti 62' },
      { id: 'message', label: 'Pesan awal', type: 'textarea', ph: 'Halo, saya tertarik…' }
    ],
    build: f => {
      const p = intlPhone(val(f, 'phone'));
      if (!p) return '';
      const m = (f.message ?? '').toString().trim();
      return `https://wa.me/${p}${m ? '?text=' + encodeURIComponent(m) : ''}`;
    }
  },
  tel: {
    label: 'Telepon', icon: '📞',
    fields: [{ id: 'phone', label: 'Nomor telepon', type: 'tel', ph: '+62 812 3456 7890' }],
    build: f => val(f, 'phone') ? `tel:${val(f, 'phone').replace(/[^\d+]/g, '')}` : ''
  },
  geo: {
    label: 'Lokasi', icon: '📍',
    fields: [
      { id: 'lat', label: 'Latitude', type: 'text', ph: '-6.2088', mode: 'decimal' },
      { id: 'lng', label: 'Longitude', type: 'text', ph: '106.8456', mode: 'decimal' }
    ],
    extra: 'geo',
    build: f => {
      const la = parseFloat(val(f, 'lat').replace(',', '.'));
      const ln = parseFloat(val(f, 'lng').replace(',', '.'));
      if (!Number.isFinite(la) || !Number.isFinite(ln)) return '';
      if (Math.abs(la) > 90 || Math.abs(ln) > 180) return '';
      return `geo:${la},${ln}`;
    }
  }
};

function currentData(s = state) {
  try { return TYPES[s.type].build(s.fields) || ''; } catch { return ''; }
}

/* ---------- Preset tema ---------- */
const PRESETS = [
  { name: 'Aurora',  fgMode: 'gradient', fg1: '#6d4aff', fg2: '#00b4ff', gradAngle: 45,  bg: '#ffffff', dotsType: 'rounded',        cornerSquareType: 'extra-rounded', cornerDotType: 'dot' },
  { name: 'Senja',   fgMode: 'gradient', fg1: '#e2380d', fg2: '#f59e0b', gradAngle: 135, bg: '#fffaf4', dotsType: 'dots',           cornerSquareType: 'extra-rounded', cornerDotType: 'dot' },
  { name: 'Samudra', fgMode: 'gradient', fg1: '#0b4fd1', fg2: '#00a98f', gradAngle: 90,  bg: '#ffffff', dotsType: 'rounded',        cornerSquareType: 'extra-rounded', cornerDotType: 'dot' },
  { name: 'Hutan',   fgMode: 'gradient', fg1: '#0b5d3f', fg2: '#4aa84a', gradAngle: 60,  bg: '#f7fff8', dotsType: 'classy-rounded', cornerSquareType: 'extra-rounded', cornerDotType: 'square' },
  { name: 'Berry',   fgMode: 'gradient', fg1: '#6b21d6', fg2: '#d4189a', gradAngle: 45,  bg: '#ffffff', dotsType: 'extra-rounded',  cornerSquareType: 'extra-rounded', cornerDotType: 'dot' },
  { name: 'Tinta',   fgMode: 'solid',    fg1: '#111827', fg2: '#111827', gradAngle: 0,   bg: '#ffffff', dotsType: 'square',         cornerSquareType: 'square',        cornerDotType: 'square' },
  { name: 'Emas',    fgMode: 'gradient', fg1: '#8a5a00', fg2: '#d49a00', gradAngle: 45,  bg: '#fffbea', dotsType: 'classy',         cornerSquareType: 'square',        cornerDotType: 'dot' },
  { name: 'Permen',  fgMode: 'gradient', fg1: '#e11d78', fg2: '#5b4bff', gradAngle: 120, bg: '#fff7fb', dotsType: 'dots',           cornerSquareType: 'dot',           cornerDotType: 'dot' },
  { name: 'Mawar',   fgMode: 'gradient', fg1: '#a3123a', fg2: '#e0506f', gradAngle: 30,  bg: '#fff6f7', dotsType: 'extra-rounded',  cornerSquareType: 'extra-rounded', cornerDotType: 'dot' },
  { name: 'Malam',   fgMode: 'gradient', fg1: '#0f172a', fg2: '#475569', gradAngle: 90,  bg: '#f1f5f9', dotsType: 'classy',         cornerSquareType: 'extra-rounded', cornerDotType: 'square' },
  { name: 'Mint',    fgMode: 'gradient', fg1: '#0b7f75', fg2: '#1fa84f', gradAngle: 75,  bg: '#f2fffb', dotsType: 'rounded',        cornerSquareType: 'dot',           cornerDotType: 'dot' },
  { name: 'Klasik',  fgMode: 'solid',    fg1: '#000000', fg2: '#000000', gradAngle: 0,   bg: '#ffffff', dotsType: 'square',         cornerSquareType: 'square',        cornerDotType: 'square' }
];

function applyLook(p) {
  Object.assign(state, {
    fgMode: p.fgMode, fg1: p.fg1, fg2: p.fg2, gradType: 'linear', gradAngle: p.gradAngle,
    bg: p.bg, bgTransparent: false,
    dotsType: p.dotsType, cornerSquareType: p.cornerSquareType, cornerDotType: p.cornerDotType,
    cornerCustom: false,
    // selaraskan warna aksesori dengan tema
    frameColor: p.fg1, logoTextColor: p.fg1, logoBorderColor: p.fg1
  });
  syncUI();
  scheduleRender();
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const x = v => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${x(f(0))}${x(f(8))}${x(f(4))}`;
}
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
function randomLook() {
  const h = Math.floor(Math.random() * 360);
  const h2 = (h + 30 + Math.floor(Math.random() * 70)) % 360;
  const gradient = Math.random() < 0.85;
  const c1 = hslToHex(h, 72 + Math.random() * 18, 30 + Math.random() * 10);
  applyLook({
    fgMode: gradient ? 'gradient' : 'solid',
    fg1: c1,
    fg2: gradient ? hslToHex(h2, 78 + Math.random() * 15, 36 + Math.random() * 10) : c1,
    gradAngle: Math.floor(Math.random() * 24) * 15,
    bg: '#ffffff',
    dotsType: pick(ENUMS.dotsType),
    cornerSquareType: pick(ENUMS.cornerSquareType),
    cornerDotType: pick(ENUMS.cornerDotType)
  });
}

/* ---------- Gambar & logo ---------- */
const FONTS = {
  sans: '"Plus Jakarta Sans", system-ui, "Segoe UI", Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: '"Courier New", ui-monospace, monospace',
  display: 'Impact, "Arial Black", "Helvetica Neue", sans-serif',
  script: '"Brush Script MT", "Segoe Script", cursive'
};
const EC_FACTOR = { L: 0.07, M: 0.15, Q: 0.25, H: 0.3 };
const EXT = { png: 'png', jpeg: 'jpg', webp: 'webp', svg: 'svg' };

const imgCache = new Map();
function loadImage(src) {
  if (imgCache.has(src)) return imgCache.get(src);
  const p = new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('Gambar tidak bisa dimuat'));
    i.src = src;
  });
  imgCache.set(src, p);
  if (imgCache.size > 12) imgCache.delete(imgCache.keys().next().value);
  p.catch(() => imgCache.delete(src));
  return p;
}
function blobToImage(blob) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(blob);
    const i = new Image();
    i.onload = () => { URL.revokeObjectURL(url); res(i); };
    i.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Gagal membaca hasil QR')); };
    i.src = url;
  });
}

function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function shapePath(ctx, shape, x, y, w, h) {
  if (shape === 'circle') { ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2); }
  else if (shape === 'rounded') roundRectPath(ctx, x, y, w, h, Math.min(w, h) * 0.24);
  else { ctx.beginPath(); ctx.rect(x, y, w, h); }
}

let logoCache = { key: '', url: null };
async function getLogoURL() {
  const s = state;
  if (s.logoMode === 'none') return null;
  if (s.logoMode === 'image' && !s.logoImage) return null;
  if (s.logoMode === 'text' && !s.logoText.trim()) return null;

  const key = JSON.stringify([
    s.logoMode,
    s.logoMode === 'image' ? s.logoImage : [s.logoText, s.logoFont, s.logoBold, s.logoTextColor],
    s.logoShape, s.logoBg, s.logoBorderColor, s.logoBorderWidth, s.logoPadding
  ]);
  if (logoCache.key === key) return logoCache.url;

  const C = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = C;
  const ctx = cv.getContext('2d');

  if (s.logoShape !== 'none') {
    shapePath(ctx, s.logoShape, 0, 0, C, C);
    ctx.fillStyle = s.logoBg;
    ctx.fill();
    const bw = C * s.logoBorderWidth / 100;
    if (bw > 0) {
      shapePath(ctx, s.logoShape, bw / 2, bw / 2, C - bw, C - bw);
      ctx.lineWidth = bw;
      ctx.strokeStyle = s.logoBorderColor;
      ctx.stroke();
    }
  }

  const pad = C * s.logoPadding / 100;
  let area = C - 2 * pad;
  if (s.logoShape === 'circle') area *= 0.74;
  else if (s.logoShape === 'rounded') area *= 0.88;
  area = Math.max(area, 24);

  if (s.logoMode === 'image') {
    const img = await loadImage(s.logoImage);
    const w0 = img.naturalWidth || img.width || C, h0 = img.naturalHeight || img.height || C;
    const r = Math.min(area / w0, area / h0);
    ctx.drawImage(img, C / 2 - (w0 * r) / 2, C / 2 - (h0 * r) / 2, w0 * r, h0 * r);
  } else {
    const fam = FONTS[s.logoFont] || FONTS.sans;
    const wt = s.logoBold ? '800' : '500';
    const text = s.logoText.trim();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = s.logoTextColor;
    ctx.font = `${wt} 100px ${fam}`;
    const w = ctx.measureText(text).width || 1;
    const fs = Math.min(100 * area / w, area * 0.92);
    ctx.font = `${wt} ${fs}px ${fam}`;
    ctx.fillText(text, C / 2, C / 2 + fs * 0.04);
  }

  const url = cv.toDataURL('image/png');
  logoCache = { key, url };
  return url;
}

/* ---------- Opsi QR ---------- */
function effectiveEC(hasLogo) {
  return state.ec === 'auto' ? (hasLogo ? 'H' : 'M') : state.ec;
}

async function buildOptions(size, data, type = 'canvas') {
  const s = state;
  const logo = await getLogoURL();
  const grad = s.fgMode === 'gradient'
    ? { gradient: { type: s.gradType, rotation: s.gradAngle * Math.PI / 180, colorStops: [{ offset: 0, color: s.fg1 }, { offset: 1, color: s.fg2 }] } }
    : { color: s.fg1 };

  const opts = {
    width: size,
    height: size,
    type,
    data: data || 'QRForge',
    margin: Math.round(size * s.margin / 100),
    qrOptions: { errorCorrectionLevel: effectiveEC(!!logo) },
    dotsOptions: { type: s.dotsType, ...grad },
    cornersSquareOptions: { type: s.cornerSquareType },
    cornersDotOptions: { type: s.cornerDotType },
    backgroundOptions: { color: s.bgTransparent ? 'rgba(0,0,0,0)' : s.bg }
  };
  if (s.cornerCustom) {
    opts.cornersSquareOptions.color = s.cornerSqColor;
    opts.cornersDotOptions.color = s.cornerDotColor;
  }
  if (logo) {
    opts.image = logo;
    opts.imageOptions = {
      hideBackgroundDots: true,
      imageSize: s.logoSize / 100,
      margin: Math.round(size * s.logoMargin / 480),
      crossOrigin: 'anonymous'
    };
  }
  return opts;
}

async function qrImage(size, data) {
  const qr = new QRCodeStyling(await buildOptions(size, data));
  const blob = await qr.getRawData('png');
  return blobToImage(blob);
}

/* ---------- Frame & komposisi ---------- */
function frameGeometry(S) {
  if (state.frame === 'none') return { W: S, H: S, pad: 0, bottom: 0, radius: 0, inner: 0 };
  const pad = Math.round(S * 0.07);
  const bottom = state.frame === 'label' ? Math.round(S * 0.17) : pad;
  return { W: S + pad * 2, H: S + pad + bottom, pad, bottom, radius: Math.round(S * 0.075), inner: Math.round(S * 0.035) };
}
function labelText() { return (state.frameLabel || '').trim() || 'SCAN ME'; }

async function composite(size, { data, bgFill = false } = {}) {
  const s = state;
  const img = await qrImage(size, data);
  const g = frameGeometry(size);
  const cv = document.createElement('canvas');
  cv.width = g.W; cv.height = g.H;
  const ctx = cv.getContext('2d');

  if (bgFill) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, g.W, g.H); }

  if (s.frame === 'none') {
    ctx.drawImage(img, 0, 0, size, size);
    return cv;
  }

  roundRectPath(ctx, 0, 0, g.W, g.H, g.radius);
  ctx.fillStyle = s.frameColor;
  ctx.fill();

  ctx.save();
  roundRectPath(ctx, g.pad, g.pad, size, size, g.inner);
  ctx.clip();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(g.pad, g.pad, size, size);
  ctx.drawImage(img, g.pad, g.pad, size, size);
  ctx.restore();

  if (s.frame === 'label') {
    const text = labelText();
    let fs = Math.round(g.bottom * 0.46);
    ctx.font = `800 ${fs}px ${FONTS.sans}`;
    const w = ctx.measureText(text).width;
    if (w > size * 0.92) { fs = Math.floor(fs * size * 0.92 / w); ctx.font = `800 ${fs}px ${FONTS.sans}`; }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = s.frameTextColor;
    ctx.fillText(text, g.W / 2, g.pad + size + g.bottom / 2);
  }
  return cv;
}

const xmlEsc = s => s.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));

async function exportSVG(size, data) {
  const qr = new QRCodeStyling(await buildOptions(size, data, 'svg'));
  const blob = await qr.getRawData('svg');
  if (state.frame === 'none') return blob;

  const inner = await blob.text();
  const b64 = btoa(unescape(encodeURIComponent(inner)));
  const g = frameGeometry(size);
  const s = state;
  let label = '';
  if (s.frame === 'label') {
    const text = labelText();
    let fs = Math.round(g.bottom * 0.46);
    const est = text.length * fs * 0.62;
    if (est > size * 0.92) fs = Math.floor(fs * size * 0.92 / est);
    label = `<text x="${g.W / 2}" y="${g.pad + size + g.bottom / 2}" text-anchor="middle" dominant-baseline="central" font-family="Plus Jakarta Sans, Arial, sans-serif" font-weight="800" font-size="${fs}" fill="${s.frameTextColor}">${xmlEsc(text)}</text>`;
  }
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${g.W}" height="${g.H}" viewBox="0 0 ${g.W} ${g.H}">` +
    `<defs><clipPath id="card"><rect x="${g.pad}" y="${g.pad}" width="${size}" height="${size}" rx="${g.inner}"/></clipPath></defs>` +
    `<rect width="${g.W}" height="${g.H}" rx="${g.radius}" fill="${s.frameColor}"/>` +
    `<rect x="${g.pad}" y="${g.pad}" width="${size}" height="${size}" fill="#ffffff" clip-path="url(#card)"/>` +
    `<image x="${g.pad}" y="${g.pad}" width="${size}" height="${size}" clip-path="url(#card)" href="data:image/svg+xml;base64,${b64}"/>` +
    label + `</svg>`;
  return new Blob([svg], { type: 'image/svg+xml' });
}

async function exportBlob(format, size, data) {
  const d = data ?? (currentData() || 'QRForge');
  if (format === 'svg') return exportSVG(size, d);
  const cv = await composite(size, { data: d, bgFill: format === 'jpeg' });
  const mime = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' }[format];
  return new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('Resolusi terlalu besar untuk browser ini')), mime, 0.95));
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* ---------- Render preview ---------- */
let renderToken = 0, renderTimer = 0, saveTimer = 0;
let hasError = false;

function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderPreview, 70);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => store.set(KEYS.state, state), 400);
  updateMeta();
}

function setStageNote(msg) {
  const n = $('#stageNote');
  n.hidden = !msg;
  n.textContent = msg || '';
}

async function renderPreview() {
  const token = ++renderToken;
  const data = currentData();
  const stage = $('#stage');
  try {
    const cv = await composite(480, { data });
    if (token !== renderToken) return;
    const target = $('#previewCanvas');
    target.width = cv.width;
    target.height = cv.height;
    target.getContext('2d').drawImage(cv, 0, 0);
    hasError = false;
    stage.classList.toggle('dim', !data);
    setStageNote(data ? '' : 'Isi data di tab Konten untuk membuat QR code.');
  } catch (err) {
    if (token !== renderToken) return;
    hasError = true;
    const m = String(err && err.message ? err.message : err);
    stage.classList.add('dim');
    setStageNote(/overflow/i.test(m)
      ? 'Data terlalu panjang untuk QR code. Persingkat isinya atau turunkan level error correction.'
      : 'QR gagal dibuat: ' + m);
    console.error(err);
  }
  updateButtons();
}

function canExport() { return !!currentData() && !hasError; }
function updateButtons() {
  const ok = canExport();
  ['#btnDownload', '#btnCopy', '#btnShare', '#btnSave'].forEach(id => { $(id).disabled = !ok; });
  $('#btnShare').hidden = !navigator.share;
  $('.btn-row.three').style.gridTemplateColumns = navigator.share ? '' : 'repeat(2, 1fr)';
}

/* ---------- Skor keterbacaan ---------- */
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function lum(h) {
  const [r, g, b] = hexToRgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) { const A = lum(a), B = lum(b); return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05); }

function hasLogoNow() {
  const s = state;
  return (s.logoMode === 'image' && !!s.logoImage) || (s.logoMode === 'text' && !!s.logoText.trim());
}

function updateMeta() {
  const s = state;
  const data = currentData();
  const logo = hasLogoNow();
  const ec = effectiveEC(logo);
  const tips = [];
  let score = 100;

  const bg = s.bgTransparent ? '#ffffff' : s.bg;
  const fgs = [s.fg1];
  if (s.fgMode === 'gradient') fgs.push(s.fg2);
  if (s.cornerCustom) fgs.push(s.cornerSqColor, s.cornerDotColor);
  const minC = Math.min(...fgs.map(c => contrast(c, bg)));
  const inverted = fgs.some(c => lum(c) > lum(bg));

  if (inverted) { score -= 45; tips.push('Titik lebih terang dari latar. Banyak aplikasi scanner gagal membaca QR terbalik.'); }
  if (minC < 2) { score -= 45; tips.push('Kontras warna terlalu rendah. Pakai warna titik yang jauh lebih gelap dari latar.'); }
  else if (minC < 3) { score -= 30; tips.push('Kontras warna masih rendah. Gelapkan warna titik atau terangkan latar.'); }
  else if (minC < 4.5) { score -= 12; tips.push('Kontras cukup, tapi lebih aman jika warna titik dibuat lebih gelap.'); }

  if (logo) {
    const cover = (s.logoSize / 100) * EC_FACTOR[ec];
    if (cover > 0.26) { score -= 30; tips.push('Logo terlalu besar. Kecilkan ukurannya supaya QR tetap terbaca.'); }
    else if (cover > 0.2) { score -= 12; tips.push('Logo cukup besar. Uji scan dengan HP sebelum dicetak.'); }
    if (ec === 'L' || ec === 'M') { score -= 18; tips.push('Dengan logo, pakai error correction Q atau H.'); }
  }
  if (data.length > 450) { score -= 22; tips.push('Isi QR sangat panjang sehingga titiknya rapat. Persingkat jika bisa.'); }
  else if (data.length > 220) { score -= 8; tips.push('Isi QR cukup panjang. Pakai ukuran cetak yang besar.'); }
  if (s.margin < 2 && !s.bgTransparent) { score -= 10; tips.push('Jarak tepi terlalu kecil. QR butuh ruang kosong di sekelilingnya.'); }
  if (s.bgTransparent) tips.push('Latar transparan: pastikan QR ditempatkan di atas warna terang.');

  score = Math.max(5, Math.min(100, score));
  const label = score >= 85 ? 'Sangat mudah' : score >= 65 ? 'Cukup baik' : score >= 40 ? 'Berisiko' : 'Sulit dipindai';
  const color = score >= 85 ? '#34d399' : score >= 65 ? '#a3e635' : score >= 40 ? '#fbbf24' : '#fb7185';

  $('#meterLabel').textContent = data ? label : '–';
  const fill = $('#meterFill');
  fill.style.width = (data ? score : 0) + '%';
  fill.style.background = color;
  const ul = $('#meterTips');
  ul.textContent = '';
  tips.slice(0, 3).forEach(t => ul.append(el('li', { text: t })));

  const facts = $('#facts');
  facts.textContent = '';
  [`${data.length} karakter`, `Error correction ${ec}`, `${s.exportSize} px`].forEach(t => facts.append(el('span', { text: t })));
}

/* ---------- Konten: UI dinamis ---------- */
function renderTypeGrid() {
  const g = $('#typeGrid');
  g.textContent = '';
  for (const [k, t] of Object.entries(TYPES)) {
    g.append(el('button', {
      class: 'chip' + (state.type === k ? ' active' : ''), type: 'button', 'data-type': k,
      onclick: () => { state.type = k; renderTypeGrid(); renderFields(); scheduleRender(); }
    }, [el('span', { class: 'ico', text: t.icon }), el('span', { text: t.label })]));
  }
}

function renderFields() {
  const box = $('#fields');
  box.textContent = '';
  const t = TYPES[state.type];
  for (const f of t.fields) {
    let input;
    if (f.type === 'textarea') input = el('textarea', { rows: 4, placeholder: f.ph || '' });
    else if (f.type === 'select') input = el('select', { class: 'select' }, f.options.map(([v, l]) => el('option', { value: v, text: l })));
    else if (f.type === 'checkbox') input = null;
    else input = el('input', { type: f.type, placeholder: f.ph || '', autocomplete: 'off', inputmode: f.mode || false });

    if (f.type === 'checkbox') {
      const cb = el('input', { type: 'checkbox' });
      cb.checked = state.fields[f.id] === true;
      cb.addEventListener('input', () => { state.fields[f.id] = cb.checked; scheduleRender(); });
      box.append(el('label', { class: 'switch' }, [cb, el('span', { class: 'knob' }), el('span', { class: 'switch-text', text: f.label })]));
      continue;
    }
    const cur = state.fields[f.id];
    input.value = typeof cur === 'string' ? cur : (f.type === 'select' ? f.options[0][0] : '');
    if (f.type === 'select' && typeof cur !== 'string') state.fields[f.id] = f.options[0][0];
    input.addEventListener('input', () => { state.fields[f.id] = input.value; scheduleRender(); });
    const kids = [el('span', { text: f.label }), input];
    if (f.hint) kids.push(el('span', { class: 'hint-line', text: f.hint }));
    box.append(el('label', { class: 'field' }, kids));
  }
  if (t.extra === 'geo') {
    box.append(el('button', {
      class: 'btn ghost small', type: 'button', text: '📍 Pakai lokasi saya saat ini',
      onclick: () => {
        if (!navigator.geolocation) return toast('Browser tidak mendukung geolokasi.', 'warn');
        navigator.geolocation.getCurrentPosition(pos => {
          state.fields.lat = pos.coords.latitude.toFixed(6);
          state.fields.lng = pos.coords.longitude.toFixed(6);
          renderFields(); scheduleRender();
        }, () => toast('Izin lokasi ditolak atau tidak tersedia.', 'warn'), { timeout: 8000 });
      }
    }));
  }
}

/* ---------- Preset grid ---------- */
function renderPresets() {
  const g = $('#presetGrid');
  g.textContent = '';
  PRESETS.forEach(p => {
    const bg = p.fgMode === 'gradient' ? `linear-gradient(${p.gradAngle}deg, ${p.fg1}, ${p.fg2})` : p.fg1;
    g.append(el('button', { class: 'preset', type: 'button', onclick: () => applyLook(p) }, [
      el('span', { class: 'sw', style: `background:${bg}` }),
      el('span', { text: p.name })
    ]));
  });
}

/* ---------- Binding kontrol ---------- */
function readVal(elm) {
  if (elm.type === 'checkbox') return elm.checked;
  if (elm.type === 'range' || elm.type === 'number' || elm.hasAttribute('data-num')) return Number(elm.value);
  return elm.value;
}

function cond(expr) {
  return expr.split('&&').every(part => {
    part = part.trim();
    let m;
    if ((m = part.match(/^(\w+)!=(.+)$/))) return String(state[m[1]]) !== m[2];
    if ((m = part.match(/^(\w+)=(.+)$/))) return m[2].split('|').includes(String(state[m[1]]));
    return !!state[part];
  });
}
function updateVisibility() {
  $$('[data-show]').forEach(n => { n.hidden = !cond(n.dataset.show); });
  const rm = $('#btnRemoveLogo');
  rm.hidden = !(state.logoMode === 'image' && state.logoImage);
}
function updateOutputs() {
  $$('[data-out]').forEach(o => { o.textContent = state[o.dataset.out] + (o.dataset.unit || ''); });
}

function onChange() {
  updateOutputs();
  updateVisibility();
  scheduleRender();
}

function renderDropzone() {
  const th = $('#dzThumb');
  th.textContent = '';
  if (state.logoImage) {
    th.append(el('img', { src: state.logoImage, alt: 'Logo yang dipilih' }));
    $('#dzTitle').textContent = 'Logo terpasang. Klik untuk mengganti';
  } else {
    th.textContent = '🖼️';
    $('#dzTitle').textContent = 'Tarik dan lepas logo di sini';
  }
}

function syncUI() {
  $$('[data-bind]').forEach(n => {
    const v = state[n.dataset.bind];
    if (n.type === 'checkbox') n.checked = !!v; else n.value = v;
  });
  $$('.seg[data-seg]').forEach(seg => {
    const v = String(state[seg.dataset.seg]);
    $$('button', seg).forEach(b => b.classList.toggle('active', b.dataset.v === v));
  });
  updateOutputs();
  updateVisibility();
  renderTypeGrid();
  renderFields();
  renderDropzone();
}

function bindControls() {
  $$('[data-bind]').forEach(n => {
    const handler = () => { state[n.dataset.bind] = readVal(n); onChange(); };
    n.addEventListener('input', handler);
    if (n.tagName === 'SELECT') n.addEventListener('change', handler);
  });

  $$('.seg[data-seg]').forEach(seg => {
    seg.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      state[seg.dataset.seg] = b.dataset.v;
      $$('button', seg).forEach(x => x.classList.toggle('active', x === b));
      onChange();
    });
  });

  // Tab
  $$('.tab').forEach(t => t.addEventListener('click', () => {
    $$('.tab').forEach(x => x.classList.toggle('active', x === t));
    $$('.tab-pane').forEach(p => { p.hidden = p.id !== 'pane-' + t.dataset.tab; });
    if (t.dataset.tab === 'more') renderHistory();
  }));

  // Emoji & label cepat
  $('#emojiRow').addEventListener('click', e => {
    const b = e.target.closest('button[data-e]');
    if (!b) return;
    state.logoText = b.dataset.e;
    $('[data-bind="logoText"]').value = state.logoText;
    onChange();
  });
  $('#labelRow').addEventListener('click', e => {
    const b = e.target.closest('button[data-t]');
    if (!b) return;
    state.frameLabel = b.dataset.t;
    $('[data-bind="frameLabel"]').value = state.frameLabel;
    onChange();
  });

  // Logo upload
  const dz = $('#dropzone');
  $('#logoFile').addEventListener('change', e => { handleLogoFile(e.target.files[0]); e.target.value = ''; });
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', e => handleLogoFile(e.dataTransfer.files[0]));
  $('#btnRemoveLogo').addEventListener('click', () => {
    state.logoImage = null;
    renderDropzone();
    onChange();
  });

  $('#btnRandom').addEventListener('click', randomLook);
  $('#btnTheme').addEventListener('click', toggleTheme);
  $('#btnReset').addEventListener('click', () => {
    if (!confirm('Reset semua pengaturan ke bawaan? Riwayat tidak ikut terhapus.')) return;
    state = clone(DEFAULTS);
    logoCache = { key: '', url: null };
    syncUI();
    scheduleRender();
    toast('Pengaturan dikembalikan ke bawaan');
  });

  $('#btnDownload').addEventListener('click', doDownload);
  $('#btnCopy').addEventListener('click', doCopy);
  $('#btnShare').addEventListener('click', doShare);
  $('#btnSave').addEventListener('click', () => { if (saveHistoryEntry()) toast('Disimpan ke riwayat'); });

  $('#btnClearHistory').addEventListener('click', () => {
    if (!loadHistory().length) return;
    if (!confirm('Hapus semua riwayat?')) return;
    store.set(KEYS.history, []);
    renderHistory();
  });
  $('#btnBatch').addEventListener('click', runBatch);
  $('#btnExportSettings').addEventListener('click', () => {
    const payload = { app: 'QRForge', version: 1, state };
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), 'qrforge-pengaturan.json');
  });
  $('#btnImportSettings').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const obj = JSON.parse(await f.text());
      state = sanitize(obj.state || obj);
      logoCache = { key: '', url: null };
      syncUI();
      scheduleRender();
      toast('Pengaturan berhasil diimpor');
    } catch {
      toast('File pengaturan tidak valid.', 'err');
    }
  });

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      doDownload();
    }
  });
}

/* ---------- Upload logo ---------- */
function handleLogoFile(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) return toast('File harus berupa gambar.', 'warn');
  if (file.size > 8 * 1024 * 1024) return toast('Ukuran gambar maksimal 8 MB.', 'warn');
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const w0 = img.naturalWidth || 512, h0 = img.naturalHeight || 512;
      const r = Math.min(1, 400 / Math.max(w0, h0)) || 1;
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(w0 * r));
      cv.height = Math.max(1, Math.round(h0 * r));
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      state.logoImage = cv.toDataURL('image/png');
      state.logoMode = 'image';
      syncUI();
      scheduleRender();
      toast('Logo terpasang di tengah QR');
    };
    img.onerror = () => toast('Gambar tidak bisa dibaca.', 'err');
    img.src = reader.result;
  };
  reader.onerror = () => toast('Gagal membaca file.', 'err');
  reader.readAsDataURL(file);
}

/* ---------- Aksi ekspor ---------- */
function setBusy(btn, busy, textBusy) {
  if (busy) { btn.dataset.t = btn.textContent; btn.textContent = textBusy; btn.classList.add('busy'); }
  else { btn.textContent = btn.dataset.t || btn.textContent; btn.classList.remove('busy'); }
}
const errMsg = e => String(e && e.message ? e.message : e);

async function doDownload() {
  if (!canExport()) return toast('Isi data QR terlebih dahulu.', 'warn');
  const btn = $('#btnDownload');
  if (btn.classList.contains('busy')) return;
  const { exportFormat: fmt, exportSize: size } = state;
  setBusy(btn, true, 'Membuat file…');
  try {
    const blob = await exportBlob(fmt, size);
    downloadBlob(blob, `qrforge-${state.type}-${size}.${EXT[fmt]}`);
    toast(`Terunduh sebagai ${EXT[fmt].toUpperCase()}`);
    saveHistoryEntry(true);
  } catch (e) {
    toast('Gagal membuat file: ' + errMsg(e), 'err');
  } finally {
    setBusy(btn, false);
  }
}

async function doCopy() {
  if (!canExport()) return;
  if (!navigator.clipboard || !window.ClipboardItem) return toast('Browser ini belum mendukung salin gambar. Gunakan Unduh.', 'warn');
  try {
    const p = exportBlob('png', Math.min(state.exportSize, 2048));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': p })]);
    toast('QR code disalin ke clipboard');
    saveHistoryEntry(true);
  } catch (e) {
    toast('Gagal menyalin: ' + errMsg(e), 'err');
  }
}

async function doShare() {
  if (!canExport() || !navigator.share) return;
  try {
    const blob = await exportBlob('png', Math.min(state.exportSize, 2048));
    const file = new File([blob], `qrforge-${state.type}.png`, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: 'QR code' });
    else await navigator.share({ title: 'QR code', text: currentData() });
    saveHistoryEntry(true);
  } catch (e) {
    if (e && e.name !== 'AbortError') toast('Gagal membagikan: ' + errMsg(e), 'err');
  }
}

/* ---------- Riwayat ---------- */
const loadHistory = () => { const h = store.get(KEYS.history, []); return Array.isArray(h) ? h : []; };

function saveHistoryEntry(silent = false) {
  if (!canExport()) { if (!silent) toast('Isi data QR terlebih dahulu.', 'warn'); return false; }
  const src = $('#previewCanvas');
  const w = 140, h = Math.round(140 * src.height / src.width);
  const t = document.createElement('canvas');
  t.width = w; t.height = h;
  t.getContext('2d').drawImage(src, 0, 0, w, h);

  const data = currentData();
  const snap = clone(state);
  let list = loadHistory();
  if (list[0] && JSON.stringify(list[0].state) === JSON.stringify(snap)) return true;

  list.unshift({
    id: Date.now().toString(36), ts: Date.now(),
    label: `${TYPES[state.type].label}: ${data.replace(/\s+/g, ' ').slice(0, 48)}`,
    thumb: t.toDataURL('image/png'),
    state: snap
  });
  list = list.slice(0, 12);
  while (!store.set(KEYS.history, list) && list.length > 1) list.pop();
  renderHistory();
  return true;
}

function renderHistory() {
  const grid = $('#historyGrid');
  grid.textContent = '';
  const list = loadHistory();
  $('#historyEmpty').hidden = list.length > 0;
  list.forEach(item => {
    const open = el('button', {
      class: 'h-item', type: 'button', title: item.label,
      onclick: ev => {
        if (ev.target.closest('.h-del')) return;
        state = sanitize(item.state);
        logoCache = { key: '', url: null };
        syncUI();
        scheduleRender();
        toast('Riwayat dipulihkan');
      }
    }, [
      el('img', { src: item.thumb, alt: '' }),
      el('small', { text: item.label })
    ]);
    const del = el('span', {
      class: 'h-del', role: 'button', 'aria-label': 'Hapus item riwayat', tabindex: '0', text: '×',
      onclick: ev => {
        ev.stopPropagation();
        store.set(KEYS.history, loadHistory().filter(x => x.id !== item.id));
        renderHistory();
      }
    });
    open.append(del);
    grid.append(open);
  });
}

/* ---------- Batch ZIP ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function makeZip(files) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const size = f.data.length;

    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0x0800, true);
    lh.setUint16(8, 0, true);
    lh.setUint16(10, dosTime, true);
    lh.setUint16(12, dosDate, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, size, true);
    lh.setUint32(22, size, true);
    lh.setUint16(26, name.length, true);
    lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, f.data);

    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true);
    ch.setUint16(12, dosTime, true);
    ch.setUint16(14, dosDate, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, size, true);
    ch.setUint32(24, size, true);
    ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);

    offset += 30 + name.length + size;
  }
  const cdSize = central.reduce((a, p) => a + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

const slug = s => s.toLowerCase().replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'qr';

async function runBatch() {
  const lines = $('#batchInput').value.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 100);
  const status = $('#batchStatus');
  const btn = $('#btnBatch');
  if (!lines.length) return toast('Isi minimal satu baris.', 'warn');
  if (btn.classList.contains('busy')) return;

  const fmt = state.exportFormat, size = Math.min(state.exportSize, 2048);
  const files = [];
  let skipped = 0;
  setBusy(btn, true, 'Memproses…');
  try {
    for (let i = 0; i < lines.length; i++) {
      status.textContent = `Membuat ${i + 1} dari ${lines.length}…`;
      const data = state.type === 'url' ? normalizeUrl(lines[i]) : lines[i];
      try {
        const blob = await exportBlob(fmt, size, data);
        const buf = new Uint8Array(await blob.arrayBuffer());
        files.push({ name: `${String(i + 1).padStart(3, '0')}-${slug(lines[i])}.${EXT[fmt]}`, data: buf });
      } catch { skipped++; }
      await new Promise(r => setTimeout(r, 0));
    }
    if (!files.length) throw new Error('Tidak ada QR yang berhasil dibuat');
    downloadBlob(makeZip(files), 'qrforge-batch.zip');
    status.textContent = `Selesai: ${files.length} QR${skipped ? `, ${skipped} dilewati (data terlalu panjang)` : ''}.`;
    toast('ZIP batch terunduh');
  } catch (e) {
    status.textContent = '';
    toast('Batch gagal: ' + errMsg(e), 'err');
  } finally {
    setBusy(btn, false);
  }
}

/* ---------- Tema UI ---------- */
function applyTheme(t) { document.documentElement.dataset.theme = t; }
function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  store.set(KEYS.theme, next);
}

/* ---------- Init ---------- */
function init() {
  if (typeof QRCodeStyling === 'undefined') {
    document.body.prepend(el('p', { style: 'padding:24px;text-align:center', text: 'Library qr-code-styling.js tidak ditemukan. Pastikan file itu berada satu folder dengan index.html.' }));
    return;
  }
  const savedTheme = store.get(KEYS.theme, null);
  applyTheme(savedTheme || (window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));

  renderPresets();
  bindControls();
  syncUI();
  renderHistory();
  scheduleRender();

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { logoCache = { key: '', url: null }; scheduleRender(); });
  }
}

init();
