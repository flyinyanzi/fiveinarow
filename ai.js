// ai.js — 旁路AI（读状态 + 点击按钮/棋盘）
// 依赖全局：gameState, skills, currentPlayer, window.playMode, document DOM

(function () {
  // —— 难度：NORMAL ——（可改 EASY / NORMAL / HARD）
  const DIFFICULTY = 'NORMAL';
  const CFG = {
    EASY:   { activeSkill: 0.50, qinna: 0.60, tiaohu: 0.65,  libaCounterOH: 0.80, libaCounterLJ: 0.70, mustWinMiss: 0.10, mustBlockProb: 0.80 },
    NORMAL: { activeSkill: 0.60, qinna: 0.70, tiaohu: 0.75,  libaCounterOH: 0.90, libaCounterLJ: 0.80, mustWinMiss: 0.05, mustBlockProb: 0.95 },
    HARD:   { activeSkill: 0.70, qinna: 0.80, tiaohu: 0.85,  libaCounterOH: 0.95, libaCounterLJ: 0.90, mustWinMiss: 0.01, mustBlockProb: 1.00 },
  }[DIFFICULTY];

  const BOARD_SIZE = 15;

  // 哪个玩家是AI：仅在玩家 vs AI（pve）时启用玩家2为AI
  function getIsAI() {
    const pve = (window.playMode === 'pve');
    return { 1: false, 2: !!pve };
  }

  function rand() { return Math.random(); }

  // ====== 轮询主循环（非侵入式） ======
  setInterval(tick, 120);

  function tick() {
    if (!window.gameState || !document.getElementById('board')) return;

    const isAI = getIsAI();
    const who = gameState.currentPlayer;

    if (!isAI[who]) return;
    if (window.gameOver) return;

    // 有任何技能窗口/输入 → 交由专门反应逻辑或等待
    if (gameState.apocWindow) { handleLibaCounter(who); return; }
    if (gameState.reactionWindow) { handleQinnaTiaohu(who); return; }
    if (gameState.preparedSkill || gameState.apocPrompt) return; // 等待结算/输入

    // 轮到AI的正常回合
    aiTurn(who);
  }

  // ====== 反应：梅开二度窗口（擒拿）/ 调虎离山 ======
  function handleQinnaTiaohu(aiId) {
    const r = gameState.reactionWindow;
    if (!r) return;

    // 1) 擒拿（对手梅开二度准备）
    if (r.forSkillId === 'meikaierdhu' && r.defenderId === aiId) {
      if (rand() <= CFG.qinna) {
        clickButtonInArea(aiId, b => /擒拿/.test(b.innerText));
      }
      return;
    }

    // 2) 调虎离山（被擒后3秒，进攻方=defenderId）
    if (r.forSkillId === 'tiaohulishan' && r.defenderId === aiId) {
      if (rand() <= CFG.tiaohu) {
        clickButtonInArea(aiId, b => /调虎离山/.test(b.innerText));
      }
      return;
    }
  }

  // ====== 反应：力拔山兮 3秒反制窗口 ======
  function handleLibaCounter(aiId) {
    const w = gameState.apocWindow;
    if (!w || w.defenderId !== aiId) return;

    if (w.mode === 'liangji') {
      // 两极反转按钮（3秒内）
      if (rand() <= CFG.libaCounterLJ) {
        clickButtonInArea(aiId, b => /两极反转/.test(b.innerText));
      }
      return;
    }

    if (w.mode === 'liba_select') {
      // 优先手刀（若可用）
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
    for (const b of btns) {
      if (!b.disabled && predicate(b)) { b.click(); return true; }
    }
    return false;
  }

  // ====== AI 正常回合 ======
  function aiTurn(aiId) {
    const me = aiId, opp = 3 - aiId;
    const board = gameState.board;

    // —— 必胜线：若有“一手即胜”，按难度给一点失误率，否则直接赢 —— 
    const winMove = findImmediateWin(board, me);
    if (winMove && rand() > CFG.mustWinMiss) {
      simulateBoardClick(winMove.x, winMove.y);
      return;
    }

    // —— 必防线（盘面）：对手是否有“一手即胜”，若有则高概率堵 —— 
    const oppWin = findImmediateWin(board, opp);
    if (oppWin && rand() <= CFG.mustBlockProb) {
      simulateBoardClick(oppWin.x, oppWin.y);
      return;
    }

    // —— 60% 主动技 —— 
    if (rand() <= CFG.activeSkill) {
      if (tryBestSkill(me)) return;
    }

    // —— 正常下棋（启发式评估）——
    const best = pickHeuristicMove(board, me, opp);
    simulateBoardClick(best.x, best.y);
  }

  // ====== 选择最优技能（只靠按钮 + 启发式） ======
  function tryBestSkill(me) {
    const area = document.getElementById(`player${me}-skill-area`);
    if (!area) return false;
    const btns = Array.from(area.querySelectorAll('button')).filter(b => !b.disabled);
    if (!btns.length) return false;

    // 敌人是否仍有东山/手刀：有则尽量不点力拔（避免白给）
    const hasDongshan = !gameState.dongshanUsed[3 - me];
    const hasShoudao  = !gameState.shoudaoUsed[3 - me];

    // 优先级：静如止水 > 飞沙走石 > 梅开二度 > 力拔山兮（若对方有反制则跳过）
    const order = [/静如止水/, /飞沙走石/, /梅开二度/, /力拔山兮/];

    for (const regex of order) {
      for (const b of btns) {
        if (!regex.test(b.innerText)) continue;
        if (/力拔山兮/.test(b.innerText) && (hasDongshan || hasShoudao)) continue; // 对面还可能反制，先别点
        b.click();
        // 力拔会进入窗口，后续由 handleLibaCounter 接管
        return true;
      }
    }
    return false;
  }

  // ====== 模拟点击棋盘（用实际渲染尺寸，手机不偏移） ======
  function simulateBoardClick(x, y) {
    const canvas = document.getElementById('board');
    const rect = canvas.getBoundingClientRect();
    const cellX = rect.width  / BOARD_SIZE;
    const cellY = rect.height / BOARD_SIZE;

    const cx = rect.left + x * cellX + cellX / 2;
    const cy = rect.top  + y * cellY + cellY / 2;

    canvas.dispatchEvent(new MouseEvent('click', {
      view: window,
      bubbles: true,
      cancelable: true,
      clientX: cx,
      clientY: cy
    }));
  }

  // ====== 即胜/评估/候选 ======
  function findImmediateWin(bd, player) {
    for (let y = 0; y < BOARD_SIZE; y++) for (let x = 0; x < BOARD_SIZE; x++) {
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
    // 候选：距离任意已有棋 ≤2 的空位
    const candidates = new Set();
    for (let y=0; y<BOARD_SIZE; y++) for (let x=0; x<BOARD_SIZE; x++) {
      if (bd[y][x] !== 0) continue;
      if (nearStone(bd, x, y, 2)) candidates.add(x+','+y);
    }
    if (candidates.size === 0) candidates.add('7,7'); // 空盘兜底

    let best = null, bestScore = -1e9;
    for (const key of candidates) {
      const [xs,ys] = key.split(','); const x=+xs, y=+ys;

      // 简单评估：自己分 - 对手分（落此点）
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

  // 粗略打分：考虑四个方向的潜力（活四/冲四/活三/眠三/活二）
  function evalPoint(bd, x, y, p) {
    let sum = 0;
    const dirs = [[1,0],[0,1],[1,1],[1,-1]];
    for (const [dx,dy] of dirs) sum += lineScore(bd, x, y, dx, dy, p);
    return sum;
  }

  function lineScore(bd, x, y, dx, dy, p) {
    // 把落子临时放上去评估
    bd[y][x] = p;
    const count = countLine(bd, x, y, dx, dy, p);
    const openEnds = countOpenEnds(bd, x, y, dx, dy, p);
    bd[y][x] = 0;

    if (count >= 5) return 1e6;
    if (count === 4 && openEnds >= 1) return 50000; // 冲四/活四
    if (count === 3 && openEnds === 2) return 20000; // 活三
    if (count === 3 && openEnds === 1) return 8000;  // 眠三
    if (count === 2 && openEnds === 2) return 3000;  // 活二
    if (count === 2 && openEnds === 1) return 1000;  // 眠二
    return 100 + count*50 + openEnds*30;
  }

  function countLine(bd, x, y, dx, dy, p) {
    let cnt = 1;
    for (let d=1; d<5; d++) { const nx=x+dx*d, ny=y+dy*d; if (bd[ny]?.[nx]===p) cnt++; else break; }
    for (let d=1; d<5; d++) { const nx=x-dx*d, ny=y-dy*d; if (bd[ny]?.[nx]===p) cnt++; else break; }
    return cnt;
  }
  function countOpenEnds(bd, x, y, dx, dy, p) {
    let open = 0;
    let nx = x + dx, ny = y + dy;
    if (bd[ny]?.[nx] === 0) open++;
    nx = x - dx; ny = y - dy;
    if (bd[ny]?.[nx] === 0) open++;
    return open;
  }
})();
