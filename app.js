'use strict';
/* 重點筆記本 — 純前端 PWA，資料存在本機 localStorage */
const KEY = 'hn.units.v1';
const TYPES = {
  vocab: { label: '生字' },
  clause: { label: '子句' },
  connective: { label: '連結詞' },
  collocation: { label: '搭配詞' }
};
const TKEYS = Object.keys(TYPES);
const CLAUSES = { noun: '名詞子句', adjective: '形容詞子句', adverb: '副詞子句' };
const POS = ['n.', 'v.', 'adj.', 'adv.', 'prep.', 'phr.'];
const FNS = ['轉折', '對比', '因果', '附加', '舉例', '讓步', '條件', '時間順序', '強調', '總結'];

const IC = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  book: '<path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3z"/><path d="M5 17a3 3 0 013-3h11"/>',
  imp: '<path d="M12 4v11"/><path d="M7.5 10.5L12 15l4.5-4.5"/><path d="M5 19.5h14"/>',
  spark: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M18.5 16.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/>',
  clip: '<rect x="8" y="3" width="8" height="4" rx="1"/><path d="M8 5H6a1 1 0 00-1 1v14a1 1 0 001 1h12a1 1 0 001-1V6a1 1 0 00-1-1h-2"/>',
  file: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/>'
};
const ic = p => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;

const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const WS = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

let units = load();
function load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(units)); } catch (e) { toast('儲存失敗：空間不足'); } }

let toastT;
function toast(msg) {
  const t = $('#toast'); if (!t) return;
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2400);
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('已複製'); }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('已複製'); } catch (e2) { toast('複製失敗，請長按選取'); }
    ta.remove();
  }
}

/* ---------- 狀態 ---------- */
const S = { u: null, tab: 'text', mode: 'view', hidden: new Set(), lastId: null, pick: null, newId: null };
let pend = null, hideT = null, barTouch = false, sheetState = {}, dip = null, closeT = null;

/* ---------- 資料模型 ---------- */
const partsOf = h => (h.parts && h.parts.length) ? h.parts : [{ s: h.s, e: h.e }];
const lenOf = h => partsOf(h).reduce((n, p) => n + p.e - p.s, 0);
const textOf = h => partsOf(h).map(p => ((S.u && S.u.paras[h.para]) || '').slice(p.s, p.e)).join(' … ');
const nameOf = h => h.type === 'collocation' ? (h.phrase || textOf(h)) : textOf(h);
const counts = u => { const c = { vocab: 0, clause: 0, connective: 0, collocation: 0 }; u.hls.forEach(h => c[h.type]++); return c; };
function labelOf(h) {
  if (h.type === 'vocab') return h.zh || '';
  if (h.type === 'clause') return CLAUSES[h.clauseType] || '';
  if (h.type === 'connective') return h.fn || '';
  return [h.phrase, h.zh].filter(Boolean).join('  ');
}
function meta(h) {
  if (h.type === 'vocab') return [h.pos, h.zh].filter(Boolean).join('  ');
  if (h.type === 'clause') return CLAUSES[h.clauseType] || '未指定類型';
  if (h.type === 'connective') return h.fn || '';
  return [h.zh, partsOf(h).length > 1 || h.phrase ? '文中：' + textOf(h) : ''].filter(Boolean).join('　');
}
const isBlank = h => h.type === 'vocab' ? !h.pos && !h.zh : h.type === 'clause' ? !h.clauseType : h.type === 'connective' ? !h.fn : !h.phrase && !h.zh;

