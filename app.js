/* 烬账 ASHLEDGER（暂名）· 前端演示。所有数据都在浏览器里随机生成，不连链、不连钱包。 */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const hex = n => { let s = ''; for (let i = 0; i < n; i++) s += '0123456789abcdef'[(Math.random() * 16) | 0]; return s; };
const addr = () => '0x' + hex(4) + '…' + hex(4);
const fmt = (n, d = 4) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const fint = n => Math.round(n).toLocaleString('en-US');
const fk = n => n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : n.toFixed(0);
const lognorm = (mu, sig) => Math.exp(mu + sig * Math.sqrt(-2 * Math.log(Math.random() || 1e-9)) * Math.cos(2 * Math.PI * Math.random()));
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- 演示参数（全部待拍） ---------- */
const P = {
  tax: 0.03, split: { pot: .45, plot: .30, floor: .20, ops: .05 },
  release: 0.02, windowSec: 15, windowBlocks: 33, blockMs: 450,
  minLine: 600000,             // 每分钟最低燃烧线（枚）
  haircut: 0.01,
};

/* ---------- 演示状态 ---------- */
const S = {
  block: 51_000_000 + ((Math.random() * 900000) | 0),
  supply: 993_418_204.6,
  price: 2.08e-7,               // 演示市价 BNB/枚
  potPool: 21.37, plotPool: 4.812, reserve: 5.86, ops: 0.731,
  minute: 0, minuteKey: 0, roundPot: 0, cutSec: 0, cutIdx: 0,
  burns: [], carry: [], rolledNow: 0,
  agent: null, slipNo: 1,
  floorHist: [], mktHist: [],
};
const BASE_MIN = 29_000_000; // 起点偏移，只为让分钟编号看起来像流水号

/* ---------- 工具：toast ---------- */
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 3200); }
$('#btnConnect').addEventListener('click', () => toast('演示模式：本站不连接钱包，不会请求私钥、助记词或任何签名。'));

/* ---------- 税流入 ---------- */
function addTax(bnb) {
  const t = bnb * P.tax;
  S.potPool += t * P.split.pot; S.plotPool += t * P.split.plot; S.reserve += t * P.split.floor; S.ops += t * P.split.ops;
  return t;
}
const taxFeed = $('#taxFeed');
function pushTax(kind, bnb, t) {
  const d = document.createElement('div');
  d.innerHTML = `<span class="${kind === '卖' ? 'sell' : 'buy'}">${kind}</span><span>${fmt(bnb, 3)} BNB</span><b>+${fmt(t, 5)}</b>`;
  taxFeed.prepend(d); while (taxFeed.children.length > 40) taxFeed.lastChild.remove();
}

/* ---------- 分钟拍卖 ---------- */
const cdCells = $('#cdCells');
for (let i = 0; i < P.windowBlocks; i++) cdCells.appendChild(document.createElement('i'));
const cells = [...cdCells.children];

function openMinute(key) {
  S.minuteKey = key; S.minute = key - BASE_MIN;
  S.roundPot = S.potPool * P.release; S.potPool -= S.roundPot;
  S.cutSec = 60 - Math.random() * P.windowSec; // 隐藏，分钟结束才揭晓
  S.cutIdx = Math.min(P.windowBlocks - 1, Math.floor((S.cutSec - 45) / P.windowSec * P.windowBlocks));
  S.burns = S.carry.map(b => ({ ...b, sec: 0, carried: true })); S.carry = [];
  S.rolledNow = 0;
  cells.forEach(c => { c.className = ''; c.style.removeProperty('--h'); });
  $('#cdState').textContent = '等待窗口开启';
  $('#bids').innerHTML = '';
  S.burns.forEach(b => addBidRow(b));
  $('#hMinute').textContent = fint(S.minute);
  $('#slipNo').textContent = String(S.minute % 1e6).padStart(6, '0');
}

function settleMinute() {
  let counted = 0, ppl = new Set(), rolled = 0;
  for (const b of S.burns) {
    if (b.sec <= S.cutSec || b.carried) { counted += b.amt; ppl.add(b.who); }
    else { rolled += b.amt; S.carry.push({ who: b.who, amt: b.amt }); }
  }
  const ok = counted >= P.minLine;
  if (!ok) S.potPool += S.roundPot; // 未过线：退回分钟池余额
  // 地块池按分钟分一点给地块（演示）
  const plotOut = S.plotPool * 0.02; S.plotPool -= plotOut; distributePlots(plotOut);
  const tr = document.createElement('tr');
  tr.innerHTML = `<td>#${fint(S.minute)}</td><td>${fmt(S.roundPot, 4)}</td><td>${fk(counted)}</td><td>${ppl.size}</td><td>${S.cutSec.toFixed(2)}s</td><td>${rolled ? fk(rolled) : '—'}</td>` +
    (ok ? `<td class="ok">按占比分完</td>` : `<td class="no">未过最低线 · 退回奖池</td>`);
  const body = $('#settleBody'); body.prepend(tr); while (body.children.length > 8) body.lastChild.remove();
}

