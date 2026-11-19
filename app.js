'use strict';
/* 重點筆記本 — 純前端 PWA，資料存在本機 localStorage */
const KEY = 'hn.units.v1';
const TYPES = {
  vocab: { label: '生字' },
  clause: { label: '子句' },
  connective: { label: '連結詞' },
  collocation: { label: '搭配詞' }
};
const CLAUSES = { noun: '名詞子句', adjective: '形容詞子句', adverb: '副詞子句' };
const FNS = ['轉折', '對比', '因果', '附加', '舉例', '讓步', '條件', '時間順序', '強調', '總結', '目的', '比較'];

const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

let units = load();
function load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(units)); } catch (e) { toast('儲存失敗：空間不足'); } }

let toastT;
function toast(msg) {
  const t = $('#toast'); if (!t) return;
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2200);
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('已複製'); }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('已複製'); } catch (e2) { toast('複製失敗，請長按選取'); }
    ta.remove();
  }
}

/* ---------- 資料處理 ---------- */
const textOf = h => (ctx.u && ctx.u.paras[h.para] || '').slice(h.s, h.e);
const counts = u => { const c = { vocab: 0, clause: 0, connective: 0, collocation: 0 }; u.hls.forEach(h => c[h.type]++); return c; };
const meta = h => h.type === 'vocab' ? [h.pos, h.zh].filter(Boolean).join(' ')
  : h.type === 'clause' ? (CLAUSES[h.clauseType] || '未指定類型')
  : h.type === 'connective' ? (h.fn || '') : '';