/* ---------- 定位（精確 → 近似） ---------- */
const NORM = s => s.replace(/[’‘´`]/g, "'").replace(/[“”]/g, '"').replace(/ /g, ' ').toLowerCase();
function allIdx(hay, nd) { const r = []; let i = 0; while (nd && (i = hay.indexOf(nd, i)) >= 0) { r.push(i); i += nd.length; } return r; }
const toks = s => [...String(s).matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu)].map(m => ({ w: m[0].toLowerCase().replace('’', "'"), s: m.index, e: m.index + m[0].length }));
function lev(a, b) {
  if (a === b) return 0; const m = a.length, n = b.length; if (!m || !n) return Math.max(m, n);
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[n];
}
const tokMatch = (a, b) => a === b || (Math.min(a.length, b.length) >= 3 && lev(a, b) <= (Math.min(a.length, b.length) >= 6 ? 2 : 1));
const SLOT = /^(sb|sth|someone|something|oneself|one|ones|sb's|sth's|one's)$/;
const AUX = new Set(['be', 'being', 'been', 'get', 'getting', 'have', 'has', 'had', 'do', 'does', 'did', 'to']);
function fuzzy(ptext, needle, from) {
  let nt = toks(needle).map(t => t.w);
  while (nt.length > 1 && (AUX.has(nt[0]) || SLOT.test(nt[0]))) nt.shift();
  while (nt.length > 1 && SLOT.test(nt[nt.length - 1])) nt.pop();
  const nd = []; let gap = 0;
  for (const w of nt) { if (SLOT.test(w)) { gap = 4; continue; } nd.push({ w, gap }); gap = 0; }
  if (!nd.length) return null;
  const pt = toks(ptext);
  for (let i = 0; i < pt.length; i++) {
    if (pt[i].s < from || !tokMatch(pt[i].w, nd[0].w)) continue;
    let j = i, ok = true;
    for (let k = 1; k < nd.length; k++) {
      let f = -1;
      for (let q = j + 1; q <= j + 1 + nd[k].gap && q < pt.length; q++) if (tokMatch(pt[q].w, nd[k].w)) { f = q; break; }
      if (f < 0) { ok = false; break; }
      j = f;
    }
    if (ok) return { s: pt[i].s, e: pt[j].e };
  }
  return null;
}
function exactSeq(ptext, texts, nth) {
  const hay = NORM(ptext), first = NORM(texts[0]);
  let starts = allIdx(hay, first);
  if (!starts.length) return null;
  const k = nth >= 1 && nth <= starts.length ? nth - 1 : 0;
  starts = [...starts.slice(k), ...starts.slice(0, k)];
  for (const st of starts) {
    const out = [{ s: st, e: st + first.length }]; let from = out[0].e, ok = true;
    for (let i = 1; i < texts.length; i++) {
      const nd = NORM(texts[i]), j = nd ? hay.indexOf(nd, from) : -1;
      if (j < 0) { ok = false; break; }
      out.push({ s: j, e: j + nd.length }); from = j + nd.length;
    }
    if (ok) return out;
  }
  return null;
}
function fuzzySeq(ptext, texts) {
  const hay = NORM(ptext), out = []; let from = 0;
  for (const t of texts) {
    const nd = NORM(t), j = nd ? hay.indexOf(nd, from) : -1;
    const r = j >= 0 ? { s: j, e: j + nd.length } : fuzzy(ptext, t, from);
    if (!r) return null;
    out.push({ s: r.s, e: r.e }); from = r.e;
  }
  return out;
}
function locateParts(paras, texts, hint, nth) {
  const order = [];
  if (hint != null && hint >= 0 && hint < paras.length) order.push(hint);
  paras.forEach((_, i) => { if (i !== hint) order.push(i); });
  for (const i of order) { const r = exactSeq(paras[i], texts, i === hint ? nth : 1); if (r) return { para: i, parts: r, approx: false }; }
  for (const i of order) { const r = fuzzySeq(paras[i], texts); if (r) return { para: i, parts: r, approx: true }; }
  return null;
}

/* ---------- 匯入解析 ---------- */
function fieldsOf(type, h) {
  if (type === 'vocab') return { pos: WS(h.pos), zh: WS(h.zh) };
  if (type === 'clause') return { clauseType: clauseNorm(h.clauseType) };
  if (type === 'connective') return { fn: WS(h.fn || h['function']) };
  return { phrase: WS(h.phrase), zh: WS(h.zh) };
}
function clauseNorm(v) {
  v = String(v || '').toLowerCase();
  if (/noun|名詞/.test(v)) return 'noun';
  if (/adj|形容/.test(v)) return 'adjective';
  if (/adv|副/.test(v)) return 'adverb';
  return '';
}
function parseUnit(raw) {
  const s = String(raw).trim(), a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('找不到 JSON（內容需包含 { ... }）');
  let o;
  try { o = JSON.parse(s.slice(a, b + 1)); } catch (e) { throw new Error('JSON 格式錯誤：' + e.message); }
  let paras = o.article;
  if (typeof paras === 'string') paras = paras.split(/\n+/);
  if (!Array.isArray(paras) || !paras.length || paras.some(p => typeof p !== 'string')) throw new Error('缺少 article（段落字串陣列）');
  paras = paras.map(WS);
  const hls = [], unplaced = [], approx = [], seen = new Set(); let skipped = 0;
  for (const h of (Array.isArray(o.highlights) ? o.highlights : [])) {
    const type = h && h.type;
    if (!TKEYS.includes(type)) { skipped++; continue; }
    let texts;
    if (type === 'collocation' && Array.isArray(h.parts)) texts = h.parts.filter(x => typeof x === 'string').map(WS).filter(Boolean);
    else texts = (typeof h.text === 'string' && WS(h.text)) ? [WS(h.text)] : [];
    if (!texts.length) { skipped++; continue; }
    if (type !== 'collocation') texts = [texts[0]];
    const fields = fieldsOf(type, h);
    const loc = locateParts(paras, texts, Number.isInteger(h.para) ? h.para : null, Number.isInteger(h.nth) ? h.nth : 1);
    if (!loc) { unplaced.push(Object.assign({ id: uid(), type, texts }, fields)); continue; }
    const key = type + ':' + loc.para + ':' + loc.parts.map(p => p.s + '-' + p.e).join(',');
    if (seen.has(key)) continue; seen.add(key);
    const n = Object.assign({ id: uid(), type, para: loc.para, s: loc.parts[0].s, e: loc.parts[loc.parts.length - 1].e }, fields);
    if (type === 'collocation') n.parts = loc.parts;
    else n.e = loc.parts[0].e;
    if (loc.approx) approx.push({ type, text: texts.join(' … '), found: loc.parts.map(p => paras[loc.para].slice(p.s, p.e)).join(' … ') });
    hls.push(n);
  }
  return { unit: { id: uid(), title: WS(o.title) || '未命名單元', created: Date.now(), paras, hls, unplaced }, approx, skipped };
}
function exportObj(u) {
  const hs = u.hls.slice().sort((a, b) => a.para - b.para || a.s - b.s).map(h => {
    const para = u.paras[h.para], o = { type: h.type, para: h.para };
    if (h.type === 'collocation') { o.phrase = h.phrase || ''; o.zh = h.zh || ''; o.parts = partsOf(h).map(p => para.slice(p.s, p.e)); return o; }
    const text = para.slice(h.s, h.e), idx = allIdx(NORM(para), NORM(text));
    o.text = text; if (idx.length > 1) o.nth = Math.max(1, idx.indexOf(h.s) + 1);
    if (h.type === 'vocab') { o.pos = h.pos || ''; o.zh = h.zh || ''; }
    if (h.type === 'clause') o.clauseType = h.clauseType || '';
    if (h.type === 'connective') o.fn = h.fn || '';
    return o;
  });
  const un = (u.unplaced || []).map(it => {
    if (it.type === 'collocation') return { type: it.type, phrase: it.phrase || '', zh: it.zh || '', parts: it.texts };
    const o = { type: it.type, text: it.texts[0] };
    if (it.type === 'vocab') { o.pos = it.pos || ''; o.zh = it.zh || ''; }
    if (it.type === 'clause') o.clauseType = it.clauseType || '';
    if (it.type === 'connective') o.fn = it.fn || '';
    return o;
  });
  return { format: 'highlight-notes/v1', title: u.title, article: u.paras, highlights: hs.concat(un) };
}

/* ---------- 提示詞 ---------- */
const LEVELS = { '國中': '台灣國中生', '高中': '台灣高中生', '大學': '大學生與一般成人' };
function buildPrompt(level) {
  const who = LEVELS[level] || LEVELS['高中'], F = '`'.repeat(3);
  return `你是一位英文閱讀老師。我會附上英文文章的照片或截圖（可能有多張，請依順序合併成同一篇）。請完成：①轉錄全文 ②以「${who}」的程度標記閱讀重點 ③只輸出指定格式的 JSON。

【轉錄規則】
- article 是字串陣列，每個元素是一個段落。逐字照原文轉錄（保留拼字、大小寫、標點），不要改寫、翻譯或省略。
- 頁碼、頁首頁尾、題號、圖說等非內文請略過；看不清楚的字以 [?] 標示。

【標記類型 type（只能用這四種）】
1. "vocab" 生字、不常見字：對${who}而言較難或不常見的單字或詞組。
   - text：文章中「實際出現的樣子」（保留時態與單複數；文章寫 grew 就寫 grew，不要寫原形 grow）。
   - pos：詞性縮寫，如 n. v. adj. adv. prep. phr.
   - zh：符合本文語意的簡短繁體中文意思。
2. "clause" 名詞子句、形容詞子句、副詞子句。
   - text：整個子句，含引導詞（that, which, when, because, if…），必須與文章完全一致。
   - clauseType：只能填 "noun"、"adjective"、"adverb" 其中之一。
3. "connective" 連結詞：表達句與句邏輯關係的連接詞、連接副詞或片語（however, therefore, in addition, as a result…）。
   - text：文章中實際出現的樣子。
   - fn：邏輯功能（繁體中文），如：轉折、對比、因果、附加、舉例、讓步、條件、時間順序、強調、總結。
4. "collocation" 搭配詞：固定搭配、動詞片語、慣用句型，通常含有 sb / sth 或「…」空格的用法，例如 see…as… 把…視為…；let go of sb/sth 放開…；be caught V-ing 被發現正在…；have no interest in 對…沒有興趣。
   - phrase：字典形態（原形），用 sb / sth 代表人或事物、用 … 代表可替換的內容，例如 "see sth as sth"、"let go of sb/sth"。
   - zh：這個搭配的中文意思，用 … 表示空格，例如 "把…視為…"、"放開…"。
   - parts：字串陣列，是這個搭配「在文章中實際出現的片段」，依出現順序排列。每個片段都必須原樣出現在該段落中（保留文章裡的時態變化，不要寫原形）。sb / sth 等可替換的內容不要放進片段，所以搭配被隔開時要拆成多個片段。所有片段必須在同一個段落。
   - 範例：文章 "She saw him as a hero." → parts ["saw","as"]；文章 "He let go of the rope." → parts ["let go of"]；文章 "He had no interest in money." → parts ["had no interest in"]。

【定位規則】
- 所有 text 與 parts 都必須是該段落中「連續且完全相同」的片段，請直接從你轉錄的 article 複製，不要自行改寫或換回原形。
- para：該段落在 article 中的索引（從 0 開始）。
- nth：同一段落內 text 出現多次時，指第幾次出現（從 1 開始）；只出現一次可省略。
- 不同類型的標記可以重疊（例如搭配詞位於子句之內），但同一類型不要重複標記同一處。
- 只標真正有助於閱讀理解與考試的重點，不要為了湊數而標。

【輸出格式】只輸出一個 ${F}json 程式碼區塊，不要附加任何說明：
${F}json
{
  "format": "highlight-notes/v1",
  "title": "文章標題（沒有標題就取首句前幾個字）",
  "article": [
    "It is clear that technology has become ubiquitous.",
    "However, she saw him as a hero and let go of the rope."
  ],
  "highlights": [
    {"type": "vocab", "para": 0, "text": "ubiquitous", "pos": "adj.", "zh": "無所不在的"},
    {"type": "clause", "para": 0, "text": "that technology has become ubiquitous", "clauseType": "noun"},
    {"type": "connective", "para": 1, "text": "However", "fn": "轉折"},
    {"type": "collocation", "para": 1, "phrase": "see sth as sth", "zh": "把…視為…", "parts": ["saw", "as"]},
    {"type": "collocation", "para": 1, "phrase": "let go of sb/sth", "zh": "放開…", "parts": ["let go of"]}
  ]
}
${F}`;
}

/* ---------- 路由 ---------- */
function route() {
  const h = location.hash.slice(1) || '/';
  const m = h.match(/^\/u\/(\w+)/);
  closeSheet({ instant: true }); S.u = null; S.pick = null; pend = null;
  window.scrollTo(0, 0);
  if (m) { const u = units.find(x => x.id === m[1]); if (u) return viewUnit(u); location.hash = '#/'; return; }
  if (h === '/prompt') return viewPrompt();
  if (h === '/import') return viewImport();
  viewHome();
}
addEventListener('hashchange', route);
addEventListener('beforeinstallprompt', e => { e.preventDefault(); dip = e; const b = $('#inst'); if (b) b.hidden = false; });

const nav = a => `<nav class="nav">
  <a class="nb ${a === 'home' ? 'on' : ''}" href="#/">${ic(IC.book)}<span>單元</span></a>
  <a class="nb ${a === 'import' ? 'on' : ''}" href="#/import">${ic(IC.imp)}<span>匯入</span></a>
  <a class="nb ${a === 'prompt' ? 'on' : ''}" href="#/prompt">${ic(IC.spark)}<span>提示詞</span></a></nav>`;

/* ---------- 首頁 ---------- */
function viewHome() {
  const n = units.length;
  const cards = units.map((u, i) => {
    const c = counts(u), total = u.hls.length;
    return `<a class="ucard" href="#/u/${u.id}" style="--i:${i}"><b>${esc(u.title)}</b><p class="ex">${esc((u.paras[0] || '').slice(0, 120))}</p>
      <div class="bar">${total ? TKEYS.filter(t => c[t]).map(t => `<i class="${t}" style="--n:${c[t]}"></i>`).join('') : '<i style="--n:1;background:var(--line)"></i>'}</div>
      <div class="cnts">${TKEYS.map(t => `<span><i class="sw ${t}"></i>${c[t]}</span>`).join('')}<em>${new Date(u.created).toLocaleDateString('zh-TW')}</em></div></a>`;
  }).join('');
  const empty = `<div class="emptybox"><svg viewBox="0 0 120 120" fill="none"><rect x="22" y="18" width="76" height="86" rx="12" fill="var(--surface)" stroke="var(--line)" stroke-width="2"/><rect x="34" y="40" width="46" height="10" rx="3" fill="var(--m-vocab)"/><rect x="34" y="60" width="52" height="10" rx="3" fill="var(--m-collocation)"/><rect x="34" y="80" width="34" height="10" rx="3" fill="var(--m-connective)"/><path d="M30 30h30" stroke="var(--mut)" stroke-width="3" stroke-linecap="round"/></svg>
    <h2>還沒有單元</h2><div>先複製提示詞給你的 AI，<br>再把回傳的 JSON 匯入。</div>
    <div class="row2"><a class="btn pri" href="#/prompt">取得提示詞</a><a class="btn" href="#/import">匯入</a></div></div>`;
  $('#app').innerHTML = `<div class="view"><header class="hero"><h1>重點筆記本</h1><p>${n ? n + ' 個單元' : '把 AI 劃好的英文重點變成筆記'}</p><button class="pill" id="inst" hidden>安裝 App</button></header>
    <main>${n ? cards : empty}${n ? '<p class="hint">安裝：iPhone 用 Safari「分享 → 加入主畫面」；Android Chrome 用選單「安裝應用程式」</p>' : ''}</main></div>${nav('home')}`;
  const b = $('#inst'); b.hidden = !dip;
  b.onclick = async () => { if (!dip) return; dip.prompt(); await dip.userChoice; dip = null; b.hidden = true; };
}

/* ---------- 提示詞頁 ---------- */
function viewPrompt() {
  let level = localStorage.getItem('hn.level') || '高中';
  const lvs = Object.keys(LEVELS);
  $('#app').innerHTML = `<div class="view"><header class="hero sm"><h1>AI 提示詞</h1><p>複製給你的 AI，並附上文章照片</p></header><main>
    <ol class="steps"><li style="--i:0"><b>1</b><span>複製提示詞，貼到你的 AI</span></li><li style="--i:1"><b>2</b><span>同時附上英文文章的照片或截圖</span></li><li style="--i:2"><b>3</b><span>複製 AI 回傳的 JSON，到「匯入」貼上</span></li></ol>
    <div class="card2"><div class="row2 between"><span class="mut">標記程度</span><div class="seg" id="lv" style="--n:${lvs.length};--i:${lvs.indexOf(level)}">${lvs.map(k => `<button class="${k === level ? 'on' : ''}" data-lv="${k}">${k}</button>`).join('')}</div></div>
    <button class="btn pri lg" id="cp" style="margin-top:0">${ic(IC.copy)}複製提示詞</button></div>
    <details class="card2"><summary>預覽提示詞內容</summary><pre class="prompt" id="pt"></pre></details></main></div>${nav('prompt')}`;
  const upd = () => { $('#pt').textContent = buildPrompt(level); };
  upd();
  $('#lv').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    level = b.dataset.lv; localStorage.setItem('hn.level', level);
    $('#lv').style.setProperty('--i', lvs.indexOf(level));
    $('#lv').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); upd();
  };
  $('#cp').onclick = () => copy(buildPrompt(level));
}