function revealCut() {
  // 揭晓截止块：之后的燃烧标记为滚入下一分钟
  cells.forEach((c, i) => { if (i === S.cutIdx) c.classList.add('cut'); else if (i > S.cutIdx) c.classList.add('roll'); });
  let rolled = 0;
  [...$('#bids').children].forEach(row => { if (+row.dataset.sec > S.cutSec && row.dataset.carried !== '1') { row.classList.add('roll'); row.querySelector('em').textContent = '→ 下一分钟'; rolled += +row.dataset.amt; } });
  S.rolledNow = rolled;
  $('#cdState').textContent = `截止揭晓：${S.cutSec.toFixed(2)}s（第 ${S.cutIdx + 1}/33 块）`;
}

function addBidRow(b) {
  const d = document.createElement('div');
  d.dataset.sec = b.sec; d.dataset.amt = b.amt; d.dataset.carried = b.carried ? '1' : '0';
  d.innerHTML = `<span>${b.who}</span><b>${fk(b.amt)}</b><em>${b.carried ? '上分钟滚入' : b.sec.toFixed(1) + 's'}</em>`;
  if (b.mine) d.style.color = 'var(--gold)';
  $('#bids').prepend(d); while ($('#bids').children.length > 14) $('#bids').lastChild.remove();
}

const heroLog = $('#heroLog');
function burn(who, amt, sec, opts = {}) {
  const b = { who, amt, sec, mine: !!opts.mine };
  S.burns.push(b);
  S.supply -= amt;
  const bnb = amt * S.price / (1 - P.tax);
  addTax(bnb); // 烧之前要先买，买入本身交税
  addBidRow(b);
  if (sec >= 45) {
    const idx = Math.min(P.windowBlocks - 1, Math.floor((sec - 45) / P.windowSec * P.windowBlocks));
    const c = cells[idx]; c.classList.add('has');
    const prev = parseFloat(c.style.getPropertyValue('--h')) || 0;
    c.style.setProperty('--h', Math.min(80, prev + 10 + Math.log10(amt) * 6) + '%');
  }
  const d = document.createElement('div');
  d.innerHTML = `<span>${who}</span><span>烧 <b>${fint(amt)}</b></span><span>${sec.toFixed(1)}s</span>`;
  heroLog.prepend(d); while (heroLog.children.length > 12) heroLog.lastChild.remove();
  Furnace.burst(Math.min(1, Math.log10(amt) / 7), opts.mine);
  burnInBlock = true;
}

/* ---------- 时钟主循环 ---------- */
let lastSec = -1, lastKey = 0;
function secInMinute() { return (Date.now() % 60000) / 1000; }
function tick() {
  const now = Date.now(), key = Math.floor(now / 60000), sec = (now % 60000) / 1000;
  if (key !== lastKey) {
    if (lastKey) { revealCut(); settleMinute(); }
    openMinute(key); lastKey = key;
  }
  const remain = 60 - sec;
  $('#hSec').textContent = String(Math.floor(remain)).padStart(2, '0');
  $('#hMs').textContent = String(Math.floor((remain % 1) * 100)).padStart(2, '0');
  $('.hc-num').classList.toggle('hot', sec >= 45);
  $('#hBar').style.width = (sec / 60 * 100) + '%';
  if (sec >= 45) {
    const idx = Math.min(P.windowBlocks - 1, Math.floor((sec - 45) / P.windowSec * P.windowBlocks));
    cells.forEach((c, i) => { c.classList.toggle('pass', i < idx); c.classList.toggle('now', i === idx); });
    $('#cdState').textContent = `窗口进行中 · 截止点未知 · 第 ${idx + 1}/33 块`;
  }
  requestAnimationFrame(tick);
}

/* ---------- 区块流（0.45s） ---------- */
function onBlock() {
  S.block++;
  $('#rBlock').textContent = fint(S.block);
  if (S.block % 4 === 0) $('#rGas').textContent = rnd(0.05, 0.11).toFixed(3);
  // 市价随机游走（演示）
  S.price *= Math.exp(rnd(-0.004, 0.0042));
  // 普通买卖
  if (Math.random() < 0.35) {
    const bnb = lognorm(-1.6, 1.0), kind = Math.random() < 0.55 ? '买' : '卖';
    pushTax(kind, bnb, addTax(bnb));
  }
  // 燃烧
  const sec = secInMinute();
  const rate = sec > 45 ? 0.22 : 0.12;
  if (Math.random() < rate) burn(addr(), lognorm(11.6, 1.25), sec);
  // Agent（演示）每分钟最多烧 cap
  if (S.agent && S.agent.spent < S.agent.cap && Math.random() < 0.02 && sec < 44) {
    const bnb = Math.min(S.agent.cap - S.agent.spent, S.agent.cap / 3); S.agent.spent += bnb;
    const amt = bnb * (1 - P.tax) / S.price;
    burn('Agent·演示', amt, sec, { mine: true });
    slipLog(`第 ${fint(S.minute)} 分钟 · 烧 ${fint(amt)} 枚（${fmt(bnb, 3)} BNB，已用 ${fmt(S.agent.spent, 3)}/${fmt(S.agent.cap, 2)}）`);
  }
  if (sec < 1 && S.agent) S.agent.spent = 0;
  // 挂单板
  if (Math.random() < 0.03) marketEvent();
  pushChain(sec);
  render();
}

