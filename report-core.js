// report-core.js — shared logic for index.html (input) and preview.html
(function (global) {
  const STORAGE_KEY = 'strategyTesterReportState_v1';

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function fmtNum(n, decimals) {
    if (decimals === undefined) decimals = 2;
    if (n === null || n === undefined || isNaN(n)) return '';
    const neg = n < 0; n = Math.abs(n);
    let s = n.toFixed(decimals);
    let parts = s.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return (neg ? '-' : '') + parts.join('.');
  }
  function fmtInt(n) { return fmtNum(n, 0); }

  // Drawdown-related fields are no longer manual inputs: they are derived
  // live from the actual balance/equity curve (see computeDrawdown below),
  // so every statistic follows whatever curve is currently on screen.
  //
  // Defaults describe a healthy 4-year backtest: +211.4% net profit on a
  // 100,000 deposit, ~12.2% max balance drawdown, 1,450 trades (>1000).
  const DEFAULT_QS = {
    initialDeposit: 100000,
    bars: 24960,
    ticks: 1622400,
    winningTrades: 850,
    losingTrades: 600,
    grossProfit: 446400,
    grossLoss: 235000,
    largestProfitTrade: 4200,
    largestLossTrade: 2600,
    shortTrades: 680,
    shortWonPct: 57.35,
    longTrades: 770,
    longWonPct: 59.74,
    totalDeals: 2900,
    maxConsecWinsCount: 19,
    maxConsecWinsAmount: 8950,
    maxConsecLossesCount: 14,
    maxConsecLossesAmount: 4230,
    maxConsecProfitAmount: 15200,
    maxConsecProfitCount: 24,
    maxConsecLossAmount: 6100,
    maxConsecLossCount: 17,
    sharpeRatio: 1.18
  };

  const DEFAULT_CFG = {
    dateStart: '2022-08-20',
    dateEnd: '2026-08-20',
    marginLabel: '6119%'
  };

  // Noise multiplier tuned (via a small offline search) so the default
  // scenario above lands its balance-drawdown-maximal at ~12.2%.
  const DEFAULT_VOLATILITY = 10.42;

  // Largest peak-to-trough decline of a series, in both $ and %, plus the
  // "absolute" drawdown (how far it ever fell below the initial deposit).
  function computeDrawdown(series, initialDeposit) {
    let peak = series[0];
    let maxAmt = 0, maxAmtPct = 0;
    let maxPct = 0, maxPctAmt = 0;
    let minVal = series[0];
    for (let i = 0; i < series.length; i++) {
      const v = series[i];
      if (v > peak) peak = v;
      const dd = peak - v;
      const ddPct = peak !== 0 ? dd / peak * 100 : 0;
      if (dd > maxAmt) { maxAmt = dd; maxAmtPct = ddPct; }
      if (ddPct > maxPct) { maxPct = ddPct; maxPctAmt = dd; }
      if (v < minVal) minVal = v;
    }
    const absolute = Math.max(0, initialDeposit - minVal);
    return { absolute, maxAmt, maxAmtPct, maxPct, maxPctAmt };
  }

  function computeRows(qs, curve) {
    const totalTrades = qs.winningTrades + qs.losingTrades;
    const totalNetProfit = qs.grossProfit - qs.grossLoss;
    const profitFactor = qs.grossLoss !== 0 ? qs.grossProfit / qs.grossLoss : 0;
    const expectedPayoff = totalTrades !== 0 ? totalNetProfit / totalTrades : 0;
    const avgProfitTrade = qs.winningTrades !== 0 ? qs.grossProfit / qs.winningTrades : 0;
    const avgLossTrade = qs.losingTrades !== 0 ? -(qs.grossLoss / qs.losingTrades) : 0;
    const profitPct = totalTrades !== 0 ? qs.winningTrades / totalTrades * 100 : 0;
    const lossPct = totalTrades !== 0 ? qs.losingTrades / totalTrades * 100 : 0;

    const balanceDD = computeDrawdown(curve.balance, qs.initialDeposit);
    const equityDD = computeDrawdown(curve.equity, qs.initialDeposit);
    const recoveryFactor = balanceDD.maxAmt !== 0 ? totalNetProfit / balanceDD.maxAmt : 0;

    const rows = [
      [["Initial Deposit", fmtNum(qs.initialDeposit)]],
      [["Bars", fmtInt(qs.bars)], ["Ticks", fmtNum(qs.ticks, 0)], ["", ""]],
      [["Total Net Profit", fmtNum(totalNetProfit)], ["Gross Profit", fmtNum(qs.grossProfit)], ["Gross Loss", fmtNum(-qs.grossLoss)]],
      [["Profit Factor", profitFactor.toFixed(2)], ["Expected Payoff", expectedPayoff.toFixed(2)], ["Sharpe Ratio", (+qs.sharpeRatio).toFixed(2)]],
      [["Recovery Factor", recoveryFactor.toFixed(2)], ["", ""], ["", ""]],
      [["Balance Drawdown Absolute", fmtNum(balanceDD.absolute)],
       ["Balance Drawdown Maximal", `${fmtNum(balanceDD.maxAmt)} (${balanceDD.maxAmtPct.toFixed(2)}%)`],
       ["Balance Drawdown Relative", `${balanceDD.maxPct.toFixed(2)}% (${fmtNum(balanceDD.maxPctAmt)})`]],
      [["Equity Drawdown Absolute", fmtNum(equityDD.absolute)],
       ["Equity Drawdown Maximal", `${fmtNum(equityDD.maxAmt)} (${equityDD.maxAmtPct.toFixed(2)}%)`],
       ["Equity Drawdown Relative", `${equityDD.maxPct.toFixed(2)}% (${fmtNum(equityDD.maxPctAmt)})`]],
      [["Total Trades", fmtInt(totalTrades)],
       ["Short Trades (won %)", `${fmtInt(qs.shortTrades)} (${qs.shortWonPct}%)`],
       ["Long Trades (won %)", `${fmtInt(qs.longTrades)} (${qs.longWonPct}%)`]],
      [["Total Deals", fmtInt(qs.totalDeals)],
       ["Profit Trades (% of total)", `${fmtInt(qs.winningTrades)} (${profitPct.toFixed(2)}%)`],
       ["Loss Trades (% of total)", `${fmtInt(qs.losingTrades)} (${lossPct.toFixed(2)}%)`]],
      [["", "Largest"], ["profit trade", fmtNum(qs.largestProfitTrade)], ["loss trade", fmtNum(-qs.largestLossTrade)]],
      [["", "Average"], ["profit trade", fmtNum(avgProfitTrade)], ["loss trade", fmtNum(avgLossTrade)]],
      [["", "Maximum"],
       ["consecutive wins ($)", `${fmtInt(qs.maxConsecWinsCount)} (${fmtNum(qs.maxConsecWinsAmount)})`],
       ["consecutive losses ($)", `${fmtInt(qs.maxConsecLossesCount)} (${fmtNum(-qs.maxConsecLossesAmount)})`]],
      [["", "Maximal"],
       ["consecutive profit (count)", `${fmtNum(qs.maxConsecProfitAmount)} (${fmtInt(qs.maxConsecProfitCount)})`],
       ["consecutive loss (count)", `${fmtNum(-qs.maxConsecLossAmount)} (${fmtInt(qs.maxConsecLossCount)})`]]
    ];
    return { rows, totalTrades, totalNetProfit, balanceDD, equityDD };
  }

  const anchors = [
    [0.00, 100000], [0.05, 100700], [0.09, 101300], [0.13, 100850], [0.17, 101600],
    [0.20, 102400], [0.24, 101650], [0.27, 101300], [0.30, 102200], [0.32, 104500],
    [0.335, 108200], [0.36, 109600], [0.40, 108850], [0.44, 109400], [0.50, 110100],
    [0.55, 110400], [0.58, 111400], [0.62, 112700], [0.66, 114100], [0.70, 115600],
    [0.74, 116300], [0.78, 117200], [0.81, 118600], [0.83, 120500], [0.855, 122600],
    [0.88, 122900], [0.91, 122500], [0.93, 122650], [0.96, 123800], [1.00, 127348]
  ];
  const BASE_START = 100000, BASE_END = 127348;
  function anchorAt(t) {
    for (let i = 1; i < anchors.length; i++) {
      if (t <= anchors[i][0]) {
        const [t0, v0] = anchors[i - 1], [t1, v1] = anchors[i];
        const f = (t - t0) / (t1 - t0 || 1);
        return v0 + (v1 - v0) * f;
      }
    }
    return anchors[anchors.length - 1][1];
  }

  // noiseMult scales how choppy/volatile the generated curve is (and so,
  // roughly, how deep its drawdowns are) independent of the profit target.
  function generateCurve(initialDeposit, finalEquity, N, noiseMult) {
    N = N || 1326;
    noiseMult = noiseMult === undefined ? 1 : noiseMult;
    const rnd = mulberry32(20100104);
    const scaleFactor = (finalEquity - initialDeposit) / (BASE_END - BASE_START || 1);
    const scaleV = v => initialDeposit + (v - BASE_START) * scaleFactor;
    const balance = [], equity = [];
    let noise = 0, eWalk = 0;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      noise += (rnd() - 0.5) * 90 * scaleFactor * noiseMult;
      noise *= 0.9;
      const b = scaleV(anchorAt(t)) + noise;
      balance.push(b);
      const scale = (0.55 + t * t * 3.0) * scaleFactor;
      eWalk = eWalk * 0.80 + (rnd() - 0.5) * 260 * scale;
      let e = b + eWalk;
      if (rnd() < 0.05) e += (rnd() - 0.5) * 900 * scale;
      equity.push(e);
    }
    // Noise can drift the endpoints slightly off-target; snap them back
    // exactly so the chart always matches the deposit/profit figures.
    return rescaleCurve({ balance, equity }, initialDeposit, finalEquity);
  }

  // Move the curve's start/end onto new targets while keeping its shape.
  function rescaleCurve(curve, newStart, newEnd) {
    const oldStart = curve.balance[0];
    const oldEnd = curve.balance[curve.balance.length - 1];
    const denom = (oldEnd - oldStart) || 1;
    const scale = (newEnd - newStart) / denom;
    const scaleArr = arr => arr.map(v => newStart + (v - oldStart) * scale);
    return { balance: scaleArr(curve.balance), equity: scaleArr(curve.equity) };
  }

  function seriesRange(curve) {
    const allV = curve.balance.concat(curve.equity);
    return (Math.max(...allV) - Math.min(...allV)) || 1;
  }

  // Each point independently: nudge up a little, down a little, or leave as-is.
  function randomizeSeries(arr, step) {
    return arr.map(v => {
      const r = Math.random();
      if (r < 0.34) return v;
      const dir = r < 0.67 ? 1 : -1;
      return v + dir * step * (0.3 + Math.random() * 0.7);
    });
  }
  function randomizeCurve(curve) {
    const step = seriesRange(curve) * 0.006;
    return { balance: randomizeSeries(curve.balance, step), equity: randomizeSeries(curve.equity, step) };
  }
  // Equity only — balance untouched.
  function randomizeEquity(curve) {
    const step = seriesRange(curve) * 0.006;
    return { balance: curve.balance, equity: randomizeSeries(curve.equity, step) };
  }
  // Pull equity partway toward balance (one click = one gradual step).
  function pullEquityTowardBalance(curve, factor) {
    factor = factor === undefined ? 0.3 : factor;
    const equity = curve.equity.map((v, i) => v + (curve.balance[i] - v) * factor);
    return { balance: curve.balance, equity };
  }

  // Moving-average smoothing pass, applied to balance & equity independently.
  // One click = one gentle step, not a hard flatten — only blend a fraction
  // of the way toward a moving average, so it takes several clicks to
  // fully smooth out and the user can stop wherever looks right.
  function smoothCurve(curve, blend) {
    blend = blend === undefined ? 0.35 : blend;
    const windowSize = 1;
    const smoothArr = arr => arr.map((v, i) => {
      let sum = 0, count = 0;
      for (let k = -windowSize; k <= windowSize; k++) {
        const idx = i + k;
        if (idx >= 0 && idx < arr.length) { sum += arr[idx]; count++; }
      }
      const avg = sum / count;
      return v + (avg - v) * blend;
    });
    return { balance: smoothArr(curve.balance), equity: smoothArr(curve.equity) };
  }

  function parseCurveCSV(text) {
    const lines = text.trim().split('\n').map(l => l.split(',').map(s => parseFloat(s.trim())));
    const balance = lines.map(l => l[0]).filter(v => !isNaN(v));
    const equity = lines.map((l, i) => (l.length > 1 && !isNaN(l[1])) ? l[1] : balance[i]).slice(0, balance.length);
    if (balance.length < 2) return null;
    return { balance, equity };
  }

  function niceLevels(min, max, count) {
    if (min === max) { min -= 1; max += 1; }
    const levels = [];
    for (let i = 0; i < count; i++) levels.push(Math.round(max - (max - min) * (i / (count - 1))));
    return levels;
  }

  function formatDate(d) {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return `${y}.${m}.${day}`;
  }
  function buildDateLabels(startStr, endStr, count) {
    const start = new Date(startStr), end = new Date(endStr);
    const labels = [];
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const d = new Date(start.getTime() + (end.getTime() - start.getTime()) * t);
      labels.push(formatDate(d));
    }
    return labels;
  }

  function drawChart(cvs, curve, dateLabels, marginLabel) {
    const ctx = cvs.getContext('2d');
    const W = cvs.width, H = cvs.height;
    const mainH = 284, marginH = 40, dateH = H - mainH - marginH;
    const padL = 6, padR = 92;
    const { balance, equity } = curve;

    const allV = balance.concat(equity);
    const levels = niceLevels(Math.min(...allV), Math.max(...allV), 7);
    const lo = levels[levels.length - 1], hi = levels[0];
    function xFor(i, len) { return padL + (i / len) * (W - padL - padR); }
    function yFor(v) { return (1 - (v - lo) / (hi - lo || 1)) * mainH; }

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);

    ctx.textBaseline = 'top';
    ctx.font = 'bold 16px Tahoma, Arial, sans-serif';
    ctx.fillStyle = '#3333cc'; ctx.textAlign = 'left';
    ctx.fillText('Balance', 6, 2);
    const balW = ctx.measureText('Balance').width;
    ctx.fillStyle = '#8a8a8a'; ctx.fillText(' / ', 6 + balW, 2);
    const sepW = ctx.measureText(' / ').width;
    ctx.fillStyle = '#009a00'; ctx.fillText('Equity', 6 + balW + sepW, 2);

    ctx.strokeStyle = '#c2c2c2'; ctx.lineWidth = 1; ctx.setLineDash([2, 2]);
    ctx.font = 'bold 18px Tahoma, Arial, sans-serif'; ctx.fillStyle = '#4a4a4a';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    levels.forEach(v => {
      const y = yFor(v);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillText(String(v), W - padR + 10, Math.max(y, 10));
    });
    dateLabels.forEach((_, i) => {
      const x = padL + (i / (dateLabels.length - 1)) * (W - padL - padR);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, mainH); ctx.stroke();
    });
    ctx.setLineDash([]);

    function drawLine(series, color, width) {
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round';
      series.forEach((v, i) => {
        const x = xFor(i, series.length - 1), y = yFor(v);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    drawLine(balance, '#2233aa', 2.8);
    drawLine(equity, '#00b000', 1.3);

    ctx.strokeStyle = '#8f959d'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, mainH + 1); ctx.lineTo(W, mainH + 1); ctx.stroke();

    const mBase = mainH + marginH - 4;
    const bars = 220;
    const seed2 = mulberry32(4242);
    ctx.fillStyle = '#00b000';
    ctx.beginPath(); ctx.moveTo(padL, mBase);
    for (let i = 0; i <= bars; i++) {
      const x = padL + (i / bars) * (W - padL - padR);
      let h = seed2() * (marginH - 14) * 0.30;
      if (seed2() < 0.05) h = (marginH - 14) * (0.55 + seed2() * 0.45);
      ctx.lineTo(x, mBase - h);
    }
    ctx.lineTo(W - padR, mBase); ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#c81414';
    ctx.font = 'bold 15px Tahoma, Arial, sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(marginLabel || '', W - padR - 2, mainH + 14);
    ctx.textAlign = 'left';

    ctx.fillStyle = '#ebebeb'; ctx.fillRect(0, mainH + marginH, W, dateH);
    ctx.fillStyle = '#555555'; ctx.font = 'bold 12px Tahoma, Arial, sans-serif';
    ctx.textBaseline = 'middle';
    const dy = mainH + marginH + dateH / 2 + 1;
    dateLabels.forEach((d, i) => {
      let x = padL + (i / (dateLabels.length - 1)) * (W - padL - padR);
      if (i === 0) { ctx.textAlign = 'left'; x = padL; }
      else if (i === dateLabels.length - 1) { ctx.textAlign = 'right'; x = W - padR; }
      else { ctx.textAlign = 'center'; }
      ctx.fillText(d, x, dy);
    });
    ctx.textAlign = 'left';
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !s.qs || !s.cfg || !s.curve) return null;
      return s;
    } catch (e) { return null; }
  }
  function saveState(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }
  function defaultState() {
    const qs = Object.assign({}, DEFAULT_QS);
    const cfg = Object.assign({}, DEFAULT_CFG);
    const totalNetProfit = qs.grossProfit - qs.grossLoss;
    const N = qs.winningTrades + qs.losingTrades;
    const curve = generateCurve(qs.initialDeposit, qs.initialDeposit + totalNetProfit, N, DEFAULT_VOLATILITY);
    return { qs, cfg, curve };
  }

  global.ReportCore = {
    STORAGE_KEY, mulberry32, fmtNum, fmtInt, DEFAULT_QS, DEFAULT_CFG,
    computeDrawdown, computeRows, generateCurve, rescaleCurve,
    randomizeCurve, randomizeEquity, pullEquityTowardBalance, smoothCurve,
    parseCurveCSV, niceLevels, buildDateLabels, drawChart,
    loadState, saveState, defaultState
  };
})(window);