/* ---------- 匯入頁 ---------- */
function viewImport() {
  $('#app').innerHTML = `<div class="view"><header class="hero sm"><h1>匯入單元</h1><p>貼上 AI 回傳的 JSON，或選擇 .json 檔</p></header><main>
    <div class="card2"><textarea id="jtxt" placeholder='{ "format": "highlight-notes/v1", ... }' spellcheck="false"></textarea>
    <div class="row2"><button class="btn" id="paste">${ic(IC.clip)}貼上</button><button class="btn" id="pick">${ic(IC.file)}選擇檔案</button></div></div>
    <input type="file" id="file" accept=".json,application/json,text/plain" hidden>
    <button class="btn pri lg" id="go">匯入</button></main></div>${nav('import')}`;
  $('#paste').onclick = async () => { try { $('#jtxt').value = await navigator.clipboard.readText(); } catch (e) { toast('無法讀取剪貼簿，請長按貼上'); } };
  $('#pick').onclick = () => $('#file').click();
  $('#file').onchange = async e => { const f = e.target.files[0]; if (f) $('#jtxt').value = await f.text(); };
  $('#go').onclick = () => {
    let r;
    try { r = parseUnit($('#jtxt').value); } catch (e) { toast(e.message); return; }
    const u = r.unit;
    units.unshift(u); save();
    if (!r.approx.length && !u.unplaced.length && !r.skipped) { toast(`已匯入 ${u.hls.length} 個重點`); location.hash = '#/u/' + u.id; return; }
    openSheet(`<div class="grab"></div><p><b>已匯入 ${u.hls.length} 個重點</b></p>
      ${r.approx.length ? `<p class="mut">以下 ${r.approx.length} 個與原文略有出入，已自動對應到最接近的位置（請確認）：</p><ul class="rep">${r.approx.map(x => `<li>${esc(TYPES[x.type].label)}：${esc(x.text)} → <b>${esc(x.found)}</b></li>`).join('')}</ul>` : ''}
      ${u.unplaced.length ? `<p class="mut">以下 ${u.unplaced.length} 個找不到對應位置，已放進單元的「未定位」清單，可在編輯模式手動對應：</p><ul class="rep">${u.unplaced.map(x => `<li>${esc(TYPES[x.type].label)}：${esc(x.texts.join(' … '))}</li>`).join('')}</ul>` : ''}
      ${r.skipped ? `<p class="mut">另有 ${r.skipped} 筆格式不符而略過。</p>` : ''}
      <div class="menu"><a class="btn pri" href="#/u/${u.id}">前往單元</a></div>`);
  };
}