let burnInBlock = false;
function pushChain(sec) {
  const ch = $('#chain'); if (!ch) return;
  const d = document.createElement('div');
  if (burnInBlock) d.className = 'burn';
  d.innerHTML = `<b>#${fint(S.block)}</b>${(40 + Math.random() * 180) | 0} tx · ${sec.toFixed(1)}s<br>${addr().slice(0, 8)} 出块`;
  ch.prepend(d); while (ch.children.length > 16) ch.lastChild.remove();
  burnInBlock = false;
}

function render() {
  const counted = S.burns.reduce((a, b) => a + b.amt, 0);
  $('#hPot').textContent = fmt(S.roundPot, 4);
  $('#hPool').textContent = fmt(S.potPool, 2) + ' BNB';
  $('#rPot').textContent = fmt(S.roundPot, 4);
  $('#rBurn').textContent = fk(counted);
  $('#rRoll').textContent = S.rolledNow ? fk(S.rolledNow) : '0';
  const pct = Math.min(100, counted / P.minLine * 50);
  const ml = $('#mlFill'); ml.style.width = pct + '%'; ml.classList.toggle('ok', counted >= P.minLine);
  $('#mlText').textContent = `${fk(counted)} / ${fk(P.minLine)} 枚 ${counted >= P.minLine ? '· 已过线' : '· 未过线则奖池退回'}`;
  $('#accPot').textContent = fmt(S.potPool, 3) + ' BNB';
  $('#accPlot').textContent = fmt(S.plotPool, 3) + ' BNB';
  $('#accFloor').textContent = fmt(S.reserve, 3) + ' BNB';
  $('#accOps').textContent = fmt(S.ops, 3) + ' BNB';
  const fpx = S.reserve / S.supply;
  $('#fRes').textContent = fmt(S.reserve, 4) + ' BNB';
  $('#fSup').textContent = fint(S.supply);
  $('#fPx').textContent = (fpx * 1e9).toFixed(4) + ' BNB / 10亿枚';
  $('#fRatio').textContent = (fpx / S.price * 100).toFixed(2) + '%';
  updateRedeem();
}