const NORM = s => s.replace(/[’‘´`]/g, "'").replace(/[“”]/g, '"').toLowerCase();
const WS = s => String(s).replace(/\s+/g, ' ').trim();
function allIdx(hay, nd) { const r = []; let i = 0; while ((i = hay.indexOf(nd, i)) >= 0) { r.push(i); i += nd.length; } return r; }
function locate(paras, text, para, nth) {
  const nd = NORM(text); if (!nd) return null;
  const order = [];
  if (para != null && para >= 0 && para < paras.length) order.push(para);
  paras.forEach((_, i) => { if (i !== para) order.push(i); });
  for (const i of order) {
    const idx = allIdx(NORM(paras[i]), nd);
    if (idx.length) {
      const k = (i === para && nth >= 1 && nth <= idx.length) ? nth - 1 : 0;
      return { para: i, s: idx[k], e: idx[k] + nd.length };
    }
  }
  return null;
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
  const hls = [], bad = [], seen = new Set();
  for (const h of (Array.isArray(o.highlights) ? o.highlights : [])) {
    const type = h && h.type, text = h && typeof h.text === 'string' ? WS(h.text) : '';
    if (!TYPES[type] || !text) { bad.push({ type: type || '?', text: text || '(空)', why: '類型或文字無效' }); continue; }
    const pos = locate(paras, text, Number.isInteger(h.para) ? h.para : null, Number.isInteger(h.nth) ? h.nth : 1);
    if (!pos) { bad.push({ type, text, why: '在文章中找不到這段文字' }); continue; }
    const key = [type, pos.para, pos.s, pos.e].join(':');
    if (seen.has(key)) continue; seen.add(key);
    const n = { id: uid(), type, para: pos.para, s: pos.s, e: pos.e };
    if (type === 'vocab') { n.pos = WS(h.pos || ''); n.zh = WS(h.zh || ''); }
    if (type === 'clause') n.clauseType = clauseNorm(h.clauseType);
    if (type === 'connective') n.fn = WS(h.fn || h['function'] || '');
    hls.push(n);
  }
  return { id: uid(), title: WS(o.title || '') || '未命名單元', created: Date.now(), paras, hls, bad };
}
function exportObj(u) {
  const highlights = u.hls.slice().sort((a, b) => a.para - b.para || a.s - b.s).map(h => {
    const text = u.paras[h.para].slice(h.s, h.e);
    const idx = allIdx(NORM(u.paras[h.para]), NORM(text));
    const o = { type: h.type, para: h.para, text };
    if (idx.length > 1) o.nth = Math.max(1, idx.indexOf(h.s) + 1);
    if (h.type === 'vocab') { o.pos = h.pos || ''; o.zh = h.zh || ''; }
    if (h.type === 'clause') o.clauseType = h.clauseType || '';
    if (h.type === 'connective') o.fn = h.fn || '';
    return o;
  });
  return { format: 'highlight-notes/v1', title: u.title, article: u.paras, highlights };
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
1. "vocab" 生字、不常見字：對${who}而言較難或不常見的單字或詞組。欄位：pos（詞性縮寫，如 n. v. adj. adv. prep. phr.）、zh（符合本文語意的簡短繁體中文翻譯）。
2. "clause" 名詞子句、形容詞子句、副詞子句：text 要涵蓋整個子句（含引導詞，如 that, which, when, because, if）。欄位：clauseType，只能填 "noun"、"adjective"、"adverb" 其中之一。
3. "connective" 連結詞：表達句與句邏輯關係的連接詞、連接副詞或片語（如 however, therefore, in addition, as a result）。欄位：fn（邏輯功能，繁體中文，如：轉折、對比、因果、附加、舉例、讓步、條件、時間順序、強調、總結）。
4. "collocation" 搭配詞：固定的慣用搭配（動詞+名詞、形容詞+名詞、介系詞搭配等，如 make a decision, be aware of）。不需其他欄位。

【定位規則】
- text 必須是該段落中「連續且完全相同」的片段，請直接從你轉錄的 article 複製，不要自行改寫。
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
    "However, we must make a decision."
  ],
  "highlights": [
    {"type": "vocab", "para": 0, "text": "ubiquitous", "pos": "adj.", "zh": "無所不在的"},
    {"type": "clause", "para": 0, "text": "that technology has become ubiquitous", "clauseType": "noun"},
    {"type": "connective", "para": 1, "text": "However", "fn": "轉折"},
    {"type": "collocation", "para": 1, "text": "make a decision"}
  ]
}
${F}`;
}

/* ---------- 路由 ---------- */
const ctx = { u: null, tab: 'text', hidden: new Set(), lastId: null };
let pend = null, hideT = null, barTouch = false, sheetState = {}, dip = null;

function route() {
  const h = location.hash.slice(1) || '/';
  const m = h.match(/^\/u\/(\w+)/);
  closeSheet(); ctx.u = null; pend = null;
  window.scrollTo(0, 0);
  if (m) { const u = units.find(x => x.id === m[1]); if (u) return viewUnit(u); location.hash = '#/'; return; }
  if (h === '/prompt') return viewPrompt();
  if (h === '/import') return viewImport();
  viewHome();
}
addEventListener('hashchange', route);
addEventListener('beforeinstallprompt', e => { e.preventDefault(); dip = e; const b = $('#inst'); if (b) b.hidden = false; });

/* ---------- 首頁 ---------- */
function viewHome() {
  $('#app').innerHTML = `<header class="top"><h1>重點筆記本</h1><button id="inst" hidden>安裝</button></header>
  <main>
    <div class="actions"><a class="btn pri" href="#/import">＋ 匯入單元</a><a class="btn" href="#/prompt">AI 提示詞</a></div>
    ${units.length ? `<ul class="units">${units.map(u => { const c = counts(u); return `<li><a href="#/u/${u.id}"><b>${esc(u.title)}</b><span class="dots">${Object.keys(TYPES).map(t => `<i class="dot ${t}"></i>${c[t]}`).join('')}</span><small>${new Date(u.created).toLocaleDateString('zh-TW')}</small></a></li>`; }).join('')}</ul>`
      : `<p class="empty">還沒有單元<br>先點「AI 提示詞」複製給你的 AI，<br>再把 AI 回傳的 JSON 匯入。</p>`}
    <p class="hint">安裝：iPhone 用 Safari「分享 → 加入主畫面」；Android Chrome 用選單「安裝應用程式」</p>
  </main>`;
  const b = $('#inst');
  b.hidden = !dip;
  b.onclick = async () => { if (!dip) return; dip.prompt(); await dip.userChoice; dip = null; b.hidden = true; };
}

/* ---------- 提示詞頁 ---------- */
function viewPrompt() {
  let level = localStorage.getItem('hn.level') || '高中';
  $('#app').innerHTML = `<header class="top"><a class="back" href="#/">‹</a><h1>AI 提示詞</h1></header>
  <main>
    <ol class="steps"><li>複製下方提示詞，貼到你的 AI</li><li>同時附上英文文章的照片或截圖</li><li>把 AI 回傳的 JSON 複製，回 App 匯入</li></ol>
    <label class="mut">標記程度　<select id="lv">${Object.keys(LEVELS).map(k => `<option ${k === level ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
    <div class="actions" style="margin:8px 0"><button class="btn pri" id="cp">複製提示詞</button></div>
    <pre class="prompt" id="pt"></pre>
  </main>`;
  const upd = () => { $('#pt').textContent = buildPrompt(level); };
  upd();
  $('#lv').onchange = e => { level = e.target.value; localStorage.setItem('hn.level', level); upd(); };
  $('#cp').onclick = () => copy(buildPrompt(level));
}

/* ---------- 匯入頁 ---------- */
function viewImport() {
  $('#app').innerHTML = `<header class="top"><a class="back" href="#/">‹</a><h1>匯入單元</h1></header>
  <main>
    <textarea id="jtxt" placeholder="把 AI 回傳的 JSON 貼在這裡"></textarea>
    <div class="actions" style="margin-top:8px">
      <button class="btn" id="paste">從剪貼簿貼上</button>
      <button class="btn" id="pick">選擇 .json 檔</button>
    </div>
    <input type="file" id="file" accept=".json,application/json,text/plain" hidden>
    <button class="btn pri" id="go" style="width:100%;margin-top:4px">匯入</button>
  </main>`;
  $('#paste').onclick = async () => { try { $('#jtxt').value = await navigator.clipboard.readText(); } catch (e) { toast('無法讀取剪貼簿，請長按貼上'); } };
  $('#pick').onclick = () => $('#file').click();
  $('#file').onchange = async e => { const f = e.target.files[0]; if (f) $('#jtxt').value = await f.text(); };
  $('#go').onclick = () => {
    let u;
    try { u = parseUnit($('#jtxt').value); } catch (e) { toast(e.message); return; }
    const bad = u.bad; delete u.bad;
    units.unshift(u); save();
    if (!bad.length) { toast(`已匯入 ${u.hls.length} 個重點`); location.hash = '#/u/' + u.id; return; }
    openSheet(`<div class="grab"></div><p><b>已匯入 ${u.hls.length} 個重點，${bad.length} 個無法定位而略過：</b></p>
      <ul class="rep">${bad.map(b => `<li>[${esc(b.type)}] ${esc(b.text)} — ${esc(b.why)}</li>`).join('')}</ul>
      <div class="menu"><a class="btn pri" href="#/u/${u.id}">前往單元</a></div>`);
  };
}

/* ---------- 單元頁 ---------- */
function viewUnit(u) {
  ctx.u = u;
  if (ctx.lastId !== u.id) { ctx.tab = 'text'; ctx.lastId = u.id; }
  $('#app').innerHTML = `<header class="top"><a class="back" href="#/">‹</a><h1>${esc(u.title)}</h1><button id="menu" aria-label="選單">⋯</button></header>
  <div class="legend" id="legend"></div>
  <div class="tabs"><button data-tab="text">文章</button><button data-tab="list">重點清單</button></div>
  <main id="body"></main><div id="addbar" hidden></div>`;
  $('#menu').onclick = unitMenu;
  $('.tabs').onclick = e => { const b = e.target.closest('button'); if (!b) return; ctx.tab = b.dataset.tab; renderUnit(); };
  $('#legend').onclick = e => {
    const b = e.target.closest('.chip'); if (!b) return;
    const t = b.dataset.t; ctx.hidden.has(t) ? ctx.hidden.delete(t) : ctx.hidden.add(t); renderUnit();
  };
  $('#body').onclick = bodyClick;
  const bar = $('#addbar');
  bar.addEventListener('mousedown', e => e.preventDefault());
  bar.addEventListener('pointerdown', () => { barTouch = true; clearTimeout(hideT); });
  bar.addEventListener('pointerup', () => setTimeout(() => { barTouch = false; }, 700));
  bar.addEventListener('pointercancel', () => { barTouch = false; });
  bar.onclick = e => {
    const b = e.target.closest('[data-add]'); if (!b || !pend) return;
    const p = pend; clearTimeout(hideT); barTouch = false;
    const sel = getSelection(); if (sel) sel.removeAllRanges();
    openCards([{ id: uid(), type: b.dataset.add, para: p.para, s: p.s, e: p.e, clauseType: '' }], true);
  };
  renderUnit();
}

function renderUnit() {
  const u = ctx.u, c = counts(u);
  $('#legend').innerHTML = Object.keys(TYPES).map(t => `<button class="chip ${ctx.hidden.has(t) ? 'off' : ''}" data-t="${t}"><i class="dot ${t}"></i>${TYPES[t].label} ${c[t]}</button>`).join('');
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === ctx.tab));
  $('#body').innerHTML = ctx.tab === 'text' ? textHtml(u) : listHtml(u);
  if (ctx.tab !== 'text') hideBar();
}

function textHtml(u) {
  return u.paras.map((p, i) => p ? `<p class="para" data-i="${i}">${paraHtml(u, i)}</p>` : '').join('')
    + '<p class="tip">選取文字可新增重點；點螢光處可編輯或刪除</p>';
}

function paraHtml(u, i) {
  const text = u.paras[i], len = text.length;
  const hls = u.hls.filter(h => h.para === i && !ctx.hidden.has(h.type) && h.e > h.s);
  if (!hls.length) return esc(text);
  const cuts = new Set([0, len]); hls.forEach(h => { cuts.add(h.s); cuts.add(Math.min(h.e, len)); });
  const pts = [...cuts].sort((a, b) => a - b);
  let out = '';
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1], seg = text.slice(a, b);
    const cov = hls.filter(h => h.s <= a && h.e >= b).sort((x, y) => (x.e - x.s) - (y.e - y.s));
    if (!cov.length) { out += esc(seg); continue; }
    const main = cov[0], extra = cov.slice(1);
    let style = '';
    if (extra.length) {
      style = ` style="background-image:${extra.map(x => `linear-gradient(var(--s-${x.type}),var(--s-${x.type}))`).join(',')};background-size:100% 3px;background-repeat:no-repeat;background-position:${extra.map((x, j) => `0 calc(100% - ${3 * j}px)`).join(',')}"`;
    }
    out += `<span class="hl ${main.type}" data-ids="${cov.map(x => x.id).join(',')}"${style}>${esc(seg)}</span>`;
  }
  return out;
}

function listHtml(u) {
  let out = '';
  for (const t of Object.keys(TYPES)) {
    if (ctx.hidden.has(t)) continue;
    const L = u.hls.filter(h => h.type === t).sort((a, b) => a.para - b.para || a.s - b.s);
    if (!L.length) continue;
    out += `<section class="grp"><h2><i class="dot ${t}"></i>${TYPES[t].label} <small>${L.length}</small></h2><ul class="items">${L.map(h => `<li data-id="${h.id}"><span class="w ${t}">${esc(textOf(h))}</span><span class="m">${esc(meta(h))}</span></li>`).join('')}</ul></section>`;
  }
  return out || '<p class="empty">沒有重點</p>';
}

function bodyClick(e) {
  const u = ctx.u;
  const hl = e.target.closest('.hl');
  if (hl) {
    const sel = getSelection(); if (sel && !sel.isCollapsed) return;
    const list = hl.dataset.ids.split(',').map(id => u.hls.find(h => h.id === id)).filter(Boolean);
    if (list.length) openCards(list, false);
    return;
  }
  const li = e.target.closest('li[data-id]');
  if (li) { const h = u.hls.find(x => x.id === li.dataset.id); if (h) openCards([h], false); }
}

/* ---------- 選取文字新增 ---------- */
const paraOf = n => { const el = n && (n.nodeType === 1 ? n : n.parentElement); return el && el.closest ? el.closest('#body .para') : null; };
function off(p, node, o) { const r = document.createRange(); r.selectNodeContents(p); r.setEnd(node, o); return r.toString().length; }
function hideBar() { const b = $('#addbar'); if (b) b.hidden = true; pend = null; }
document.addEventListener('selectionchange', () => {
  const bar = $('#addbar');
  if (!bar || !ctx.u || ctx.tab !== 'text') return;
  const sel = getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) {
    clearTimeout(hideT);
    hideT = setTimeout(() => { if (!barTouch) hideBar(); }, 250);
    return;
  }
  const r = sel.getRangeAt(0), p1 = paraOf(r.startContainer), p2 = paraOf(r.endContainer);
  if (!p1 || p1 !== p2) { clearTimeout(hideT); hideT = setTimeout(() => { if (!barTouch) hideBar(); }, 250); return; }
  clearTimeout(hideT);
  const i = +p1.dataset.i, str = ctx.u.paras[i];
  let s = off(p1, r.startContainer, r.startOffset), e = off(p1, r.endContainer, r.endOffset);
  while (s < e && /\s/.test(str[s])) s++;
  while (e > s && /\s/.test(str[e - 1])) e--;
  if (e <= s) return;
  if (pend && pend.para === i && pend.s === s && pend.e === e && !bar.hidden) return;
  pend = { para: i, s, e };
  const ex = str.slice(s, e);
  bar.innerHTML = `<div class="sel">「${esc(ex.length > 60 ? ex.slice(0, 60) + '…' : ex)}」加入為：</div><div class="btns">${Object.keys(TYPES).map(t => `<button class="addb ${t}" data-add="${t}">${TYPES[t].label}</button>`).join('')}</div>`;
  bar.hidden = false;
});

/* ---------- 底部面板（編輯 / 新增） ---------- */
function openSheet(html) { const w = $('#sheetwrap'); w.hidden = false; w.innerHTML = `<div class="backdrop"></div><div class="sheet">${html}</div>`; }
function closeSheet() { const w = $('#sheetwrap'); if (!w) return; w.hidden = true; w.innerHTML = ''; }

function fieldsHtml(h) {
  if (h.type === 'vocab') return `<label>詞性<input class="f-pos" value="${esc(h.pos)}" placeholder="n. / v. / adj. / adv."></label><label>中文翻譯<input class="f-zh" value="${esc(h.zh)}"></label>`;
  if (h.type === 'clause') return `<label>子句類型<select class="f-clause"><option value="">（未指定）</option>${Object.entries(CLAUSES).map(([k, v]) => `<option value="${k}" ${h.clauseType === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>`;
  if (h.type === 'connective') return `<label>邏輯功能<input class="f-fn" list="fnlist" value="${esc(h.fn)}" placeholder="轉折 / 因果 / 附加…"><datalist id="fnlist">${FNS.map(x => `<option value="${x}">`).join('')}</datalist></label>`;
  return '<p class="mut">搭配詞只需標記文字</p>';
}
function cardHtml(h, isNew) {
  return `<div class="card" data-id="${h.id}" data-new="${isNew ? 1 : 0}">
    <div class="row"><select class="f-type">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${k === h.type ? 'selected' : ''}>${v.label}</option>`).join('')}</select><b class="ctext ${h.type}">${esc(textOf(h))}</b></div>
    <div class="fields">${fieldsHtml(h)}</div>
    <div class="row end">${isNew ? '' : '<button class="btn danger" data-act="del">刪除</button>'}<button class="btn pri" data-act="save">${isNew ? '新增' : '儲存'}</button></div></div>`;
}
function openCards(list, isNew) {
  hideBar(); sheetState = {};
  list.forEach(h => { sheetState[h.id] = Object.assign({}, h); });
  openSheet('<div class="grab"></div>' + list.map(h => cardHtml(sheetState[h.id], isNew)).join(''));
}
function readCard(card, d) {
  const g = s => card.querySelector(s);
  if (g('.f-pos')) d.pos = WS(g('.f-pos').value);
  if (g('.f-zh')) d.zh = WS(g('.f-zh').value);
  if (g('.f-clause')) d.clauseType = g('.f-clause').value;
  if (g('.f-fn')) d.fn = WS(g('.f-fn').value);
}

function unitMenu() {
  openSheet(`<div class="grab"></div><div class="menu"><button class="btn" data-m="rename">重新命名</button><button class="btn" data-m="export">匯出 JSON</button><button class="btn danger" data-m="del">刪除單元</button></div>`);
}

$('#sheetwrap').addEventListener('change', e => {
  if (!e.target.classList.contains('f-type')) return;
  const card = e.target.closest('.card'), d = sheetState[card.dataset.id];
  readCard(card, d); d.type = e.target.value;
  card.querySelector('.fields').innerHTML = fieldsHtml(d);
  card.querySelector('.ctext').className = 'ctext ' + d.type;
});
$('#sheetwrap').addEventListener('click', e => {
  if (e.target.classList.contains('backdrop')) return closeSheet();
  const u = ctx.u;
  const m = e.target.closest('[data-m]');
  if (m && u) {
    if (m.dataset.m === 'rename') {
      const t = prompt('單元名稱', u.title);
      if (t && WS(t)) { u.title = WS(t); save(); closeSheet(); const h1 = document.querySelector('.top h1'); if (h1) h1.textContent = u.title; }
    } else if (m.dataset.m === 'export') {
      const blob = new Blob([JSON.stringify(exportObj(u), null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = (u.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40) || 'unit') + '.json';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      closeSheet();
    } else if (m.dataset.m === 'del') {
      if (confirm('刪除整個單元「' + u.title + '」？無法復原。')) { units = units.filter(x => x.id !== u.id); save(); closeSheet(); location.hash = '#/'; }
    }
    return;
  }
  const btn = e.target.closest('[data-act]'); if (!btn || !u) return;
  const card = btn.closest('.card'), id = card.dataset.id, isNew = card.dataset.new === '1', d = sheetState[id];
  if (btn.dataset.act === 'del') {
    if (!confirm('刪除這個重點？')) return;
    u.hls = u.hls.filter(h => h.id !== id); save(); card.remove(); renderUnit();
    if (!document.querySelector('#sheetwrap .card')) closeSheet();
  } else if (btn.dataset.act === 'save') {
    const t = card.querySelector('.f-type').value; readCard(card, d); d.type = t;
    const c = { id, type: t, para: d.para, s: d.s, e: d.e };
    if (t === 'vocab') { c.pos = d.pos || ''; c.zh = d.zh || ''; }
    if (t === 'clause') c.clauseType = d.clauseType || '';
    if (t === 'connective') c.fn = d.fn || '';
    if (isNew) { u.hls.push(c); card.dataset.new = '0'; }
    else { const i = u.hls.findIndex(h => h.id === id); if (i >= 0) u.hls[i] = c; }
    save(); renderUnit(); toast('已儲存');
    if (document.querySelectorAll('#sheetwrap .card').length <= 1) closeSheet();
  }
});

if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
route();