/* ---------- 單元頁 ---------- */
function viewUnit(u) {
  u.unplaced = u.unplaced || [];
  S.u = u;
  if (S.lastId !== u.id) { S.tab = 'text'; S.mode = 'view'; S.lastId = u.id; S.pick = null; }
  $('#app').innerHTML = `<div class="view" id="uv"><header class="top"><a class="iconbtn" href="#/" aria-label="返回">${ic(IC.back)}</a><h1>${esc(u.title)}</h1><button class="modebtn" id="mode"></button><button class="iconbtn" id="menu" aria-label="選單">${ic(IC.more)}</button></header>
    <div class="banner" id="banner"></div>
    <div class="toolbar"><div class="seg" id="tabs"><button data-tab="text">文章</button><button data-tab="list">重點清單</button></div></div>
    <div class="legend" id="legend"></div>
    <div id="body"></div></div><div id="addbar" hidden></div>`;
  $('#mode').onclick = () => setMode(S.mode === 'edit' ? 'view' : 'edit');
  $('#menu').onclick = unitMenu;
  $('#tabs').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.tab = b.dataset.tab; renderUnit(); };
  $('#legend').onclick = e => {
    const b = e.target.closest('.chip'); if (!b) return;
    const t = b.dataset.t; S.hidden.has(t) ? S.hidden.delete(t) : S.hidden.add(t); renderUnit();
  };
  $('#body').onclick = bodyClick;
  const bar = $('#addbar');
  bar.addEventListener('mousedown', e => e.preventDefault());
  bar.addEventListener('pointerdown', () => { barTouch = true; clearTimeout(hideT); });
  bar.addEventListener('pointerup', () => setTimeout(() => { barTouch = false; }, 700));
  bar.addEventListener('pointercancel', () => { barTouch = false; });
  bar.onclick = onBarClick;
  renderUnit();
}

