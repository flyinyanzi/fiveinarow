// ai.js — 旁路AI（读状态 + 点击按钮/棋盘）

(function () {
  // —— 难度：从首页传入，默认 NORMAL ——（EASY / NORMAL / HARD）
  const DIFFICULTY = String((window.aiDifficulty || 'NORMAL')).toUpperCase();
  const CFG_MAP = {
    EASY:   { activeSkill: 0.50, qinna: 0.60, tiaohu: 0.65,  libaCounterOH: 0.80, libaCounterLJ: 0.70, mustWinMiss: 0.10, mustBlockProb: 0.80 },
    NORMAL: { activeSkill: 0.60, qinna: 0.70, tiaohu: 0.75,  libaCounterOH: 0.90, libaCounterLJ: 0.80, mustWinMiss: 0.05, mustBlockProb: 0.95 },
    HARD:   { activeSkill: 0.70, qinna: 0.80, tiaohu: 0.85,  libaCounterOH: 0.95, libaCounterLJ: 0.90, mustWinMiss: 0.01, mustBlockProb: 1.00 },
  };
  const CFG = CFG_MAP[DIFFICULTY] || CFG_MAP.NORMAL;

  const BOARD_SIZE = 15;

  // AI 是否正在执行一个动作序列（防止 tick 重入）
  let aiBusy = false;

  // 哪个玩家是AI：仅在玩家 vs AI（pve）时启用玩家2为AI（全局优先，DOM 兜底）
  function getIsAI() {
    let mode = (typeof window !== 'undefined' ? window.playMode : '') || '';
    if (!mode) {
      const picked = document.querySelector('input[name="play-mode"]:checked');
      if (picked && picked.value) mode = picked.value;
    }
    mode = String(mode).trim().toLowerCase();
    const pve = (mode === 'pve');
    return { 1: false, 2: !!pve };
  }

  function rand() { return Math.random(); }

  // ====== 轮询主循环（非侵入式） ======
  function tick() {
    if (typeof gameState === 'undefined' || !document.getElementById('board')) {
      if (window.AI_DEBUG) console.log('[AI] tick: no gameState or board');
      return;
    }

    // 调虎离山后的“观战时间”： 1200ms 内 AI 不落子
    if (window.__lastTiaohuTime) {
      const WAIT_MS = 1200;  // 想更慢可以改成 1500、1800
      const dt = Date.now() - window.__lastTiaohuTime;
      if (dt < WAIT_MS) {
        if (window.AI_DEBUG) console.log('[AI] wait after tiaohu, dt=', dt);
        return;  // 先让人好好看完“调虎离山”的效果
      } else {
        // 超过等待时间，就清掉标记
        window.__lastTiaohuTime = null;
      }
    }

    const isAI = getIsAI();
    const who = gameState.currentPlayer;

    // 当前不是 AI 的回合
    if (!isAI[who]) return;
    if (window.gameOver) return;

    // 如果 AI 正在执行一个回合中的动作（比如刚点了技能，等落子），先不再插手
    if (aiBusy) {
      if (window.AI_DEBUG) console.log('[AI] tick skipped: busy');
      return;
    }

    // 有任何技能窗口/输入 → 交由专门反应逻辑或等待
    if (gameState.apocWindow) { handleLibaCounter(who); return; }
    if (gameState.reactionWindow) { handleQinnaTiaohu(who); return; }
    if (gameState.preparedSkill || gameState.apocPrompt) return; // 等待结算/输入

    if (window.AI_DEBUG) console.log('[AI] tick turn', who);
    aiTurn(who);
  }

  // 允许主程序“提醒”我走（解决个别环境 setInterval 被系统节流）
  window.__ai_nudge = function() {
    try { tick(); } catch (e) { console.warn('[AI] nudge error', e); }
  };

  // 轮询（120ms 一次）
  setInterval(tick, 120);

  // ====== 反应：梅开二度窗口（擒拿）/ 调虎离山 ======
  function handleQinnaTiaohu(aiId) {
    const r = gameState.reactionWindow;
    if (!r) return;

    // 给反应技加一点“人类延迟”，但不能太长（3 秒窗口内）
    const REACT_DELAY_MS = 300;

    if (r.forSkillId === 'meikaierdhu' && r.defenderId === aiId) {
      if (rand() <= CFG.qinna) {
        setTimeout(() => {
          clickButtonInArea(aiId, b => /擒拿/.test(b.innerText));
        }, REACT_DELAY_MS);
      }
      return;
    }

    if (r.forSkillId === 'tiaohulishan' && r.defenderId === aiId) {
      if (rand() <= CFG.tiaohu) {
        setTimeout(() => {
          clickButtonInArea(aiId, b => /调虎离山/.test(b.innerText));
        }, REACT_DELAY_MS);
      }
      return;
    }
  }

  // ====== 反应：力拔山兮 3秒反制窗口 ======
  function handleLibaCounter(aiId) {
    const w = gameState.apocWindow;
    if (!w || w.defenderId !== aiId) return;

    if (w.mode === 'liangji') {
      if (rand() <= CFG.libaCounterLJ) clickButtonInArea(aiId, b => /两极反转/.test(b.innerText));
      return;
    }

    if (w.mode === 'liba_select') {
      const canShoudao  = buttonExists(aiId, /手刀/);
      const canDongshan = buttonExists(aiId, /捡起棋盘/);

      if ((canShoudao || canDongshan) && rand() <= CFG.libaCounterOH) {
        if (canShoudao) {
          clickButtonInArea(aiId, b => /手刀/.test(b.innerText));
          setTimeout(() => submitApoc(aiId, 'see you again'), 160);
        } else {
          clickButtonInArea(aiId, b => /捡起棋盘/.test(b.innerText));
          setTimeout(() => submitApoc(aiId, '东山再起'), 160);
        }
      }
    }
  }

  function buttonExists(playerId, regexText) {
    const area = document.getElementById(`player${playerId}-skill-area`);
    if (!area) return false;
    const btns = area.querySelectorAll('button');
    return Array.from(btns).some(b => regexText.test(b.innerText) && !b.disabled);
  }

  function submitApoc(playerId, text) {
    const input = document.getElementById(`apoc-input-${playerId}`);
    const send  = document.getElementById(`apoc-send-${playerId}`);
    if (input && send) {
      input.value = text;
      send.click();
    }
  }

  function clickButtonInArea(playerId, predicate) {
    const area = document.getElementById(`player${playerId}-skill-area`);
    if (!area) return false;
    const btns = area.querySelectorAll('button');
    for (const b of btns) if (!b.disabled && predicate(b)) { b.click(); return true; }
    return false;
  }

  // ====== AI 正常回合（改成“动作队列”+ 延迟） ======
  function aiTurn(aiId) {
    const me  = aiId;
    const opp = 3 - aiId;
    const board = gameState.board;

    const actions = []; // [{type:'skill', button, label}, {type:'move', x,y}]

    const winMove = findImmediateWin(board, me);
    if (winMove && rand() > CFG.mustWinMiss) {
      // 能直接赢：只下这一步，不用技能
      actions.push({ type: 'move', x: winMove.x, y: winMove.y });
      return runActions(actions);
    }

    const oppWin = findImmediateWin(board, opp);
    if (oppWin && rand() <= CFG.mustBlockProb) {
      // 必须防守：只挡住对方
      actions.push({ type: 'move', x: oppWin.x, y: oppWin.y });
      return runActions(actions);
    }

    // 若不在立刻赢/立刻防守的状态，才考虑技能
    if (rand() <= CFG.activeSkill) {
      tryBestSkill(me, actions);
    }

    // 再决定落子点（无论是否刚刚加入了一个技能动作）
    const best = pickHeuristicMove(board, me, opp);
    actions.push({ type: 'move', x: best.x, y: best.y });

    runActions(actions);
  }

  // 顺序执行一个回合中的动作：技能 → 落子，中间加入延迟
  function runActions(actions) {
    if (!actions.length) return;

    aiBusy = true;

    const SKILL_DELAY_MS = 700;  // 技能前摇
    const MOVE_DELAY_MS  = 900;  // 落子前摇

    function next() {
      if (!actions.length) {
        aiBusy = false;
        return;
      }
      const act = actions.shift();
      if (act.type === 'skill') {
        setTimeout(() => {
          if (window.gameOver) { aiBusy = false; return; }
          if (window.AI_DEBUG) console.log('[AI] delayed skill:', act.label);
          // button 可能在这段时间里被禁用/消失，所以要再检查一下
          if (act.button && !act.button.disabled && document.body.contains(act.button)) {
            act.button.click();
          }
          next();
        }, SKILL_DELAY_MS);
      } else if (act.type === 'move') {
        setTimeout(() => {
          if (window.gameOver) { aiBusy = false; return; }
          if (window.AI_DEBUG) console.log('[AI] delayed move:', act.x, act.y);
          simulateBoardClick(act.x, act.y);
          // 这里直接结束本回合
          aiBusy = false;
        }, MOVE_DELAY_MS);
      } else {
        // 未知动作，忽略
        next();
      }
    }

    next();
  }

  // 选择技能：不再立即点击，而是把“点击技能按钮”塞进 actions
  function tryBestSkill(me, actions) {
    const area = document.getElementById(`player${me}-skill-area`);
    if (!area) return false;
    const btns = Array.from(area.querySelectorAll('button')).filter(b => !b.disabled);
    if (!btns.length) return false;

    const hasDongshan = !gameState.dongshanUsed[3 - me];
    const hasShoudao  = !gameState.shoudaoUsed[3 - me];

    // 当前总步数，用来避免“第一回合就静如止水”
    const totalMoves = (gameState.moveHistory && gameState.moveHistory.length) || 0;

    // 基础的技能优先级
    let order = [
      /静如止水/,
      /飞沙走石/,
      /梅开二度/,
      /力拔山兮/
    ];

    // 简单洗牌，让套路不要完全固定
    order = shuffleArray(order);

    for (const regex of order) {
      for (const b of btns) {
        if (!regex.test(b.innerText)) continue;

        // ① 力拔山兮：如果对方还有东山/手刀，就尽量少用（和你之前设定一致）
        if (/力拔山兮/.test(b.innerText) && (hasDongshan || hasShoudao)) continue;

        // ② 静如止水：避免开局就给人来一发（比如至少等双方各下 1 子以后）
        if (/静如止水/.test(b.innerText) && totalMoves < 4) continue;

        if (window.AI_DEBUG) console.log('[AI] plan skill:', b.innerText);

        actions.push({
          type: 'skill',
          button: b,
          label: b.innerText
        });
        return true;
      }
    }
    return false;
  }

  // 简单洗牌函数
  function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  // ====== 模拟点击棋盘（三重兜底） ======
  function simulateBoardClick(x, y) {
    const canvas = document.getElementById('board');
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const cellX = rect.width  / BOARD_SIZE;
    const cellY = rect.height / BOARD_SIZE;

    const cx = rect.left + x * cellX + cellX / 2;
    const cy = rect.top  + y * cellY + cellY / 2;

    if (window.AI_DEBUG) console.log('[AI] try click', {x,y,cx,cy});

    // 保险 1：标准 MouseEvent
    let ok = false;
    try {
      const ev = new MouseEvent('click', { view: window, bubbles: true, cancelable: true, clientX: cx, clientY: cy });
      ok = canvas.dispatchEvent(ev);
    } catch (e) { /* 忽略 */ }

    // 保险 2：直接调 onclick 回调
    if (!ok && typeof canvas.onclick === 'function') {
      try {
        canvas.onclick({ clientX: cx, clientY: cy });
        ok = true;
        if (window.AI_DEBUG) console.log('[AI] fallback onclick() invoked');
      } catch (e) { /* 忽略 */ }
    }

    // 保险 3：若页面暴露了 helper，就直接按网格坐标调用
    if (!ok && typeof window.__ai_grid_click === 'function') {
      window.__ai_grid_click(x, y);
      if (window.AI_DEBUG) console.log('[AI] __ai_grid_click used');
    }
  }

  // ====== 即胜/评估/候选 ======
  function findImmediateWin(bd, player) {
    for (let y = 0; y < 15; y++) for (let x = 0; x < 15; x++) {
      if (bd[y][x] !== 0) continue;
      bd[y][x] = player;
      const win = checkWinAt(bd, x, y, player);
      bd[y][x] = 0;
      if (win) return { x, y };
    }
    return null;
  }
  function checkWinAt(bd, x, y, p) {
    const dirs = [[1,0],[0,1],[1,1],[1,-1]];
    for (const [dx,dy] of dirs) {
      let cnt = 1;
      for (let d=1; d<5; d++) { const nx=x+dx*d, ny=y+dy*d; if (bd[ny]?.[nx]===p) cnt++; else break; }
      for (let d=1; d<5; d++) { const nx=x-dx*d, ny=y-dy*d; if (bd[ny]?.[nx]===p) cnt++; else break; }
      if (cnt >= 5) return true;
    }
    return false;
  }

  function pickHeuristicMove(bd, me, opp) {
    const candidates = new Set();
    for (let y=0; y<15; y++) for (let x=0; x<15; x++) {
      if (bd[y][x] !== 0) continue;
      if (nearStone(bd, x, y, 2)) candidates.add(x+','+y);
    }
    if (candidates.size === 0) candidates.add('7,7');

    let best = null, bestScore = -1e9;
    for (const key of candidates) {
      const [xs,ys] = key.split(','); const x=+xs, y=+ys;
      const score = evalPoint(bd, x, y, me) - 0.8 * evalPoint(bd, x, y, opp);
      if (score > bestScore) { bestScore = score; best = {x,y}; }
    }
    return best || {x:7,y:7};
  }
  function nearStone(bd, x, y, dist) {
    for (let dy=-dist; dy<=dist; dy++) for (let dx=-dist; dx<=dist; dx++) {
      if (dx===0 && dy===0) continue;
      const nx=x+dx, ny=y+dy;
      if (bd[ny]?.[nx]) return true;
    }
    return false;
  }
  function evalPoint(bd, x, y, p) {
    let sum = 0;
    const dirs = [[1,0],[0,1],[1,1],[1,-1]];
    bd[y][x] = p;
    for (const [dx,dy] of dirs) {
      const cnt = countLine(bd, x, y, dx, dy, p);
      const open = countOpenEnds(bd, x, y, dx, dy, p);
      if (cnt >= 5) { sum += 1e6; continue; }
      if (cnt === 4 && open >= 1) sum += 50000;
      else if (cnt === 3 && open === 2) sum += 20000;
      else if (cnt === 3 && open === 1) sum += 8000;
      else if (cnt === 2 && open === 2) sum += 3000;
      else if (cnt === 2 && open === 1) sum += 1000;
      else sum += 100 + cnt*50 + open*30;
    }
    bd[y][x] = 0;
    return sum;
  }
  function countLine(bd, x, y, dx, dy, p) {
    let cnt = 1;
    for (let d=1; d<5; d++) { const nx=x+dx*d, ny=y+dy*d; if (bd[ny]?.[nx]===p) cnt++; else break; }
    for (let d=1; d<5; d++) { const nx=x-dx*d, ny=y-dy*d; if (bd[ny]?.[nx]===p) cnt++; else break; }
    return cnt;
  }
  function countOpenEnds(bd, x, y, dx, dy, p) {
    let open = 0;
    let nx = x + dx, ny = y + dy; if (bd[ny]?.[nx] === 0) open++;
    nx = x - dx; ny = y - dy;      if (bd[ny]?.[nx] === 0) open++;
    return open;
  }

  // ===== DEBUG TRIGGER FOR EDGE/MOBILE =====
  window.addEventListener('DOMContentLoaded', () => {
    console.log('[AI] ai.js loaded and ready. Mode =', window.playMode);
    // 如果是 PVE 且轮到AI就立刻尝试一次
    if (window.playMode === 'pve' && window.__ai_nudge) {
      setTimeout(() => {
        console.log('[AI] Initial nudge on DOM ready');
        window.__ai_nudge();
      }, 800);
    }
  });

})();
