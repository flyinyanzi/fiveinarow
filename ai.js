// ai.js — 旁路AI（读状态 + 点击按钮/棋盘）

(function () {
  // —— 难度：从首页传入，默认 NORMAL ——（EASY / NORMAL / HARD）
  const DIFFICULTY = String((window.aiDifficulty || 'NORMAL')).toUpperCase();
  const CFG_MAP = {
    EASY:   { activeSkill: 0.60, qinna: 0.60, tiaohu: 0.65,  libaCounterOH: 0.80, libaCounterLJ: 0.70, mustWinMiss: 0.12, mustBlockProb: 0.80 },
    NORMAL: { activeSkill: 0.40, qinna: 0.70, tiaohu: 0.75,  libaCounterOH: 0.90, libaCounterLJ: 0.80, mustWinMiss: 0.05, mustBlockProb: 0.95 },
    HARD:   { activeSkill: 0.25, qinna: 0.80, tiaohu: 0.85,  libaCounterOH: 0.95, libaCounterLJ: 0.90, mustWinMiss: 0.01, mustBlockProb: 1.00 },
  };
  const CFG = CFG_MAP[DIFFICULTY] || CFG_MAP.NORMAL;

  const BOARD_SIZE = 15;

  // AI 是否正在执行一个动作序列（防止 tick 重入）
  let aiBusy = false;
  // 梅开二度连续使用计数（连续超过 3 次就暂时不用）
  let meikaiChainCount = 0;

  // 让反制技能真正“按概率触发”
  let lastReactionKey = null;
  let lastApocKey = null;

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
    if (window.gameOver) return;

    const isAI = getIsAI();

    // 如果窗口已经消失，就把对应的 key 清空
    if (!gameState.reactionWindow) lastReactionKey = null;
    if (!gameState.apocWindow) lastApocKey = null;

    // —— 先处理“反制窗口”：不管 currentPlayer 是谁，只看 defender 是不是 AI —— //

    // 梅开二度 / 调虎离山 的 3 秒反应窗口
    if (gameState.reactionWindow) {
      const r = gameState.reactionWindow;
      const d = r.defenderId;   // 该反应的一方
      if (isAI[d]) {
        const key = `${r.forSkillId}-${r.defenderId}-${r.timeoutId}`;
        if (lastReactionKey !== key) {
          lastReactionKey = key;
          if (window.AI_DEBUG) console.log('[AI] handle reactionWindow for player', d);
          handleQinnaTiaohu(d);
        }
        return;
      }
    }

    // 力拔山兮的 3 秒反制窗口（东山 / 手刀 / 两极反转）
    if (gameState.apocWindow) {
      const w = gameState.apocWindow;
      const d = w.defenderId;
      if (isAI[d]) {
        const key = `${w.mode}-${w.attackerId}-${w.defenderId}-${w.timeoutId}`;
        if (lastApocKey !== key) {
          lastApocKey = key;
          if (window.AI_DEBUG) console.log('[AI] handle apocWindow for player', d);
          handleLibaCounter(d);
        }
        return;
      }
    }

    // —— 没有任何反制窗口需要 AI 处理，才进入“正常轮到谁下棋” —— //

    const who = gameState.currentPlayer;

    // 当前不是 AI 的回合，什么都不做
    if (!isAI[who]) return;

    // 调虎离山后的“观战时间”： 1200ms 内 AI 不落子
    if (window.__lastTiaohuTime) {
      const WAIT_MS = 1200;
      const dt = Date.now() - window.__lastTiaohuTime;
      if (dt < WAIT_MS) {
        if (window.AI_DEBUG) console.log('[AI] wait after tiaohu, dt=', dt);
        return;
      } else {
        window.__lastTiaohuTime = null;
      }
    }

    // 如果 AI 正在执行一个回合中的动作（比如刚点了技能，等落子），先不再插手
    if (aiBusy) {
      if (window.AI_DEBUG) console.log('[AI] tick skipped: busy');
      return;
    }

    // 有准备技能/口令输入，但此时 defender 不是 AI 或者窗口刚处理过，这里就只等待，不主动下棋
    if (gameState.preparedSkill || gameState.apocPrompt) return;

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

    // 1. 先看自己有没有必胜点
    const winMove = findImmediateWin(board, me);
    if (winMove && rand() > CFG.mustWinMiss) {
      // 能直接赢：只下这一步，不用技能
      actions.push({ type: 'move', x: winMove.x, y: winMove.y });
      // 本回合没用梅开，连击计数清零
      meikaiChainCount = 0;
      return runActions(actions);
    }

    // 2. 再看对手有没有必胜点（防守逻辑）
    const oppWin = findImmediateWin(board, opp);
    if (oppWin && rand() <= CFG.mustBlockProb) {
      // 先按优先级尝试用技能防守，再补一手落子封点
      planDefenseWithSkills(me, opp, oppWin, actions);
      actions.push({ type: 'move', x: oppWin.x, y: oppWin.y });

      // 统计梅开连击（只看本回合是否计划使用梅开）
      const usedMeikaiThisTurn = actions.some(a => a.type === 'skill' && a.label && /梅开二度/.test(a.label));
      meikaiChainCount = usedMeikaiThisTurn ? (meikaiChainCount + 1) : 0;

      return runActions(actions);
    }

    // 3. 普通局面：先按概率考虑主动用技能，再正常落子
    let usedSkillId = null;
    if (rand() <= CFG.activeSkill) {
      usedSkillId = tryBestSkill(me, actions);
    }

    // 再决定落子点（无论是否刚刚加入了一个技能动作）
    const best = pickHeuristicMove(board, me, opp);
    actions.push({ type: 'move', x: best.x, y: best.y });

    // 更新“梅开二度连续使用次数”
    if (usedSkillId === 'meikaierdhu') {
      meikaiChainCount += 1;
    } else {
      meikaiChainCount = 0;
    }

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
  // 返回本回合计划使用的技能 id（如 'meikaierdhu'），若未选中则返回 null
  function tryBestSkill(me, actions) {
    const area = document.getElementById(`player${me}-skill-area`);
    if (!area) return null;
    const btns = Array.from(area.querySelectorAll('button')).filter(b => !b.disabled);
    if (!btns.length) return null;

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

        // 梅开二度：如果已经连续用了 3 次，本回合就不再点它，改用别的技能/只落子
        if (/梅开二度/.test(b.innerText) && meikaiChainCount >= 3) continue;

        // 静如止水：避免开局就给人来一发（比如至少等双方各下 1 子以后）
        if (/静如止水/.test(b.innerText) && totalMoves < 4) continue;

        if (window.AI_DEBUG) console.log('[AI] plan skill:', b.innerText);

        actions.push({
          type: 'skill',
          button: b,
          label: b.innerText
        });

        // 从按钮文字里粗略猜一下技能 id
        if (/梅开二度/.test(b.innerText)) return 'meikaierdhu';
        if (/飞沙走石/.test(b.innerText)) return 'feishazoushi';
        if (/静如止水/.test(b.innerText)) return 'jingruzhishui';
        if (/力拔山兮/.test(b.innerText)) return 'libashanxi';

        return null;
      }
    }
    return null;
  }

  // 对方存在必胜点时：优先用技能来“防守”一手
  // 顺序：飞沙走石 / 静如止水 → 梅开二度（受连续 3 次上限约束）→ 力拔山兮（仅在对方已形成明显四连威胁时）
  function planDefenseWithSkills(me, opp, oppWin, actions) {
    const area = document.getElementById(`player${me}-skill-area`);
    if (!area) return;
    const btns = Array.from(area.querySelectorAll('button')).filter(b => !b.disabled);
    if (!btns.length) return;

    let feishaBtn = null;
    let jingruBtn = null;
    let meikaiBtn = null;
    let libaBtn   = null;

    for (const b of btns) {
      const txt = b.innerText || '';
      if (/飞沙走石/.test(txt)) feishaBtn = b;
      else if (/静如止水/.test(txt)) jingruBtn = b;
      else if (/梅开二度/.test(txt)) meikaiBtn = b;
      else if (/力拔山兮/.test(txt)) libaBtn = b;
    }

    // 1. 飞沙走石 / 静如止水 优先
    if (feishaBtn) {
      actions.push({ type: 'skill', button: feishaBtn, label: feishaBtn.innerText });
      if (window.AI_DEBUG) console.log('[AI] defense skill: 飞沙走石');
      return;
    }
    if (jingruBtn) {
      actions.push({ type: 'skill', button: jingruBtn, label: jingruBtn.innerText });
      if (window.AI_DEBUG) console.log('[AI] defense skill: 静如止水');
      return;
    }

    // 2. 这两招都已经不可用时，用“梅开二度”拆对方形势（但最多连续 3 次）
    if (meikaiBtn && meikaiChainCount < 3) {
      actions.push({ type: 'skill', button: meikaiBtn, label: meikaiBtn.innerText });
      if (window.AI_DEBUG) console.log('[AI] defense skill: 梅开二度');
      return;
    }

    // 3. 梅开也用过了，并且局面上已经出现活 4 威胁时，最后一招用力拔山兮
    if (libaBtn && hasOpenFour(gameState.board, opp)) {
      actions.push({ type: 'skill', button: libaBtn, label: libaBtn.innerText });
      if (window.AI_DEBUG) console.log('[AI] defense skill: 力拔山兮');
      return;
    }
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

  // 判断棋盘上是否存在“活四”（0 p p p p 0）——任意方向
  function hasOpenFour(bd, player) {
    const dirs = [
      [1, 0],  // 横
      [0, 1],  // 竖
      [1, 1],  // 正斜
      [1, -1], // 反斜
    ];
    const SIZE = 15;

    for (const [dx, dy] of dirs) {
      // 我们检查长度为 6 的线段：0 p p p p 0
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const x5 = x + dx * 5;
          const y5 = y + dy * 5;
          // 确保这 6 个点都在棋盘里
          if (x5 < 0 || x5 >= SIZE || y5 < 0 || y5 >= SIZE) continue;

          const a0 = bd[y][x];
          const a1 = bd[y + dy][x + dx];
          const a2 = bd[y + 2 * dy][x + 2 * dx];
          const a3 = bd[y + 3 * dy][x + 3 * dx];
          const a4 = bd[y + 4 * dy][x + 4 * dx];
          const a5 = bd[y5][x5];

          if (
            a0 === 0 &&
            a1 === player &&
            a2 === player &&
            a3 === player &&
            a4 === player &&
            a5 === 0
          ) {
            return true; // 找到一个活四
          }
        }
      }
    }
    return false;
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