function setMode(m) {
  S.mode = m; S.pick = null; hideBar(); renderUnit();
}
const pickText = () => {
  const pk = S.pick, u = S.u; if (!pk) return '';
  if (pk.mode === 'more') { const h = u.hls.find(x => x.id === pk.id); return `請選取「${h ? nameOf(h) : ''}」的另一段文字`; }
  const it = u.unplaced.find(x => x.id === pk.id); return `請在文章中選取要對應「${it ? it.texts.join(' … ') : ''}」的原文`;
};
function updateModeUi() {
  const m = $('#mode'); if (!m) return;
  m.innerHTML = S.mode === 'edit' ? ic(IC.check) + '完成' : ic(IC.edit) + '編輯';
  const b = $('#banner');
  if (S.pick) {
    b.className = 'banner pick'; b.innerHTML = `<span>${esc(pickText())}</span><button class="btn sm" id="pcancel">取消</button>`;
    $('#pcancel').onclick = () => { S.pick = null; hideBar(); updateModeUi(); };
  } else { b.className = 'banner'; b.innerHTML = '<span>編輯模式：選取文字可新增重點，點螢光處可修改</span>'; }
}

function renderUnit() {
  const u = S.u, c = counts(u);
  $('#uv').classList.toggle('is-edit', S.mode === 'edit');
  $('#legend').innerHTML = TKEYS.map(t => `<button class="chip ${S.hidden.has(t) ? 'off' : ''}" data-t="${t}"><i class="sw ${t}"></i>${TYPES[t].label}<b>${c[t]}</b></button>`).join('');
  const tabs = $('#tabs'); tabs.style.setProperty('--i', S.tab === 'text' ? 0 : 1);
  tabs.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
  $('#body').innerHTML = S.tab === 'text' ? textHtml(u) : listHtml(u);
  updateModeUi();
  if (S.tab !== 'text' || S.mode !== 'edit') hideBar();
  if (S.tab === 'text') layoutSoon();
}

function textHtml(u) {
  const ps = u.paras.map((p, i) => {
    if (!p) return '';
    const h = paraHtml(u, i);
    return `<p class="para${h.includes('class="anc"') ? '' : ' nolab'}" data-i="${i}">${h}</p>`;
  }).join('');
  return `<div class="paper">${ps}</div><p class="tip">${S.mode === 'edit' ? '選取文字即可新增重點；點螢光處可修改或刪除' : '點螢光處可查看詳細；要修改請按右上角「編輯」'}</p>`;
}

function paraHtml(u, i) {
  const text = u.paras[i], len = text.length;
  const hls = u.hls.filter(h => h.para === i && !S.hidden.has(h.type));
  if (!hls.length) return esc(text);
  const cuts = new Set([0, len]);
  hls.forEach(h => partsOf(h).forEach(p => { cuts.add(Math.max(0, p.s)); cuts.add(Math.min(len, p.e)); }));
  const pts = [...cuts].sort((a, b) => a - b);
  const covers = (h, a, b) => partsOf(h).some(p => p.s <= a && p.e >= b);
  const starts = {};
  hls.forEach(h => { const lab = labelOf(h); if (lab) { const s = partsOf(h)[0].s; (starts[s] = starts[s] || []).push({ h, lab }); } });
  let out = '';
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1], seg = text.slice(a, b);
    if (starts[a]) {
      out += `<span class="anc" aria-hidden="true"><span class="tgs">${starts[a].sort((x, y) => lenOf(x.h) - lenOf(y.h)).map(x => `<span class="tg ${x.h.type}" data-tg="${esc(x.lab)}"></span>`).join('')}</span></span>`;
    }
    const cov = hls.filter(h => covers(h, a, b)).sort((x, y) => lenOf(x) - lenOf(y));
    if (!cov.length) {
      const g = hls.find(h => h.type === 'collocation' && partsOf(h).length > 1 && h.s <= a && h.e >= b);
      out += g ? `<span class="gap" data-ids="${g.id}">${esc(seg)}</span>` : esc(seg);
      continue;
    }
    const main = cov[0], extra = cov.slice(1), layers = [], sizes = [], pos = [];
    extra.forEach((x, j) => { layers.push(`linear-gradient(var(--s-${x.type}),var(--s-${x.type}))`); sizes.push('100% 2px'); pos.push(`0 calc(100% - ${j * 3}px)`); });
    layers.push(`linear-gradient(transparent 26%,var(--m-${main.type}) 26%,var(--m-${main.type}) 94%,transparent 94%)`); sizes.push('100% 100%'); pos.push('0 0');
    out += `<span class="hl ${main.type}" data-ids="${cov.map(x => x.id).join(',')}" style="background-image:${layers.join(',')};background-size:${sizes.join(',')};background-position:${pos.join(',')};background-repeat:no-repeat">${esc(seg)}</span>`;
  }
  return out;
}

/* 標註之間避免互相覆蓋 */
let layoutRaf = 0;
function layoutSoon() { cancelAnimationFrame(layoutRaf); layoutRaf = requestAnimationFrame(layoutLabels); }
function layoutLabels() {
  const body = $('#body'); if (!body) return;
  const ancs = [...body.querySelectorAll('.anc')];
  ancs.forEach(a => { a.style.marginLeft = ''; a.firstChild.classList.remove('rt'); });
  const paper = body.querySelector('.paper');
  const right = (paper ? paper.getBoundingClientRect().right : innerWidth) - 12;
  let prev = null;
  for (const a of ancs) {
    const t = a.firstChild, w = t.getBoundingClientRect().width;
    let r = a.getBoundingClientRect();
    if (prev && Math.abs(r.top - prev.top) < 10 && r.left < prev.right + 8) {
      a.style.marginLeft = (prev.right + 8 - r.left) + 'px'; r = a.getBoundingClientRect();
    }
    if (r.left + w > right) { t.classList.add('rt'); prev = { top: r.top, right: r.left }; }
    else prev = { top: r.top, right: r.left + w };
  }
}
addEventListener('resize', layoutSoon);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(layoutSoon);