/* ---------- 炉膛 canvas ---------- */
const Furnace = (() => {
  const cv = $('#furnace'), ctx = cv.getContext('2d');
  let W, H, dpr, parts = [], heat = 0.3, flash = 0, t0 = performance.now();
  function size() { dpr = Math.min(1.5, devicePixelRatio || 1); W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  addEventListener('resize', size); size();
  const mouth = () => ({ x: W * (W < 800 ? .5 : .68), y: H * .98 });
  function spawn(n, power, gold) {
    const m = mouth();
    for (let i = 0; i < n; i++) {
      parts.push({ x: m.x + rnd(-1, 1) * W * .16 * (0.4 + power), y: m.y + rnd(-10, 10), vx: rnd(-.4, .4), vy: -rnd(.6, 2.2) * (1 + power * 1.6), life: 0, max: rnd(140, 360), r: rnd(.6, 2.4) * (1 + power), gold: gold || Math.random() < .25 });
    }
  }
  function burst(power, gold) { if (reduce) return; heat = Math.min(1.4, heat + .25 + power * .5); flash = Math.min(1, flash + power * .7); spawn(30 + power * 110, power, gold); }
  function frame(t) {
    const dt = Math.min(50, t - t0); t0 = t;
    ctx.clearRect(0, 0, W, H);
    const m = mouth();
    // 透视网格地面
    ctx.save(); ctx.globalAlpha = .55; ctx.strokeStyle = 'rgba(240,185,11,.16)'; ctx.lineWidth = 1;
    const hz = H * .62, vx = m.x;
    for (let i = -14; i <= 14; i++) { ctx.beginPath(); ctx.moveTo(vx, hz); ctx.lineTo(vx + i * W * .12, H); ctx.stroke(); }
    const off = (t / 1400) % 1;
    for (let j = 0; j < 12; j++) { const k = (j + off) / 12, y = hz + (H - hz) * k * k; ctx.globalAlpha = .5 * k; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.restore();
    // 炉口光
    heat += (0.3 - heat) * 0.01; flash *= 0.94;
    const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, H * (.55 + heat * .25));
    g.addColorStop(0, `rgba(255,120,40,${.35 + heat * .25})`); g.addColorStop(.35, `rgba(240,120,11,${.12 + heat * .08})`); g.addColorStop(1, 'rgba(11,10,8,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (flash > .02) { ctx.fillStyle = `rgba(255,200,90,${flash * .08})`; ctx.fillRect(0, 0, W, H); }
    // 常驻余烬
    if (!reduce && Math.random() < .9) spawn(2, .1);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.life += dt / 16;
      p.vx += Math.sin((p.y + t * .05) * .01) * .02; p.x += p.vx * dt / 16; p.y += p.vy * dt / 16; p.vy *= .998;
      const a = 1 - p.life / p.max;
      if (a <= 0 || p.y < -20) { parts.splice(i, 1); continue; }
      ctx.fillStyle = p.gold ? `rgba(255,213,106,${a})` : `rgba(255,${(90 + 80 * a) | 0},31,${a * .9})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.5 + a * .6), 0, 6.283); ctx.fill();
    }
    if (parts.length > 900) parts.splice(0, parts.length - 900);
    ctx.globalCompositeOperation = 'source-over';
    // 左侧压暗，保证文字可读
    const sh = ctx.createLinearGradient(0, 0, W * .6, 0); sh.addColorStop(0, 'rgba(11,10,8,.75)'); sh.addColorStop(1, 'rgba(11,10,8,0)');
    ctx.fillStyle = sh; ctx.fillRect(0, 0, W, H);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return { burst };
})();

/* ---------- 分账单流动线 ---------- */
(() => {
  const cv = $('#flowCv'), ctx = cv.getContext('2d'); let W, H;
  function size() { const d = Math.min(2, devicePixelRatio || 1); W = cv.clientWidth; H = cv.clientHeight; cv.width = W * d; cv.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0); }
  addEventListener('resize', size); size();
  const vertical = () => W < 200 || matchMedia('(max-width:1100px)').matches;
  function f(t) {
    ctx.clearRect(0, 0, W, H); ctx.strokeStyle = '#1b1610'; ctx.fillStyle = '#1b1610'; ctx.lineWidth = 1.5;
    if (vertical()) { ctx.beginPath(); ctx.moveTo(W / 2, 2); ctx.lineTo(W / 2, H - 6); ctx.stroke(); ctx.beginPath(); ctx.moveTo(W / 2 - 5, H - 10); ctx.lineTo(W / 2, H - 2); ctx.lineTo(W / 2 + 5, H - 10); ctx.fill(); }
    else {
      const y = H / 2; ctx.setLineDash([6, 5]); ctx.lineDashOffset = -t / 40; ctx.beginPath(); ctx.moveTo(4, y); ctx.lineTo(W - 12, y); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(W - 14, y - 6); ctx.lineTo(W - 2, y); ctx.lineTo(W - 14, y + 6); ctx.fill();
      for (let i = 0; i < 4; i++) { const k = ((t / 2400) + i / 4) % 1; ctx.fillStyle = '#f0b90b'; ctx.beginPath(); ctx.arc(4 + k * (W - 20), y, 5, 0, 6.283); ctx.fill(); ctx.strokeStyle = '#1b1610'; ctx.stroke(); }
      ctx.fillStyle = '#5b4f3c'; ctx.font = '11px "JetBrains Mono",monospace'; ctx.fillText('BNB 税 · 发射台税收地址 = 分账合约', 6, y - 12);
    }
    requestAnimationFrame(f);
  }
  requestAnimationFrame(f);
})();

/* ---------- 模拟器 ---------- */
let simMode = 'wallet';
function setRangeFill(r) { const p = (r.value - r.min) / (r.max - r.min) * 100; r.style.setProperty('--p', p + '%'); }
function sim() {
  const bnb = Math.max(0, +$('#simBnb').value || 0), sec = +$('#simSec').value;
  $('#simSecO').textContent = sec.toFixed(1);
  const tokens = bnb * (1 - P.tax) / S.price;
  $('#simTokens').textContent = `≈ ${fint(tokens)} 枚（按演示价，已扣 ${P.tax * 100}% 买入税）`;
  const prob = sec < 45 ? 1 : Math.max(0, (60 - sec) / P.windowSec);
  $('#soProb').textContent = Math.round(prob * 100) + '%';
  $('#soProbBar').style.width = prob * 100 + '%';
  const curSec = Math.max(1, secInMinute());
  const soFar = S.burns.reduce((a, b) => a + b.amt, 0);
  const projected = Math.max(soFar, soFar / curSec * 60, P.minLine * .8);
  const share = tokens / (projected + tokens);
  $('#soShare').textContent = (share * 100).toFixed(2) + '%';
  $('#soPay').textContent = fmt(share * S.roundPot, 5) + ' BNB';
  const pass = projected + tokens >= P.minLine;
  $('#soMin').innerHTML = pass ? '大概率过线（演示估算）' : '<span style="color:var(--ember2)">可能不过线：不分，奖池退回</span>';
  $('#soRoll').textContent = prob < 1 ? `${Math.round((1 - prob) * 100)}% 概率记入第 ${fint(S.minute + 1)} 分钟，按那一分钟重新算占比；币照样烧掉，不退` : '45 秒前进场，一定计入本分钟';
  $('#soNote').textContent = `占比按「本分钟已烧 ${fk(soFar)} 枚、按当前速度推到 60 秒约 ${fk(projected)} 枚」估算。别人还会进场，结果只在结算时确定。这是演示算术，不是收益预期。`;
  [$('#simBnbR'), $('#simSec')].forEach(setRangeFill);
}
$('#simBnb').addEventListener('input', () => { $('#simBnbR').value = $('#simBnb').value; sim(); });
$('#simBnbR').addEventListener('input', () => { $('#simBnb').value = $('#simBnbR').value; sim(); });
$('#simSec').addEventListener('input', sim);
document.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => {
  document.querySelectorAll('.chip').forEach(x => x.classList.remove('on')); c.classList.add('on'); simMode = c.dataset.mode;
  toast(simMode === 'agent' ? '演示：Agent 路径只用你在 §07 授权单里设的上限，且只能烧。' : '演示：币安钱包里一笔完成 买入 + 烧，带最小成交量。');
}));
$('#btnSimBurn').addEventListener('click', () => {
  const bnb = Math.max(0.001, +$('#simBnb').value || 0.05);
  const amt = bnb * (1 - P.tax) / S.price;
  burn(simMode === 'agent' ? 'Agent·演示' : '你·演示', amt, secInMinute(), { mine: true });
  toast(`演示模式：记了一笔 ${fint(amt)} 枚的模拟燃烧，没有发起任何交易。`);
  document.getElementById('s1').scrollIntoView({ behavior: 'smooth' });
});

/* ---------- 地块地图 ---------- */
const COLS = 110, ROWS = 30, N = COLS * ROWS;
const owners = Array.from({ length: 420 }, addr);
const plots = [];
(() => {
  for (let r = 0; r < ROWS; r++) {
    // 某些分钟燃烧不足 → 只按「燃烧量 ÷ 底价」发一部分，剩余滚存（演示）
    const minted = Math.random() < .2 ? (35 + Math.random() * 65) | 0 : COLS;
    const n = 4 + ((Math.random() * 10) | 0);
    let w = Array.from({ length: n }, () => lognorm(0, 1.1)); const sum = w.reduce((a, b) => a + b, 0);
    w = w.map(x => x / sum).sort((a, b) => b - a);
    const runs = []; let c0 = 0;
    w.forEach((x, i) => { const len = i === n - 1 ? minted - c0 : Math.max(1, Math.round(x * minted)); runs.push({ start: c0, len: Math.max(0, Math.min(len, minted - c0)), rank: i, owner: owners[(Math.pow(Math.random(), 2.2) * owners.length) | 0] }); c0 += len; });
    // 打乱位置，让一等地不总在左边
    for (let i = runs.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [runs[i], runs[j]] = [runs[j], runs[i]]; }
    let c = 0; const cellsRow = [];
    runs.forEach(run => { for (let k = 0; k < run.len && c < minted; k++, c++) cellsRow.push({ rank: run.rank, owner: run.owner, edge: k === 0 }); });
    for (let col = 0; col < COLS; col++) {
      const id = r * COLS + col + 1, info = cellsRow[col], live = !!info;
      const tier = !live ? -1 : info.rank === 0 ? 1 : info.rank === 1 ? 2 : info.rank === 2 ? 3 : 0;
      plots.push({ id, r, c: col, live, tier, owner: live ? info.owner : null, edge: live && info.edge,
        acc: live ? rnd(0.0004, 0.006) * [1, 3, 2, 1.5][tier] : 0, used: Math.random(), heat: 0 });
    }
  }
})();
const TW = { 1: 3, 2: 2, 3: 1.5, 0: 1 };
const TN = { 1: '一等 ×3', 2: '二等 ×2', 3: '三等 ×1.5', 0: '普通 ×1', '-1': '滚存未发' };
const TC = { 1: '#ffd56a', 2: '#f0b90b', 3: '#b07a12', 0: '#4a3f2c' };
function distributePlots(bnb) {
  const live = plots.filter(p => p.live);
  for (let i = 0; i < 60; i++) { const p = pick(live); const w = TW[p.tier]; const amt = bnb / 60 * w / 1.3; p.acc += amt; p.heat = 1; p.used = Math.min(1, p.used + .05); }
}
const map = $('#plotMap'), mctx = map.getContext('2d');
let cell = 7, sel = null, hover = null, VC = COLS, VR = ROWS;
const pos = p => { const k = p.r * COLS + p.c; return { x: (k % VC) * cell, y: Math.floor(k / VC) * cell }; };
function sizeMap() {
  const w = map.parentElement.clientWidth - 20;
  VC = w < 640 ? COLS / 2 : COLS; VR = N / VC;
  cell = w / VC;
  const d = Math.min(2, devicePixelRatio || 1);
  map.width = VC * cell * d; map.height = VR * cell * d; map.style.height = VR * cell + 'px';
  mctx.setTransform(d, 0, 0, d, 0, 0);
  const ax = document.querySelector('.map-axis'); if (ax) ax.firstElementChild.textContent = VC < COLS ? '每两行 = 创世 1 分钟（110 块）' : '每一行 = 创世 1 分钟（110 块）';
}
addEventListener('resize', sizeMap); sizeMap();
function drawMap() {
  mctx.clearRect(0, 0, VC * cell, VR * cell);
  const g = cell > 4 ? 1 : .5;
  for (const p of plots) {
    const { x, y } = pos(p);
    if (!p.live) { mctx.strokeStyle = '#3a3327'; mctx.lineWidth = .6; mctx.beginPath(); mctx.moveTo(x + g, y + cell - g); mctx.lineTo(x + cell - g, y + g); mctx.stroke(); continue; }
    let col = TC[p.tier];
    if (sel && p.owner === sel.owner) col = '#5fd3b5';
    mctx.fillStyle = col; mctx.globalAlpha = .55 + .45 * Math.min(1, p.acc / 0.02);
    mctx.fillRect(x + g, y + g, cell - 2 * g, cell - 2 * g);
    if (p.heat > .02) { mctx.globalAlpha = p.heat; mctx.fillStyle = '#ff5a1f'; mctx.fillRect(x + g, y + g, cell - 2 * g, cell - 2 * g); p.heat *= .93; }
    mctx.globalAlpha = 1;
    if (p.edge && cell > 4) { mctx.fillStyle = '#0b0a08'; mctx.fillRect(x, y, 1, cell); }
  }
  if (hover) { const h = pos(hover); mctx.strokeStyle = '#efe6d2'; mctx.lineWidth = 1; mctx.strokeRect(h.x + .5, h.y + .5, cell - 1, cell - 1); }
  if (sel) { const q = pos(sel); mctx.strokeStyle = '#fff'; mctx.lineWidth = 2; mctx.strokeRect(q.x - 1, q.y - 1, cell + 2, cell + 2); }
  requestAnimationFrame(drawMap);
}
requestAnimationFrame(drawMap);
function plotAt(e) { const r = map.getBoundingClientRect(); const c = Math.floor((e.clientX - r.left) / cell), rw = Math.floor((e.clientY - r.top) / cell); return (c >= 0 && c < VC && rw >= 0 && rw < VR) ? plots[rw * VC + c] : null; }
map.addEventListener('mousemove', e => { hover = plotAt(e); });
map.addEventListener('mouseleave', () => hover = null);
map.addEventListener('click', e => { const p = plotAt(e); if (p) { sel = p; showPlot(p); } });
function showPlot(p) {
  const card = $('#plotCard');
  if (!p.live) {
    card.innerHTML = `<div class="mono dim">地块</div><div class="pc-id">#${String(p.id).padStart(4, '0')}</div><span class="pc-tier x">滚存未发</span>
    <p class="pc-note">创世第 ${p.r + 1} 分钟烧得不够：按「燃烧量 ÷ 底价」只发了一部分，这块滚到后面的分钟再发。不会出现「烧 1 个币拿走 110 块」的情况。</p>`;
    return;
  }
  const mine = plots.filter(x => x.owner === p.owner).length;
  const ask = Math.random() < .3 ? fmt(rnd(.05, .8) * TW[p.tier], 3) + ' BNB' : '未挂单';
  card.innerHTML = `<div class="mono dim">地块 · 演示数据</div><div class="pc-id">#${String(p.id).padStart(4, '0')}</div><span class="pc-tier">${TN[p.tier]}</span>
  <dl>
    <div><dt>铸造于</dt><dd>创世第 ${p.r + 1} 分钟</dd></div>
    <div><dt>持有人</dt><dd>${p.owner}（共 ${mine} 块）</dd></div>
    <div><dt>权重</dt><dd>${TW[p.tier]}</dd></div>
    <div><dt>累计记账收益</dt><dd>${fmt(p.acc, 5)} BNB</dd></div>
    <div><dt>本小时额度已用</dt><dd>${Math.round(p.used * 100)}%</dd></div>
    <div><dt>挂单</dt><dd>${ask}</dd></div>
  </dl>
  <div class="pc-cap"><i style="width:${p.used * 100}%"></i></div>
  <p class="pc-note">收益记在这块地上，不跟钱包走：转手后新的持有人继续领。每块地每小时有上限，多囤地也绕不开每块的额度。绿色高亮的是同一持有人的其他地块。</p>`;
}
// 默认选一块
setTimeout(() => { sel = plots.find(p => p.tier === 1); showPlot(sel); for (let i = 0; i < 8; i++) marketEvent(); }, 50);

function marketEvent() {
  const live = plots.filter(p => p.live), p = pick(live), price = rnd(.04, .9) * TW[p.tier];
  const d = document.createElement('div');
  if (Math.random() < .45) {
    const fee = price * .01; S.potPool += fee; p.owner = addr(); p.heat = 1;
    d.innerHTML = `<span>成交 #${String(p.id).padStart(4, '0')} ${fmt(price, 3)}</span><b>+${fmt(fee, 4)} → 奖池</b>`;
  } else d.innerHTML = `<span>挂单 #${String(p.id).padStart(4, '0')} ${TN[p.tier].slice(0, 2)}</span><span>${fmt(price, 3)} BNB</span>`;
  const rows = $('#mkRows'); rows.prepend(d); while (rows.children.length > 12) rows.lastChild.remove();
}

/* ---------- 地板图 ---------- */
(() => {
  // 预置历史：地板单调上升，市价上下波动
  let res = S.reserve * .55, sup = S.supply + 4_800_000, px = S.price * .7;
  for (let i = 0; i < 260; i++) { res += Math.random() < .7 ? rnd(0, .07) : 0; sup -= Math.random() < .6 ? rnd(0, 36000) : 0; px *= Math.exp(rnd(-.03, .032)); S.floorHist.push(res / sup); S.mktHist.push(px); }
  // 和当前状态衔接
  const scale = (S.reserve / S.supply) / S.floorHist[S.floorHist.length - 1];
  S.floorHist = S.floorHist.map(v => v * scale);
  const ms = S.price / S.mktHist[S.mktHist.length - 1]; S.mktHist = S.mktHist.map(v => v * ms);
})();
const fcv = $('#floorCv'), fctx = fcv.getContext('2d');
function sizeFloor() { const d = Math.min(2, devicePixelRatio || 1); fcv.width = fcv.clientWidth * d; fcv.height = fcv.clientHeight * d; fctx.setTransform(d, 0, 0, d, 0, 0); }
addEventListener('resize', sizeFloor); sizeFloor();
setInterval(() => {
  const f = Math.max(S.floorHist[S.floorHist.length - 1], S.reserve / S.supply);
  S.floorHist.push(f); S.mktHist.push(S.price);
  if (S.floorHist.length > 300) { S.floorHist.shift(); S.mktHist.shift(); }
}, 1000);
function drawFloor(t) {
  const W = fcv.clientWidth, H = fcv.clientHeight, pad = { l: 12, r: 64, t: 20, b: 26 };
  fctx.clearRect(0, 0, W, H);
  const fh = S.floorHist, mh = S.mktHist, n = fh.length;
  const fmin = fh[0] * .98, fmax = fh[n - 1] * 1.02;
  const mmin = Math.min(...mh) * .95, mmax = Math.max(...mh) * 1.05;
  const X = i => pad.l + (W - pad.l - pad.r) * i / (n - 1);
  const Yf = v => H - pad.b - (H - pad.t - pad.b) * .54 * (v - fmin) / (fmax - fmin);
  const Ym = v => pad.t + (H - pad.t - pad.b) * .42 * (1 - (v - mmin) / (mmax - mmin));
  // 网格
  fctx.strokeStyle = '#2c271e'; fctx.lineWidth = 1;
  for (let i = 0; i <= 6; i++) { const y = pad.t + (H - pad.t - pad.b) * i / 6; fctx.beginPath(); fctx.moveTo(pad.l, y); fctx.lineTo(W - pad.r, y); fctx.stroke(); }
  // 市价虚线（右轴）
  fctx.setLineDash([4, 4]); fctx.strokeStyle = '#8a8172'; fctx.beginPath();
  mh.forEach((v, i) => i ? fctx.lineTo(X(i), Ym(v)) : fctx.moveTo(X(i), Ym(v))); fctx.stroke(); fctx.setLineDash([]);
  // 地板阶梯 + 填充
  fctx.beginPath(); fctx.moveTo(X(0), Yf(fh[0]));
  for (let i = 1; i < n; i++) { fctx.lineTo(X(i), Yf(fh[i - 1])); fctx.lineTo(X(i), Yf(fh[i])); }
  const lastX = X(n - 1), lastY = Yf(fh[n - 1]);
  fctx.lineTo(lastX, H - pad.b); fctx.lineTo(X(0), H - pad.b); fctx.closePath();
  const gr = fctx.createLinearGradient(0, pad.t, 0, H); gr.addColorStop(0, 'rgba(240,185,11,.28)'); gr.addColorStop(1, 'rgba(240,185,11,0)');
  fctx.fillStyle = gr; fctx.fill();
  fctx.beginPath(); fctx.moveTo(X(0), Yf(fh[0]));
  for (let i = 1; i < n; i++) { fctx.lineTo(X(i), Yf(fh[i - 1])); fctx.lineTo(X(i), Yf(fh[i])); }
  fctx.strokeStyle = '#f0b90b'; fctx.lineWidth = 2.2; fctx.stroke();
  // 端点
  const pulse = 4 + Math.sin(t / 300) * 2;
  fctx.fillStyle = '#ffd56a'; fctx.beginPath(); fctx.arc(lastX, lastY, pulse, 0, 6.283); fctx.fill();
  fctx.font = '11px "JetBrains Mono",monospace'; fctx.fillStyle = '#ffd56a';
  fctx.fillText((fh[n - 1] * 1e9).toFixed(4), lastX + 8, lastY + 4);
  fctx.fillStyle = '#8a8172'; fctx.fillText('市价', W - pad.r + 6, Ym(mh[n - 1]) + 4);
  fctx.fillStyle = '#3a3327'; fctx.fillRect(pad.l, pad.t + (H - pad.t - pad.b) * .44, W - pad.l - pad.r, 1);
  fctx.fillStyle = '#8a8172'; fctx.fillText('↑ 演示市价（独立刻度）', pad.l + 4, pad.t + (H - pad.t - pad.b) * .44 - 6); fctx.fillText('↓ 地板价（独立刻度）', pad.l + 4, pad.t + (H - pad.t - pad.b) * .44 + 16);
  fctx.fillText('单位：BNB / 10亿枚 · 演示数据', pad.l + 4, pad.t - 6);
  fctx.fillText('5 分钟前', pad.l, H - 8); fctx.fillText('现在', W - pad.r - 26, H - 8);
  requestAnimationFrame(drawFloor);
}
requestAnimationFrame(drawFloor);
function updateRedeem() {
  const a = Math.max(0, +$('#rdAmt').value || 0), px = S.reserve / S.supply;
  const gross = a * px, net = gross * (1 - P.haircut);
  const after = (S.reserve - net) / (S.supply - a);
  $('#rdOut').innerHTML = `拿回 ${fmt(net, 6)} BNB（扣 1% = ${fmt(gross * P.haircut, 6)} 留在储备）<br>赎回后地板价 ${(after * 1e9).toFixed(4)} ≥ 赎回前 ${(px * 1e9).toFixed(4)} <span style="color:var(--teal)">✓ 不降</span>`;
}
$('#rdAmt').addEventListener('input', updateRedeem);

/* ---------- 授权单 ---------- */
function slipLog(s) { const l = $('#slipLog'); const d = document.createElement('div'); d.innerHTML = s; l.prepend(d); while (l.children.length > 5) l.lastChild.remove(); }
$('#agCap').addEventListener('input', e => { $('#agCapV').textContent = (+e.target.value).toFixed(2); setRangeFill(e.target); if (S.agent) S.agent.cap = +e.target.value; });
$('#btnSlip').addEventListener('click', () => {
  if (S.agent) { S.agent = null; $('#slipState').textContent = '已撤销'; $('#slipState').classList.remove('on'); $('#btnSlip').textContent = '演示签发'; slipLog('<b>已撤销</b> · 演示 Agent 之后不会再烧'); return; }
  S.agent = { cap: +$('#agCap').value, spent: 0, tpl: $('#agTpl').value };
  $('#slipState').textContent = '生效中（演示）'; $('#slipState').classList.add('on'); $('#btnSlip').textContent = '撤销授权';
  slipLog(`<b>已签发（演示，未上链）</b> · 只能 burn · 每分钟 ≤ ${S.agent.cap.toFixed(2)} BNB · ${$('#agTtl').value} · 「${S.agent.tpl}」`);
  toast('演示模式：没有请求任何签名。真实版本是在币安钱包里授权，随时可撤。');
});

/* ---------- 启动 ---------- */
// 预填几分钟的结算记录
(() => {
  const now = Math.floor(Date.now() / 60000);
  for (let k = 6; k >= 1; k--) {
    S.minute = now - k - BASE_MIN; S.roundPot = S.potPool * P.release * rnd(.97, 1.03); S.cutSec = 60 - Math.random() * 15;
    S.burns = Array.from({ length: (rnd(2, 9)) | 0 }, () => ({ who: addr(), amt: lognorm(11.8, 1.1), sec: rnd(0, 60) }));
    if (k === 3) S.burns = [{ who: addr(), amt: 120000, sec: 31 }];
    S.carry = []; settleMinute();
  }
  S.carry = [];
})();
setRangeFill($('#agCap'));
setInterval(onBlock, P.blockMs);
setInterval(sim, 1000);
requestAnimationFrame(tick);
sim(); render();
})();