function listHtml(u) {
  let out = '';
  for (const t of TKEYS) {
    if (S.hidden.has(t)) continue;
    const L = u.hls.filter(h => h.type === t).sort((a, b) => a.para - b.para || a.s - b.s);
    if (!L.length) continue;
    out += `<section class="grp"><h2><i class="sw ${t}"></i>${TYPES[t].label}<small>${L.length}</small></h2><ul class="items">${L.map(h => `<li data-id="${h.id}"><span class="w ${t}">${esc(nameOf(h))}</span><span class="m">${esc(meta(h))}</span></li>`).join('')}</ul></section>`;
  }
  if (u.unplaced.length) {
    out += `<section class="grp"><h2>⚠ 未定位<small>${u.unplaced.length}</small></h2><p class="note">這些重點在文章中找不到對應位置${S.mode === 'edit' ? '，點選後可手動對應原文' : '，切換到「編輯」可手動對應'}。</p><ul class="items">${u.unplaced.map(it => `<li data-un="${it.id}"><span class="w ${it.type}">${esc(it.type === 'collocation' && it.phrase ? it.phrase : it.texts.join(' … '))}</span><span class="m">${esc([it.pos, it.zh, it.clauseType && CLAUSES[it.clauseType], it.fn].filter(Boolean).join('  '))}</span></li>`).join('')}</ul></section>`;
  }
  return `<div class="paper">${out || '<p class="empty">沒有重點</p>'}</div>`;
}

function bodyClick(e) {
  const u = S.u, open = S.mode === 'edit' ? openCards : openDetail;
  const el = e.target.closest('[data-ids]');
  if (el) {
    const sel = getSelection(); if (sel && !sel.isCollapsed) return;
    const list = el.dataset.ids.split(',').map(id => u.hls.find(h => h.id === id)).filter(Boolean);
    if (list.length) open(list);
    return;
  }
  const li = e.target.closest('li[data-id]');
  if (li) { const h = u.hls.find(x => x.id === li.dataset.id); if (h) open([h]); return; }
  const un = e.target.closest('li[data-un]');
  if (un) {
    const it = u.unplaced.find(x => x.id === un.dataset.un); if (!it) return;
    if (S.mode !== 'edit') { toast('請先切換到「編輯」再手動對應'); return; }
    openUnplaced(it);
  }
}

/* ---------- 選取文字（僅編輯模式） ---------- */
const paraOf = n => { const el = n && (n.nodeType === 1 ? n : n.parentElement); return el && el.closest ? el.closest('#body .para') : null; };
function off(p, node, o) { const r = document.createRange(); r.selectNodeContents(p); r.setEnd(node, o); return r.toString().length; }
function hideBar() { const b = $('#addbar'); if (b) b.hidden = true; pend = null; }
document.addEventListener('selectionchange', () => {
  const bar = $('#addbar');
  if (!bar || !S.u || S.tab !== 'text' || S.mode !== 'edit') return;
  const sel = getSelection();
  const later = () => { clearTimeout(hideT); hideT = setTimeout(() => { if (!barTouch) hideBar(); }, 250); };
  if (!sel || sel.isCollapsed || !sel.rangeCount) return later();
  const r = sel.getRangeAt(0), p1 = paraOf(r.startContainer), p2 = paraOf(r.endContainer);
  if (!p1 || p1 !== p2) return later();
  clearTimeout(hideT);
  const i = +p1.dataset.i, str = S.u.paras[i];
  let s = off(p1, r.startContainer, r.startOffset), e = off(p1, r.endContainer, r.endOffset);
  while (s < e && /\s/.test(str[s])) s++;
  while (e > s && /\s/.test(str[e - 1])) e--;
  if (e <= s) return;
  if (pend && pend.para === i && pend.s === s && pend.e === e && !bar.hidden) return;
  pend = { para: i, s, e };
  const ex = str.slice(s, e);
  const btns = S.pick
    ? `<button class="addb pickb" data-pick="1">${S.pick.mode === 'more' ? '加入這一段' : '對應到這裡'}</button>`
    : TKEYS.map(t => `<button class="addb ${t}" data-add="${t}">${TYPES[t].label}</button>`).join('');
  bar.innerHTML = `<div class="sel">「${esc(ex.length > 60 ? ex.slice(0, 60) + '…' : ex)}」${S.pick ? '' : '加入為：'}</div><div class="btns">${btns}</div>`;
  bar.hidden = false;
});

function onBarClick(e) {
  const b = e.target.closest('button'); if (!b || !pend) return;
  const p = pend; clearTimeout(hideT); barTouch = false;
  const sel = getSelection(); if (sel) sel.removeAllRanges();
  if (b.dataset.pick) return applyPick(p);
  const t = b.dataset.add, h = { id: uid(), type: t, para: p.para, s: p.s, e: p.e };
  if (t === 'vocab') { h.pos = ''; h.zh = ''; }
  if (t === 'clause') h.clauseType = '';
  if (t === 'connective') h.fn = '';
  if (t === 'collocation') { h.parts = [{ s: p.s, e: p.e }]; h.phrase = ''; h.zh = ''; }
  S.u.hls.push(h); save(); renderUnit(); openCards([h], true);
}

function applyPick(p) {
  const u = S.u, pk = S.pick;
  if (pk.mode === 'more') {
    const h = u.hls.find(x => x.id === pk.id);
    if (!h) { S.pick = null; updateModeUi(); return; }
    if (p.para !== h.para) { toast('需與前一段在同一個段落'); return; }
    const ps = partsOf(h).map(x => ({ s: x.s, e: x.e }));
    if (ps.some(x => p.s < x.e && p.e > x.s)) { toast('與已選取的片段重疊'); return; }
    ps.push({ s: p.s, e: p.e }); ps.sort((a, b) => a.s - b.s);
    h.parts = ps; h.s = ps[0].s; h.e = ps[ps.length - 1].e;
    S.pick = null; save(); renderUnit(); openCards([h]);
  } else {
    const it = u.unplaced.find(x => x.id === pk.id);
    if (!it) { S.pick = null; updateModeUi(); return; }
    const h = { id: uid(), type: it.type, para: p.para, s: p.s, e: p.e };
    if (it.type === 'vocab') { h.pos = it.pos || ''; h.zh = it.zh || ''; }
    if (it.type === 'clause') h.clauseType = it.clauseType || '';
    if (it.type === 'connective') h.fn = it.fn || '';
    if (it.type === 'collocation') { h.parts = [{ s: p.s, e: p.e }]; h.phrase = it.phrase || ''; h.zh = it.zh || ''; }
    u.hls.push(h); u.unplaced = u.unplaced.filter(x => x.id !== it.id);
    S.pick = null; save(); renderUnit();
    toast(it.type === 'collocation' && it.texts.length > 1 ? '已對應，可再「加選另一段」' : '已對應');
    openCards([h]);
  }
}

/* ---------- 底部面板 ---------- */
function openSheet(html) {
  clearTimeout(closeT);
  const w = $('#sheetwrap'); w.classList.remove('out'); w.hidden = false;
  w.innerHTML = `<div class="backdrop"></div><div class="sheet">${html}</div>`;
}
function closeSheet(opt) {
  const w = $('#sheetwrap'); if (!w || w.hidden) return;
  opt = opt || {};
  if (S.newId && !opt.keep && S.u) {
    const h = S.u.hls.find(x => x.id === S.newId);
    if (h && isBlank(h)) { S.u.hls = S.u.hls.filter(x => x !== h); save(); if (!opt.instant) renderUnit(); }
  }
  S.newId = null;
  clearTimeout(closeT);
  if (opt.instant) { w.hidden = true; w.innerHTML = ''; w.classList.remove('out'); return; }
  w.classList.add('out');
  closeT = setTimeout(() => { w.hidden = true; w.innerHTML = ''; w.classList.remove('out'); }, 200);
}

function fieldsHtml(h) {
  if (h.type === 'vocab') return `<label class="fl">詞性</label><div class="qs">${POS.map(x => `<button class="q" data-fill="${x}" data-for="f-pos">${x}</button>`).join('')}</div><input class="inp f-pos" value="${esc(h.pos)}" placeholder="n. / v. / adj. / adv."><label class="fl">中文意思</label><input class="inp f-zh" value="${esc(h.zh)}" placeholder="符合本文語意的中文翻譯">`;
  if (h.type === 'clause') return `<label class="fl">子句類型</label><div class="cls">${Object.entries(CLAUSES).map(([k, v]) => `<button class="cl ${h.clauseType === k ? 'on' : ''}" data-clause="${k}">${v}</button>`).join('')}</div>`;
  if (h.type === 'connective') return `<label class="fl">邏輯功能</label><div class="qs">${FNS.map(x => `<button class="q" data-fill="${x}" data-for="f-fn">${x}</button>`).join('')}</div><input class="inp f-fn" value="${esc(h.fn)}" placeholder="轉折 / 因果 / 附加…">`;
  const ps = partsOf(h), para = (S.u && S.u.paras[h.para]) || '';
  return `<label class="fl">搭配（字典形態，可用 sb / sth / …）</label><input class="inp f-phrase" value="${esc(h.phrase)}" placeholder="例：see sth as sth"><label class="fl">中文意思</label><input class="inp f-zh" value="${esc(h.zh)}" placeholder="例：把…視為…">
    <label class="fl">在文中的片段</label><div class="pcs">${ps.map((p, i) => `<span class="pc">${esc(para.slice(p.s, p.e))}${ps.length > 1 ? `<button data-rmpart="${i}" aria-label="移除">✕</button>` : ''}</span>`).join('')}<button class="btn sm" data-act="more">＋ 加選另一段</button></div>`;
}
function cardHtml(h, isNew) {
  return `<section class="card ${h.type}" data-id="${h.id}" data-new="${isNew ? 1 : 0}">
    <div class="tsel">${TKEYS.map(t => `<button class="tchip ${t} ${t === h.type ? 'on' : ''}" data-type="${t}">${TYPES[t].label}</button>`).join('')}</div>
    <div class="ctext2">${esc(textOf(h))}</div><div class="fields">${fieldsHtml(h)}</div>
    <div class="cact">${isNew ? '' : '<button class="btn danger" data-act="del">刪除</button>'}<button class="btn pri" data-act="save">${isNew ? '新增' : '儲存'}</button></div></section>`;
}
function openCards(list, isNew) {
  hideBar(); sheetState = {}; S.newId = isNew ? list[0].id : null;
  list.forEach(h => { sheetState[h.id] = JSON.parse(JSON.stringify(h)); });
  openSheet('<div class="grab"></div>' + list.map(h => cardHtml(sheetState[h.id], isNew)).join(''));
}
function readCard(card, d) {
  const g = s => card.querySelector(s);
  if (g('.f-pos')) d.pos = WS(g('.f-pos').value);
  if (g('.f-zh')) d.zh = WS(g('.f-zh').value);
  if (g('.f-fn')) d.fn = WS(g('.f-fn').value);
  if (g('.f-phrase')) d.phrase = WS(g('.f-phrase').value);
  const cl = g('.cl.on'); if (g('.cls')) d.clauseType = cl ? cl.dataset.clause : '';
}
function commitCard(card) {
  const id = card.dataset.id, d = sheetState[id], u = S.u;
  readCard(card, d);
  const ps = partsOf(d), c = { id, type: d.type, para: d.para };
  if (d.type === 'collocation') { c.parts = ps.map(p => ({ s: p.s, e: p.e })); c.s = ps[0].s; c.e = ps[ps.length - 1].e; c.phrase = d.phrase || ''; c.zh = d.zh || ''; }
  else {
    c.s = ps[0].s; c.e = ps[0].e;
    if (d.type === 'vocab') { c.pos = d.pos || ''; c.zh = d.zh || ''; }
    if (d.type === 'clause') c.clauseType = d.clauseType || '';
    if (d.type === 'connective') c.fn = d.fn || '';
  }
  const i = u.hls.findIndex(h => h.id === id);
  if (i >= 0) u.hls[i] = c; else u.hls.push(c);
  if (S.newId === id) S.newId = null;
  card.dataset.new = '0'; save(); renderUnit();
  return c;
}

function openDetail(list) {
  const rows = h => {
    const r = (k, v) => v ? `<div class="dr"><b>${k}</b><span>${esc(v)}</span></div>` : '';
    if (h.type === 'vocab') return r('詞性', h.pos) + r('中文意思', h.zh);
    if (h.type === 'clause') return r('子句類型', CLAUSES[h.clauseType]);
    if (h.type === 'connective') return r('邏輯功能', h.fn);
    return r('搭配', h.phrase) + r('中文意思', h.zh) + (partsOf(h).length > 1 ? r('文中片段', textOf(h)) : '');
  };
  openSheet('<div class="grab"></div>' + list.map(h => `<section class="dcard ${h.type}"><span class="tag ${h.type}">${TYPES[h.type].label}</span><div class="dt">${esc(h.type === 'collocation' ? textOf(h) : textOf(h))}</div>${rows(h) || '<p class="mut">尚無說明，切換到「編輯」可補充。</p>'}</section>`).join(''));
}
function openUnplaced(it) {
  openSheet(`<div class="grab"></div><section class="card ${it.type}"><span class="tag ${it.type}">${TYPES[it.type].label}</span><div class="ctext2">${esc(it.texts.join(' … '))}</div>
    ${it.phrase ? `<div class="dr"><b>搭配</b><span>${esc(it.phrase)}</span></div>` : ''}${it.zh ? `<div class="dr"><b>中文意思</b><span>${esc(it.zh)}</span></div>` : ''}
    <p class="mut">在文章中找不到這段文字（可能與原文拼寫、時態不同）。可以選取原文手動對應，或刪除。</p>
    <div class="cact"><button class="btn danger" data-un-act="del" data-uid="${it.id}">刪除</button><button class="btn pri" data-un-act="assign" data-uid="${it.id}">選取原文對應</button></div></section>`);
}
function unitMenu() {
  openSheet(`<div class="grab"></div><div class="menu"><button class="btn" data-m="rename">重新命名</button><button class="btn" data-m="export">匯出 JSON</button><button class="btn danger" data-m="del">刪除單元</button></div>`);
}

const sw = $('#sheetwrap');
sw.addEventListener('click', e => {
  if (e.target.classList.contains('backdrop')) return closeSheet();
  const u = S.u, t = e.target;
  const m = t.closest('[data-m]');
  if (m && u) {
    if (m.dataset.m === 'rename') {
      const n = prompt('單元名稱', u.title);
      if (n && WS(n)) { u.title = WS(n); save(); closeSheet(); const h1 = document.querySelector('.top h1'); if (h1) h1.textContent = u.title; }
    } else if (m.dataset.m === 'export') {
      const blob = new Blob([JSON.stringify(exportObj(u), null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = (u.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40) || 'unit') + '.json';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); closeSheet();
    } else if (confirm('刪除整個單元「' + u.title + '」？無法復原。')) {
      units = units.filter(x => x.id !== u.id); save(); closeSheet({ instant: true }); location.hash = '#/';
    }
    return;
  }
  const ua = t.closest('[data-un-act]');
  if (ua && u) {
    const it = u.unplaced.find(x => x.id === ua.dataset.uid); if (!it) return;
    if (ua.dataset.unAct === 'del') { u.unplaced = u.unplaced.filter(x => x !== it); save(); closeSheet(); renderUnit(); }
    else { S.pick = { mode: 'assign', id: it.id }; S.mode = 'edit'; S.tab = 'text'; closeSheet(); renderUnit(); }
    return;
  }
  const card = t.closest('.card'); if (!card || !card.dataset.id || !u) return;
  const id = card.dataset.id, d = sheetState[id]; if (!d) return;
  const q = t.closest('.q');
  if (q) { const inp = card.querySelector('.' + q.dataset.for); if (inp) { inp.value = q.dataset.fill; inp.focus(); } return; }
  const cl = t.closest('.cl');
  if (cl) { card.querySelectorAll('.cl').forEach(x => x.classList.toggle('on', x === cl)); return; }
  const tc = t.closest('.tchip');
  if (tc) {
    readCard(card, d); d.type = tc.dataset.type;
    card.className = 'card ' + d.type;
    card.querySelectorAll('.tchip').forEach(x => x.classList.toggle('on', x === tc));
    card.querySelector('.fields').innerHTML = fieldsHtml(d); return;
  }
  const rp = t.closest('[data-rmpart]');
  if (rp) { readCard(card, d); const ps = partsOf(d).slice(); ps.splice(+rp.dataset.rmpart, 1); d.parts = ps; d.s = ps[0].s; d.e = ps[ps.length - 1].e; card.querySelector('.fields').innerHTML = fieldsHtml(d); card.querySelector('.ctext2').textContent = textOf(d); return; }
  const act = t.closest('[data-act]'); if (!act) return;
  if (act.dataset.act === 'del') {
    if (!confirm('刪除這個重點？')) return;
    u.hls = u.hls.filter(h => h.id !== id); save(); card.remove(); renderUnit();
    if (!sw.querySelector('.card')) closeSheet();
  } else if (act.dataset.act === 'save') {
    commitCard(card); toast('已儲存');
    if (sw.querySelectorAll('.card').length <= 1) closeSheet();
  } else if (act.dataset.act === 'more') {
    const c = commitCard(card);
    S.pick = { mode: 'more', id: c.id }; closeSheet({ keep: true }); renderUnit();
    toast('請在文章中選取另一段文字');
  }
});

/* ---------- 點擊波紋 ---------- */
document.addEventListener('pointerdown', e => {
  const el = e.target.closest && e.target.closest('.btn,.iconbtn,.nb,.chip,.addb,.tchip,.q,.cl,.seg button,.modebtn');
  if (!el || (matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
  const r = el.getBoundingClientRect(), s = Math.max(r.width, r.height) * 2;
  const sp = document.createElement('span'); sp.className = 'rip';
  sp.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
  el.appendChild(sp); setTimeout(() => sp.remove(), 650);
}, { passive: true });

if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
route();
