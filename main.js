// main.js  —  综艺模式 + 力拔山兮系 完整实现

let playMode = "pvp";      // 当前项目先做本地双人对战
let skillMode = "free";    // 先做“自由选卡”模式
let gameMode = "normal";   // 'normal' | 'relax' 对战 / 解压

// 解压模式：各技能冷却回合数
const RELAX_SKILL_COOLDOWN_TURNS = {
  feishazoushi: 2,      // 飞沙走石
  jingruzhishui: 2,     // 静如止水
  liangjifanzhuan: 5,   // 两极反转
  bangqiu: 3            // 棒球：先设 3 回合，你以后想调再说
};
const RELAX_COOLDOWN_SKILLS = Object.keys(RELAX_SKILL_COOLDOWN_TURNS);

// AI 用两极反转时可能飘出的黑历史台词
const AI_LIANGJI_QUOTES = [
  "揭开黑历史：不爱吃香菜",
  "揭开黑历史：喜欢奇米蛋",
  "揭开黑历史：爱看小马宝莉",
  "揭开黑历史：喜欢听陶喆的歌",
  "揭开黑历史：我会不会又睡到下午了",
  "揭开黑历史：猫猫的叫声让我被治愈"
];

let currentPlayer = 1;
let board;
let gameOver = false;
window.gameOver = false;
window.__bangqiuHitStreak = window.__bangqiuHitStreak || 0;

// —— UI helpers —— 
function showDialogForPlayer(playerId, text) {
  const box = document.getElementById(`dialog-player${playerId}`);
  if (box) box.innerText = text || "";
}
function updateTurnIndicator() {
  const el = document.getElementById("turn-indicator");
  if (!el) return;
  const modeLabel = (gameMode === 'relax') ? '（解压）' : '（对战）';
  el.innerText = `轮到玩家 ${currentPlayer} ${modeLabel}`;
}
function clearDialogs() {
  showDialogForPlayer(1, "");
  showDialogForPlayer(2, "");
}

// —— 游戏状态（集中管理） —— 
const gameState = {
  board: [],
  currentPlayer: 1,
  lastMoveBy: { 1: null, 2: null },
  moveHistory: [],

  // 回合效果
  skipNextTurnFor: null,       // 静如止水：被跳过的人
  bonusTurnPendingFor: null,   // 待开始的额外回合（开始时禁技）
  bonusTurnNoSkillFor: null,   // 额外回合禁技的对象

  // 回合内限制
  skillUsedThisTurn: false,    // 本回合已使用技能
  moveMadeThisTurn: false,     // 本回合已落子

  // 反应窗口 / 准备阶段（梅开二度 ↔ 擒拿 ↔ 调虎）
  preparedSkill: null,         // { playerId, skillId }
  reactionWindow: null,        // { defenderId, forSkillId, timeoutId }

  // 力拔山兮系
  apocWindow: null,            // { attackerId, defenderId, mode:'liba_select'|'liangji', snapshot, timeoutId, deadline }
  apocPrompt: null,            // { defenderId, counterId, expiresAt, timerId }

  // 统计与封印
  libaCount: { 1: 0, 2: 0 },                // 每位玩家力拔山兮使用次数
  libaSealedFor: null,                       // 被两极反转封印力拔的人（1/2/null）
  dongshanUsed: { 1: false, 2: false },      // 东山再起一次性
  shoudaoUsed: { 1: false, 2: false },       // 手刀一次性
  liangjiUsed: { 1: false, 2: false },       // 两极反转（对战模式用，一般一次）

  // 解压模式：技能冷却记录 { skillId: {1: number, 2: number} }
  skillCooldowns: {},

  // 解压模式：力拔山兮爆炸后 3 秒内东山/手刀窗口
  // { attackerId, defenderId, snapshot, removed, timeoutId }
  relaxLibaWindow: null,

  // 工具引用
  showDialogForPlayer,
  clearCell
};

// —— 解压模式：冷却工具 ——
function getCooldown(skillId, playerId) {
  const table = gameState.skillCooldowns[skillId];
  if (!table) return 0;
  return table[playerId] || 0;
}

function setCooldown(skillId, playerId, turns) {
  if (!gameState.skillCooldowns[skillId]) {
    gameState.skillCooldowns[skillId] = { 1: 0, 2: 0 };
  }
  gameState.skillCooldowns[skillId][playerId] = Math.max(0, turns);
}

function tickCooldownsAtTurnStart(playerId) {
  if (gameMode !== 'relax') return;
  RELAX_COOLDOWN_SKILLS.forEach(id => {
    const cd = getCooldown(id, playerId);
    if (cd > 0) {
      setCooldown(id, playerId, cd - 1);
    }
  });
}

// —— 新局前：重置所有技能的使用状态 —— 
function resetAllSkillState() {
  if (typeof skills === 'undefined') return;
  skills.forEach(s => {
    // 清空“哪位玩家用过它”的记录
    s.usedBy = [];
    // 对隐藏技能（擒拿/调虎/东山/手刀/两极）重置可见性
    if (s.hidden && s.visibleFor) {
      s.visibleFor[1] = false;
      s.visibleFor[2] = false;
    }
  });
}

// —— 启动入口 —— 
function startGame() {
  // —— 每局开始：先重置技能状态 —— 
  resetAllSkillState();

  // —— 新局前：清理可能残留的梅开/力拔/口令计时器 —— 
  if (gameState.reactionWindow && gameState.reactionWindow.timeoutId) {
    clearTimeout(gameState.reactionWindow.timeoutId);
  }
  if (gameState.apocWindow && gameState.apocWindow.timeoutId) {
    clearTimeout(gameState.apocWindow.timeoutId);
  }
  if (gameState.apocPrompt && gameState.apocPrompt.timerId) {
    clearInterval(gameState.apocPrompt.timerId);
  }
  gameState.reactionWindow = null;
  gameState.apocWindow = null;
  gameState.apocPrompt = null;

  // —— 读取用户选择并标准化 —— 
  const playModeInput = document.querySelector('input[name="play-mode"]:checked');
  const skillModeInput = document.querySelector('input[name="skill-mode"]:checked');
  const diffSel = document.getElementById('ai-difficulty');

  playMode  = (playModeInput ? playModeInput.value : 'pvp').toLowerCase();   // 'pvp' | 'pve'
  skillMode = (skillModeInput ? skillModeInput.value : 'free');              // 目前我们用自由选
  const aiDiff = (diffSel ? diffSel.value : 'NORMAL').toUpperCase();         // 'EASY'|'NORMAL'|'HARD'

  // —— 新增：读取“游戏模式”（对战 / 解压） —— 
  const gmInput = document.querySelector('input[name="game-mode"]:checked');
  gameMode = gmInput ? gmInput.value : 'normal';   // 'normal' | 'relax'

  // —— 写入全局，供 ai.js 轮询使用 —— 
  window.playMode = playMode;
  window.aiDifficulty = aiDiff;

  // —— 关闭开始菜单（用 hidden class，而不是改 display，方便返回时恢复原始样式） —— 
  const startMenu = document.getElementById("start-menu");
  if (startMenu) startMenu.classList.add("hidden");

  // —— 棋面与状态初始化 —— 
  gameState.board = Array.from({ length: 15 }, () => Array(15).fill(0));
  board = gameState.board;

  currentPlayer = 1;
  gameState.currentPlayer = 1;

  gameState.lastMoveBy = { 1: null, 2: null };
  gameState.moveHistory = [];

  gameOver = false;
  window.gameOver = false;

  // 清空技能/窗口等状态
  gameState.skipNextTurnFor = null;
  gameState.bonusTurnPendingFor = null;
  gameState.bonusTurnNoSkillFor = null;

  gameState.skillUsedThisTurn = false;
  gameState.moveMadeThisTurn = false;

  gameState.preparedSkill = null;
  gameState.reactionWindow = null;

  gameState.apocWindow = null;
  gameState.apocPrompt = null;

  gameState.libaCount = { 1: 0, 2: 0 };
  gameState.libaSealedFor = null;
  gameState.dongshanUsed = { 1: false, 2: false };
  gameState.shoudaoUsed = { 1: false, 2: false };
  gameState.liangjiUsed = { 1: false, 2: false };

  // 解压模式技能冷却清空
  gameState.skillCooldowns = {};

  // 解压版力拔窗口清空
  if (gameState.relaxLibaWindow && gameState.relaxLibaWindow.timeoutId) {
    clearTimeout(gameState.relaxLibaWindow.timeoutId);
  }
  gameState.relaxLibaWindow = null;

  // —— 启动 —— 
  initBoard();
  handleStartOfTurn(); // 会渲染回合提示与技能面板
}

// —— 回合开始：清对白 → 冷却递减 → 跳过 → 额外回合禁技生效 → 刷新UI —— 
function handleStartOfTurn() {
  clearDialogs();
  gameState.skillUsedThisTurn = false;
  gameState.moveMadeThisTurn = false;

  // 解压模式：当前玩家所有需要冷却的技能，回合开始时 CD - 1
  tickCooldownsAtTurnStart(currentPlayer);

  // 被静如止水跳过
  if (gameState.skipNextTurnFor === currentPlayer) {
    gameState.skipNextTurnFor = null;
    showDialogForPlayer(currentPlayer, "……啊？我被定住了（本轮被跳过）");
    currentPlayer = 3 - currentPlayer;
    gameState.currentPlayer = currentPlayer;
    setTimeout(() => {
      clearDialogs();
      if (gameState.bonusTurnPendingFor === currentPlayer) {
        gameState.bonusTurnNoSkillFor = currentPlayer;
      }
      renderSkillPool(1);
      renderSkillPool(2);
      updateTurnIndicator();
    }, 700);
    return;
  }

  if (gameState.bonusTurnPendingFor === currentPlayer) {
    gameState.bonusTurnNoSkillFor = currentPlayer;
  }

  renderSkillPool(1);
  renderSkillPool(2);
  updateTurnIndicator();

  // ★ 新增：在回合开始时检查是否刚刚走完第18手
  showLucky18IfNeeded();
}

// —— 棋盘/UI ——
function initBoard() {
  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const size = 15;
  const cell = canvas.width / size;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < size; i++) {
    ctx.beginPath();
    ctx.moveTo(cell / 2, cell / 2 + i * cell);
    ctx.lineTo(canvas.width - cell / 2, cell / 2 + i * cell);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cell / 2 + i * cell, cell / 2);
    ctx.lineTo(cell / 2 + i * cell, canvas.height - cell / 2);
    ctx.stroke();
  }

  canvas.onclick = function (e) {
    if (gameOver) return;

    // 任一技能窗口/准备/口令期间 禁止落子
    if (gameState.preparedSkill || gameState.reactionWindow || gameState.apocWindow || gameState.apocPrompt) {
      showDialogForPlayer(currentPlayer, "技能结算中，稍候再落子……");
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / (rect.width / 15));
    const y = Math.floor((e.clientY - rect.top)  / (rect.height / 15));

    if (board[y][x] !== 0) return;

    // 落子
    board[y][x] = currentPlayer;
    drawPiece(x, y, currentPlayer);

    gameState.moveMadeThisTurn = true;
    gameState.lastMoveBy[currentPlayer] = { x, y };
    gameState.moveHistory.push({ player: currentPlayer, x, y });

    // —— 对战模式：正常判五连即胜 —— 
    if (gameMode === 'normal') {
      if (checkWinFixed(x, y, currentPlayer)) {
        showDialogForPlayer(currentPlayer, `🎉 玩家${currentPlayer}获胜！`);
        gameOver = true;
        window.gameOver = true;
        // === 隐藏彩蛋：输给 AI 的安慰台词 ===
        if (
          window.playMode === 'pve' &&  // 对战模式是“玩家 vs AI”
          currentPlayer === 2 &&        // AI 是玩家2
          Math.random() < 0.5           // 50% 概率
        ) {
          setTimeout(() => {
            showDialogForPlayer(1, "今天也辛苦了呢，希望你获得快乐～");
          }, 2200);
        }
        return;
      }
    }

    const justPlayed = currentPlayer;
    currentPlayer = 3 - currentPlayer;
    gameState.currentPlayer = currentPlayer;

    // 额外回合结束后清标记
    if (gameState.bonusTurnNoSkillFor === justPlayed) {
      gameState.bonusTurnNoSkillFor = null;
      gameState.bonusTurnPendingFor = null;
    }

    // —— 解压模式：不判输赢，只在棋满时自动结算 —— 
    if (gameMode === 'relax' && isBoardFull()) {
      settleGameByCount('full');
      return;
    }

    handleStartOfTurn();
  };

  // 让 AI 可直接按“网格坐标”落子（终极兜底）：
  window.__ai_grid_click = function(gridX, gridY) {
    const canvas = document.getElementById('board');
    if (!canvas || typeof canvas.onclick !== 'function') return;

    const rect = canvas.getBoundingClientRect();
    const cellX = rect.width  / 15;
    const cellY = rect.height / 15;

    const cx = rect.left + gridX * cellX + cellX / 2;
    const cy = rect.top  + gridY * cellY + cellY / 2;

    // 直接复用 onclick 内部逻辑
    canvas.onclick({ clientX: cx, clientY: cy });
  };
}

function drawPiece(x, y, player) {
  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const cell = canvas.width / 15;
  const cx = x * cell + cell / 2;
  const cy = y * cell + cell / 2;
  const radius = cell / 2.5;

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
  ctx.fillStyle = player === 1 ? "black" : "white";
  ctx.fill();
  ctx.stroke();
}

function clearCell(x, y) {
  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const cell = canvas.width / 15;
  ctx.clearRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2);

  ctx.beginPath();
  ctx.moveTo(x * cell + cell / 2, y * cell);
  ctx.lineTo(x * cell + cell / 2, y * cell + cell);
  ctx.moveTo(x * cell, y * cell + cell / 2);
  ctx.lineTo(x * cell + cell, y * cell + cell / 2);
  ctx.stroke();
}

// —— 胜负判断 —— 
function checkWinFixed(x, y, player) {
  const dirs = [[1,0],[0,1],[1,1],[1,-1]];
  for (let [dx,dy] of dirs) {
    let count = 1;
    for (let d=1; d<5; d++) {
      const nx = x + dx*d, ny = y + dy*d;
      if (board[ny]?.[nx] === player) count++; else break;
    }
    for (let d=1; d<5; d++) {
      const nx = x - dx*d, ny = y - dy*d;
      if (board[ny]?.[nx] === player) count++; else break;
    }
    if (count >= 5) return true;
  }
  return false;
}

function checkAnyWin(player) {
  // 粗暴扫描：只要出现任一点作为“连珠中心”满足就算赢
  for (let y=0; y<15; y++) {
    for (let x=0; x<15; x++) {
      if (board[y][x] !== player) continue;
      if (checkWinFixed(x,y,player)) return true;
    }
  }
  return false;
}

// —— 工具 —— 
function countPiecesOf(playerId){
  let cnt=0;
  for (let y=0;y<15;y++) for (let x=0;x<15;x++) if (board[y][x]===playerId) cnt++;
  return cnt;
}

function handleBangqiuRelax(playerId) {
  // 简化版：50% 本垒打，50% miss
  const hit = Math.random() < 0.5;

  if (hit) {
    window.__bangqiuHitStreak++;
  } else {
    window.__bangqiuHitStreak = 0;
  }

  if (!hit) {
    showDialogForPlayer(playerId, "呀嘞呀嘞，没打中~");
    return;
  }

  // 本垒打：随机打飞一颗任意棋子
  const stones = [];
  for (let y = 0; y < 15; y++) {
    for (let x = 0; x < 15; x++) {
      if (board[y][x] !== 0) {
        stones.push({ x, y, owner: board[y][x] });
      }
    }
  }

  if (stones.length === 0) {
    showDialogForPlayer(playerId, "本垒打！不过棋盘上还空空的，不能打飞棋子咯。");
  } else {
    const choice = stones[Math.floor(Math.random() * stones.length)];
    board[choice.y][choice.x] = 0;
    clearCell(choice.x, choice.y);

    showDialogForPlayer(playerId, "本垒打！把一颗棋子打飞出场！");
  }

  // ★ 隐藏彩蛋：连续三次命中，延迟再夸一句
  if (window.__bangqiuHitStreak >= 3) {
    window.__bangqiuHitStreak = 0;
    setTimeout(() => {
      showDialogForPlayer(playerId, "你是职业棒球手吗？");
    }, 1500); // 约 1.5 秒后再说
  }
}

function isBoardFull() {
  for (let y = 0; y < 15; y++) {
    for (let x = 0; x < 15; x++) {
      if (board[y][x] === 0) return false;
    }
  }
  return true;
}

function isBoardEmpty() {
  for (let y = 0; y < 15; y++) {
    for (let x = 0; x < 15; x++) {
      if (board[y][x] !== 0) return false;
    }
  }
  return true;
}

// 按子数结算：source='early'（提前）|'full'（棋满）
function settleGameByCount(source) {
  if (gameOver) return;

  const c1 = countPiecesOf(1);
  const c2 = countPiecesOf(2);

  let msgCenter = (source === 'early') ? "提前结算：" : "棋满结算：";
  msgCenter += `黑方 ${c1} 子，白方 ${c2} 子。`;

  if (c1 > c2) {
    showDialogForPlayer(1, msgCenter + " 我这边略胜一筹～");
    showDialogForPlayer(2, "这局就先到这里，下次我会打回来的！");
  } else if (c2 > c1) {
    // 这里是玩家2赢（在 PVE 里就是 AI 赢）
    showDialogForPlayer(2, msgCenter + " 我这边略胜一筹～");
    showDialogForPlayer(1, "先这样吧，下次换我反攻！");

    // 提前结算彩蛋（对玩家1说）
    if (source === 'early') {
      maybeShowEarlySettleLines(1);
    }

    // 输给 AI 时的安慰台词
    maybeShowAiComfortForLoser(1);
  } else {
    showDialogForPlayer(1, msgCenter + " 平手。");
    showDialogForPlayer(2, "平局～下次再战。");
  }

  gameOver = true;
  window.gameOver = true;
}

// 检查“对于 playerId 来说，棋盘上是否存在任何一颗敌方棋”
// 敌方 = 3 - playerId
function hasEnemyPieceFor(playerId) {
  const enemy = 3 - playerId;
  const bd = gameState.board;   // 这里用 gameState.board，确保是最新盘面

  if (!bd) return false;

  for (let y = 0; y < 15; y++) {
    for (let x = 0; x < 15; x++) {
      if (bd[y][x] === enemy) {
        return true;
      }
    }
  }
  return false;
}

// —— 梅开二度：准备阶段 + 擒拿窗口 ——
function startPreparedSkill(playerId, skillId) {
  gameState.preparedSkill = { playerId, skillId };
  showDialogForPlayer(playerId, "梅开二度，准备出手！");

  const defenderId = 3 - playerId;

  // 解压模式：50% 概率给出擒拿窗口；对战模式：必出
  const allowQinNa = (gameMode === 'relax') ? (Math.random() < 0.5) : true;

  const to = setTimeout(() => {
    // 无人反应 → 结算
    if (
      gameState.preparedSkill &&
      gameState.preparedSkill.playerId === playerId &&
      gameState.preparedSkill.skillId === 'meikaierdhu'
    ) {
      resolvePreparedSkill();
    }
  }, 3000);

  gameState.reactionWindow = {
    defenderId,
    forSkillId: 'meikaierdhu',
    timeoutId: to,
    allowQinNa
  };

  renderSkillPool(1);
  renderSkillPool(2);
}

function resolvePreparedSkill() {
  const prep = gameState.preparedSkill;
  if (!prep) return;
  const caster = prep.playerId;
  const opp = 3 - caster;

  const move = gameState.lastMoveBy[opp];
  if (move) {
    gameState.board[move.y][move.x] = 0;
    gameState.clearCell(move.x, move.y);
    showDialogForPlayer(caster, "梅开二度！再飞你一次！");
  } else {
    showDialogForPlayer(caster, "对方还没有落子，无计可施哦");
  }

  // 计入“该玩家用过梅开二度”（每人一次标记，不限次可见与否看你的需求）
  const meikai = skills.find(s => s.id === 'meikaierdhu');
  if (meikai) {
    meikai.usedBy = meikai.usedBy || [];
    if (!meikai.usedBy.includes(caster)) meikai.usedBy.push(caster);
  }

  gameState.skillUsedThisTurn = true;

  if (gameState.reactionWindow?.timeoutId) clearTimeout(gameState.reactionWindow.timeoutId);
  gameState.reactionWindow = null;
  gameState.preparedSkill = null;

  renderSkillPool(1); renderSkillPool(2);
}

function cancelPreparedSkill(byPlayerId) {
  const prep = gameState.preparedSkill;
  if (!prep) return;
  const attacker = prep.playerId;
  const defender = 3 - attacker;
  if (byPlayerId !== defender) return;

  showDialogForPlayer(defender, "擒拿擒拿，擒擒又拿拿！");
  showDialogForPlayer(attacker, "我的梅开二度被擒住了？！");

  if (gameState.reactionWindow?.timeoutId) clearTimeout(gameState.reactionWindow.timeoutId);
  gameState.reactionWindow = null;
  gameState.preparedSkill = null;

  // —— 解压模式：调虎离山出现与否 50% 概率 —— 
  if (gameMode === 'relax') {
    const allowTiaoHu = Math.random() < 0.5;
    if (allowTiaoHu) {
      markSkillVisibleFor('tiaohulishan', attacker, true);
      const to = setTimeout(() => {
        markSkillVisibleFor('tiaohulishan', attacker, false);
        if (gameState.reactionWindow?.timeoutId) clearTimeout(gameState.reactionWindow.timeoutId);
        gameState.reactionWindow = null;
        renderSkillPool(1);
        renderSkillPool(2);
      }, 3000);
      gameState.reactionWindow = {
        defenderId: attacker,
        forSkillId: 'tiaohulishan',
        timeoutId: to
      };
    } else {
      // 不出现调虎，直接结束
      renderSkillPool(1);
      renderSkillPool(2);
    }
    return;
  }

  // —— 对战模式：保持原逻辑，必出调虎离山 —— 
  markSkillVisibleFor('tiaohulishan', attacker, true);
  const to = setTimeout(() => {
    markSkillVisibleFor('tiaohulishan', attacker, false);
    if (gameState.reactionWindow?.timeoutId) clearTimeout(gameState.reactionWindow.timeoutId);
    gameState.reactionWindow = null;
    renderSkillPool(1);
    renderSkillPool(2);
  }, 3000);
  gameState.reactionWindow = {
    defenderId: attacker,
    forSkillId: 'tiaohulishan',
    timeoutId: to
  };

  renderSkillPool(1);
  renderSkillPool(2);
}

// —— mark 可见性 —— 
function markSkillVisibleFor(skillId, playerId, visible, timeoutMs) {
  const s = skills.find(x => x.id === skillId);
  if (!s) return;
  s.visibleFor = s.visibleFor || { 1: true, 2: true };
  s.visibleFor[playerId] = visible;

  renderSkillPool(playerId);

  if (visible && timeoutMs) {
    setTimeout(() => {
      if (!s.usedBy || !s.usedBy.includes(playerId)) {
        s.visibleFor[playerId] = false;
        renderSkillPool(playerId);
      }
    }, timeoutMs);
  }
}

// ——————————————————————————————
// 力拔山兮 / 东山再起 / 手刀 / 两极反转
// —————————————————————————————— 

function deepCopyBoard(bd){ return bd.map(r => r.slice()); }
function snapshotGame(){
  return {
    board: deepCopyBoard(gameState.board),
    currentPlayer: currentPlayer,
    lastMoveBy: {
      1: gameState.lastMoveBy[1] ? { ...gameState.lastMoveBy[1] } : null,
      2: gameState.lastMoveBy[2] ? { ...gameState.lastMoveBy[2] } : null
    },
    moveHistory: gameState.moveHistory.map(m => ({...m}))
  };
}
function applySnapshot(snap){
  gameState.board = snap.board.map(r => r.slice());
  board = gameState.board;

  // 重绘全盘
  initBoard();
  for (let y=0; y<15; y++) for (let x=0; x<15; x++) {
    const v = board[y][x];
    if (v === 1) drawPiece(x,y,1);
    if (v === 2) drawPiece(x,y,2);
  }

  gameState.lastMoveBy = {
    1: snap.lastMoveBy[1] ? { ...snap.lastMoveBy[1] } : null,
    2: snap.lastMoveBy[2] ? { ...snap.lastMoveBy[2] } : null
  };
  gameState.moveHistory = snap.moveHistory.map(m => ({...m}));

  currentPlayer = snap.currentPlayer;
  gameState.currentPlayer = currentPlayer;
  updateTurnIndicator();
}

function startLibashanxi(attackerId) {
  if (gameOver) return;

  // —— 解压模式：使用爆炸洗牌版，不走东山/手刀/两极那套 —— 
  if (gameMode === 'relax') {
    startLibashanxiRelax(attackerId);
    return;
  }

  // 被两极反转封印？
  if (gameState.libaSealedFor === attackerId) {
    showDialogForPlayer(attackerId, "我的力拔山兮已被封印……");
    return;
  }

  const defenderId = 3 - attackerId;
  const snap = snapshotGame();

  // 统计使用次数（用于演出/统计；不决定触发，两极反转依条件出现按钮）
  gameState.libaCount[attackerId]++;

  // 清理旧窗口
  if (gameState.apocWindow?.timeoutId) clearTimeout(gameState.apocWindow.timeoutId);
  if (gameState.apocPrompt?.timerId) clearInterval(gameState.apocPrompt.timerId);
  gameState.apocPrompt = null;

  // 判定应显示哪些克制按钮
  const canDongshan = !gameState.dongshanUsed[defenderId];
  const canShoudao  = !gameState.shoudaoUsed[defenderId];
  const canLiangji  = (gameState.dongshanUsed[defenderId] && gameState.shoudaoUsed[defenderId] && !gameState.liangjiUsed[defenderId]);

  let mode = 'liba_select';
  if (!canDongshan && !canShoudao && canLiangji) {
    mode = 'liangji';
  } else if (!canDongshan && !canShoudao && !canLiangji) {
    // 没有任何克制手段 → A 直接胜
    resolveLibashanxiSuccess(attackerId);
    return;
  }

  const timeoutId = setTimeout(() => {
    // 3秒内未点按钮 → A 直接胜
    resolveLibashanxiSuccess(attackerId);
  }, 3000);

  gameState.apocWindow = {
    attackerId, defenderId, mode,
    snapshot: snap,
    timeoutId,
    deadline: Date.now() + 3000  // 仅用于显示剩余秒数（可选）
  };

  // 渲染可选按钮（窗口内强制可点，由 renderSkillPool 特殊渲染）
  showDialogForPlayer(attackerId, "力拔山兮！！！棋盘已被掀翻！");
  if (mode === 'liba_select') {
    showDialogForPlayer(defenderId, "（3秒内可选择：捡起棋盘 / 手刀）");
  } else {
    showDialogForPlayer(defenderId, "（3秒内可选择：两极反转）");
  }

  renderSkillPool(1); renderSkillPool(2);
}

// —— 解压模式下的“爆炸洗牌版”力拔山兮 ——
function startLibashanxiRelax(attackerId) {
  const defenderId = 3 - attackerId;

  // 记录爆炸前快照（用于东山再起恢复）
  const snap = snapshotGame();

  // 收集棋子位置
  const own = [];
  const opp = [];
  for (let y = 0; y < 15; y++) {
    for (let x = 0; x < 15; x++) {
      if (board[y][x] === attackerId) own.push({ x, y });
      else if (board[y][x] === defenderId) opp.push({ x, y });
    }
  }

  if (own.length === 0 && opp.length === 0) {
    showDialogForPlayer(attackerId, "棋盘上还没什么东西可以掀……再下几手再试吧。");
    return;
  }

  // 抖一抖
  const canvas = document.getElementById('board');
  if (canvas) {
    canvas.classList.add('shake-board');
    setTimeout(() => canvas.classList.remove('shake-board'), 600);
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  shuffle(opp);
  shuffle(own);

  // 设定要炸掉的总数：3～7 颗，但不能超过总子数
  const totalStones = own.length + opp.length;
  const maxRemove = Math.min(totalStones, 7);
  const minRemove = Math.min(maxRemove, 3);
  const removeCount = minRemove + Math.floor(Math.random() * (maxRemove - minRemove + 1));

  const toRemove = [];

  // 优先炸对方，最多 4 颗
  const oppRemove = Math.min(4, opp.length, removeCount);
  for (let i = 0; i < oppRemove; i++) {
    toRemove.push({ ...opp[i], owner: defenderId });
  }

  let remaining = removeCount - oppRemove;
  const ownRemove = Math.min(remaining, own.length);
  for (let i = 0; i < ownRemove; i++) {
    toRemove.push({ ...own[i], owner: attackerId });
  }

  // 真正从棋盘上移除
  toRemove.forEach(p => {
    board[p.y][p.x] = 0;
    clearCell(p.x, p.y);
  });

  showDialogForPlayer(attackerId, `力拔山兮！！！棋盘一阵天翻地覆，炸飞了 ${toRemove.length} 颗棋。`);
  showDialogForPlayer(defenderId, `刚刚有 ${oppRemove} 颗棋子被掀飞了……自己的也被卷进去了一点。`);

  // 记录这次爆炸，用于东山/手刀
  if (gameState.relaxLibaWindow && gameState.relaxLibaWindow.timeoutId) {
    clearTimeout(gameState.relaxLibaWindow.timeoutId);
  }
  gameState.relaxLibaWindow = null;

  const state = {
    attackerId,
    defenderId,
    snapshot: snap,
    removed: toRemove,
    timeoutId: null
  };
  gameState.relaxLibaWindow = state;

  // 判定是否给防守方东山/手刀按钮
  const canDongshan = !gameState.dongshanUsed[defenderId];
  const canShoudao = !gameState.shoudaoUsed[defenderId];

  let anyVisible = false;
  if (canDongshan && Math.random() < 0.5) {
    markSkillVisibleFor('dongshanzaiqi', defenderId, true);
    anyVisible = true;
  }
  if (canShoudao && Math.random() < 0.5) {
    markSkillVisibleFor('shou_dao', defenderId, true);
    anyVisible = true;
  }

  if (anyVisible) {
    state.timeoutId = setTimeout(() => {
      markSkillVisibleFor('dongshanzaiqi', defenderId, false);
      markSkillVisibleFor('shou_dao', defenderId, false);
      gameState.relaxLibaWindow = null;
      renderSkillPool(1);
      renderSkillPool(2);
    }, 3000);
  }

  // 解压模式下：力拔山兮只是搞事情，不结束游戏
  gameState.skillUsedThisTurn = true;
}

// 解压版东山再起效果
function triggerDongshanRelax(defenderId) {
  const win = gameState.relaxLibaWindow;
  if (!win || win.defenderId !== defenderId) return;

  // 清按钮 & 计时器
  if (win.timeoutId) clearTimeout(win.timeoutId);
  markSkillVisibleFor('dongshanzaiqi', defenderId, false);
  markSkillVisibleFor('shou_dao', defenderId, false);
  gameState.relaxLibaWindow = null;

  // 恢复到爆炸前的棋盘
  applySnapshot(win.snapshot);
  gameState.dongshanUsed[defenderId] = true;

  showDialogForPlayer(defenderId, "东山再起，把刚才炸掉的棋子全捡回来了。");
  showDialogForPlayer(win.attackerId, "什么？刚刚的爆炸好像变成梦一场……");

  renderSkillPool(1);
  renderSkillPool(2);
}

// 解压版手刀效果
function triggerShoudaoRelax(defenderId) {
  const win = gameState.relaxLibaWindow;
  if (!win || win.defenderId !== defenderId) return;

  const attackerId = win.attackerId;

  if (win.timeoutId) clearTimeout(win.timeoutId);
  markSkillVisibleFor('dongshanzaiqi', defenderId, false);
  markSkillVisibleFor('shou_dao', defenderId, false);
  gameState.relaxLibaWindow = null;

  // 手刀效果：对方下回合被跳过，自己多一回合（静如止水那套）
  gameState.shoudaoUsed[defenderId] = true;
  gameState.skipNextTurnFor = attackerId;
  gameState.bonusTurnPendingFor = defenderId;

  showDialogForPlayer(defenderId, "手刀！这回合开始由我接管了～");
  showDialogForPlayer(attackerId, "啊——啊——APT、APT…");

  // 轮到防守方（现在的“手刀施放者”）继续
  currentPlayer = defenderId;
  gameState.currentPlayer = defenderId;
  handleStartOfTurn();
}

// === 隐藏彩蛋：提前结算时的温柔话 ===
function maybeShowEarlySettleLines(targetPlayerId) {
  if (Math.random() >= 0.3) return;  // 30% 概率

  setTimeout(() => {
    const text = "这盘棋没有输赢，只是一起坐了一会儿，以及我们每个人都要补充营养。";
    showDialogForPlayer(targetPlayerId, text);
  }, 2200); // 2.2 秒后再说，避免秒覆盖前一句
}

// === 隐藏彩蛋：输给 AI 的安慰台词 ===
function maybeShowAiComfortForLoser(loserId) {
  if (window.playMode !== 'pve') return;
  if (Math.random() >= 0.5) return; // 50% 概率

  setTimeout(() => {
    showDialogForPlayer(loserId, "今天也辛苦了呢，希望你获得快乐～");
  }, 2200); // 再晚一点出现，接在上面的台词后面
}


// === 隐藏彩蛋：解压模式第18回合提示 ===
function showLucky18IfNeeded() {
  if (gameMode !== 'relax') return;

  const moves = (gameState.moveHistory && gameState.moveHistory.length) || 0;
  if (moves !== 18) return;

  if (Math.random() < 0.5) {
    // 第 18 手已经落完，此时 currentPlayer 已经切换到下一位
    const lastMove = gameState.moveHistory[gameState.moveHistory.length - 1];
    const target = lastMove ? lastMove.player : currentPlayer;

    showDialogForPlayer(
      target,
      "现在是第18回合，很幸运的数字呢。"
    );
  }
}

function openApocPrompt(defenderId, counterId) {
  const win = gameState.apocWindow;
  if (!win || win.defenderId !== defenderId) return;
  if (Date.now() > win.deadline) return;

  // 关闭3秒总计时器，后续由10秒口令控制成败
  if (win.timeoutId) clearTimeout(win.timeoutId);

  // 清理旧prompt
  if (gameState.apocPrompt?.timerId) clearInterval(gameState.apocPrompt.timerId);
  gameState.apocPrompt = null;

  const area = document.getElementById(`player${defenderId}-skill-area`);
  let panel = document.getElementById(`apoc-prompt-${defenderId}`);
  if (panel) panel.remove();

  panel = document.createElement('div');
  panel.id = `apoc-prompt-${defenderId}`;
  panel.className = 'apoc-prompt';
  panel.style.marginTop = '8px';
  panel.style.padding = '6px';
  panel.style.border = '1px dashed #888';

  // 10秒口令倒计时
  const deadline = Date.now() + 10000;
  const isDongshan = (counterId === 'dongshanzaiqi');
  const tip = isDongshan ? '需要在十秒内输入四个字' : '需要在十秒内输入三个单词';
  const placeholder = isDongshan ? '东山再起' : 'see you again';

  panel.innerHTML = `
    <div style="margin-bottom:4px;">${tip}</div>
    <input id="apoc-input-${defenderId}" type="text" style="width: 160px; margin-right:6px;" placeholder="${placeholder}" />
    <button id="apoc-send-${defenderId}">发送</button>
    <span id="apoc-count-${defenderId}" style="margin-left:8px;">(10s)</span>
  `;
  area.appendChild(panel);

  const timerId = setInterval(() => {
    const left = Math.max(0, Math.ceil((deadline - Date.now())/1000));
    const span = document.getElementById(`apoc-count-${defenderId}`);
    if (!span) { clearInterval(timerId); return; }
    span.innerText = `(${left}s)`;
    if (left <= 0) {
      clearInterval(timerId);
      // 超时 → A 胜
      resolveLibashanxiSuccess(win.attackerId);
    }
  }, 300);

  document.getElementById(`apoc-send-${defenderId}`).onclick = () => {
    const val = document.getElementById(`apoc-input-${defenderId}`).value || "";
    handleApocSubmit(defenderId, counterId, val, deadline);
  };

  gameState.apocPrompt = { defenderId, counterId, expiresAt: deadline, timerId };
}

function handleApocSubmit(defenderId, counterId, text, deadline) {
  const win = gameState.apocWindow;
  if (!win || win.defenderId !== defenderId) return;

  // 口令核验
  let ok = false;
  if (counterId === 'dongshanzaiqi') {
    ok = (text.trim() === "东山再起") && (Date.now() <= deadline);
  } else if (counterId === 'shou_dao') {
    ok = (text.trim().toLowerCase() === "see you again") && (Date.now() <= deadline);
  }

  // 清理输入面板与倒计时
  const panel = document.getElementById(`apoc-prompt-${defenderId}`);
  if (panel) panel.remove();
  if (gameState.apocPrompt?.timerId) clearInterval(gameState.apocPrompt.timerId);
  gameState.apocPrompt = null;

  if (!ok) {
    // 错误/超时均视作失败 → A 胜
    resolveLibashanxiSuccess(win.attackerId);
    return;
  }

  // 口令成功 → 清理窗口按钮
  markSkillVisibleFor('dongshanzaiqi', defenderId, false);
  markSkillVisibleFor('shou_dao', defenderId, false);

  // 执行对应反制
  const attacker = win.attackerId;
  if (counterId === 'dongshanzaiqi') {
    applySnapshot(win.snapshot);
    gameState.dongshanUsed[defenderId] = true;

    showDialogForPlayer(defenderId, "我东山再起");
    setTimeout(() => {
      showDialogForPlayer(attacker, "什么，你竟然创造新词，那可是最高的奥！义！");
      setTimeout(() => {
        showDialogForPlayer(defenderId, "我只是参加过九年义务教！育！");
      }, 600);
    }, 600);

    gameState.apocWindow = null;
    renderSkillPool(1); renderSkillPool(2);
    return;
  }

  if (counterId === 'shou_dao') {
    // 复原到力拔前
    applySnapshot(win.snapshot);
    // 给进攻方上“静如止水”
    const caster = defenderId;
    const target = attacker;
    gameState.shoudaoUsed[defenderId] = true;

    gameState.skipNextTurnFor = target;
    gameState.bonusTurnPendingFor = caster;

    showDialogForPlayer(caster, "see you again～");
    setTimeout(() => { showDialogForPlayer(target, "啊——啊——APT、APT…"); }, 700);

    gameState.apocWindow = null;

    // 切到防守方开始回合（他的额外回合禁技会在 handleStartOfTurn 生效）
    currentPlayer = caster;
    gameState.currentPlayer = caster;
    handleStartOfTurn();
    return;
  }
}

function resolveLibashanxiSuccess(attackerId) {
  // 清窗口与输入
  if (gameState.apocWindow?.timeoutId) clearTimeout(gameState.apocWindow.timeoutId);
  gameState.apocWindow = null;
  if (gameState.apocPrompt?.timerId) clearInterval(gameState.apocPrompt.timerId);
  gameState.apocPrompt = null;

  markSkillVisibleFor('dongshanzaiqi', 3 - attackerId, false);
  markSkillVisibleFor('shou_dao', 3 - attackerId, false);

  showDialogForPlayer(attackerId, "力拔山兮成功！棋盘炸裂——我赢了！");
  showDialogForPlayer(3 - attackerId, "（没来得及反应……）");
  gameOver = true;
  window.gameOver = true;
  // === 隐藏彩蛋：输给 AI 的安慰台词 ===
  maybeShowAiComfortForLoser(1);
}

// 两极反转：在力拔选择窗口中（当东山/手刀都已用）给防守方3秒按钮
function triggerLiangji(defenderId) {
  const win = gameState.apocWindow;
  if (!win || win.defenderId !== defenderId || win.mode !== 'liangji') return;

  const attackerId = win.attackerId;

  // 清理窗口
  if (win.timeoutId) clearTimeout(win.timeoutId);
  markSkillVisibleFor('dongshanzaiqi', defenderId, false);
  markSkillVisibleFor('shou_dao', defenderId, false);

  gameState.apocWindow = null;

  applySwapPieces();

  // 封印进攻方的力拔山兮
  gameState.libaSealedFor = attackerId;
  gameState.liangjiUsed[defenderId] = true;

  // 两极反转后立刻重算胜负
  const p1win = checkAnyWin(1);
  const p2win = checkAnyWin(2);
  if (p1win && !p2win) {
    showDialogForPlayer(1, "（两极反转后）我这边五连了！");
    gameOver = true; window.gameOver = true; return;
  }
  if (p2win && !p1win) {
    showDialogForPlayer(2, "（两极反转后）我这边五连了！");
    gameOver = true; window.gameOver = true; return;
  }

  showDialogForPlayer(defenderId, "揭开你的黑历史，改变你的战斗力！");
  setTimeout(()=>{ showDialogForPlayer(attackerId, "我竟然还是赢不了你…教练，让您蒙羞了！"); }, 600);

  // 回合不变（保持触发力拔前是谁的回合仍是谁）
  renderSkillPool(1); renderSkillPool(2); updateTurnIndicator();

  // 若是 PVE 且轮到玩家2(AI)，主动提醒一次（防止某些环境对 setInterval 的节流）
  if (window.playMode === 'pve' && gameState.currentPlayer === 2 && window.__ai_nudge) {
    setTimeout(() => window.__ai_nudge(), 30);
  }

}

function applySwapPieces() {
  // 翻转棋盘阵营
  for (let y=0; y<15; y++) for (let x=0; x<15; x++) {
    if (board[y][x] === 1) board[y][x] = 2;
    else if (board[y][x] === 2) board[y][x] = 1;
  }
  // 重绘
  initBoard();
  for (let y=0; y<15; y++) for (let x=0; x<15; x++) {
    const v = board[y][x];
    if (v === 1) drawPiece(x,y,1);
    if (v === 2) drawPiece(x,y,2);
  }
  // 交换 moveHistory 的归属
  gameState.moveHistory = gameState.moveHistory.map(m => ({ player: 3 - m.player, x: m.x, y: m.y }));
  // lastMoveBy 互换
  const l1 = gameState.lastMoveBy[1], l2 = gameState.lastMoveBy[2];
  gameState.lastMoveBy[1] = l2 ? { ...l2 } : null;
  gameState.lastMoveBy[2] = l1 ? { ...l1 } : null;
}

// —— 技能面板渲染（左右两侧） ——
function renderSkillPool(playerId) {
  const area = document.getElementById(`player${playerId}-skill-area`);
  area.innerHTML = '';
  if (skillMode !== 'free') return;

  const prep = gameState.preparedSkill;
  const react = gameState.reactionWindow;
  const apoc = gameState.apocWindow;

  skills.forEach(skill => {
    if (skill.enabled === false) return;

    // —— 解压模式下：飞沙 / 静如止水等需要冷却的技能 —— 
    const isRelaxCdSkill = (gameMode === 'relax' && RELAX_COOLDOWN_SKILLS.includes(skill.id));
    const cd = isRelaxCdSkill ? getCooldown(skill.id, playerId) : 0;

    // —— 解压模式下：两极反转当成常驻大招，不再视为隐藏 —— 
    if (skill.id === 'liangjifanzhuan' && gameMode === 'relax') {
      skill.hidden = false;
      skill.visibleFor = skill.visibleFor || { 1: true, 2: true };
      skill.visibleFor[1] = true;
      skill.visibleFor[2] = true;
    }

    // —— 特殊渲染 1：擒拿（仅在“梅开二度”准备的3秒窗口内） ——
    if (skill.id === 'qin_na') {
      const canReact =
        react &&
        react.defenderId === playerId &&
        react.forSkillId === 'meikaierdhu' &&
        (react.allowQinNa !== false);   // 解压模式下 allowQinNa=false 则直接不出现

      if (!canReact) return;

      const btn = document.createElement('button');
      btn.className = 'skill-button';
      btn.innerText = skill.name;
      btn.title = '对方梅开二度准备中，可擒拿！';
      btn.onclick = () => cancelPreparedSkill(playerId);
      area.appendChild(btn);
      return;
    }

    // —— 特殊渲染 2：调虎离山 —— 
    if (skill.id === 'tiaohulishan') {
      const canCounter = react && react.defenderId === playerId && react.forSkillId === 'tiaohulishan';
      const already = skills.find(s => s.id === 'tiaohulishan')?.usedBy?.includes(playerId);
      if (!canCounter || already) return;

      const btn = document.createElement('button');
      btn.className = 'skill-button';
      btn.innerText = skill.name;
      btn.title = '擒拿后可发动调虎离山（3秒内）';
      btn.onclick = () => {
        btn.disabled = true;
        btn.onclick = null;
        btn.classList.add('skill-disabled');
        markSkillVisibleFor('tiaohulishan', playerId, false);

        currentPlayer = playerId;
        gameState.currentPlayer = playerId;
        skill.effect(gameState);
      };
      area.appendChild(btn);
      return;
    }

    // —— 特殊渲染 3：力拔山兮克制（东山 / 手刀） ——
    if (skill.id === 'dongshanzaiqi') {
      if (gameMode === 'relax') {
        // 解压模式：仅当 visibleFor[playerId] = true 且尚未用过时出现按钮
        const visible = (!gameState.dongshanUsed[playerId] &&
          skill.visibleFor &&
          skill.visibleFor[playerId] !== false);
        if (!visible) return;

        const btn = document.createElement('button');
        btn.className = 'skill-button';
        btn.innerText = skill.name;
        btn.title = '捡起刚刚被掀飞的棋盘（恢复到爆炸前）';
        btn.onclick = () => { triggerDongshanRelax(playerId); };
        area.appendChild(btn);
        return;
      }

      // —— 对战模式：旧逻辑，进入 10 秒口令 —— 
      const can =
        apoc &&
        apoc.defenderId === playerId &&
        apoc.mode === 'liba_select' &&
        !gameState.dongshanUsed[playerId];
      if (!can) return;
      const btn = document.createElement('button');
      btn.className = 'skill-button';
      btn.innerText = skill.name;  // “捡起棋盘”
      btn.title = '3秒内可点 → 进入10秒口令：输入“东山再起”并发送';
      btn.onclick = () => {
        currentPlayer = playerId;
        gameState.currentPlayer = playerId;
        openApocPrompt(playerId, 'dongshanzaiqi');
      };
      area.appendChild(btn);
      return;
    }

    if (skill.id === 'shou_dao') {
      if (gameMode === 'relax') {
        const visible = (!gameState.shoudaoUsed[playerId] &&
          skill.visibleFor &&
          skill.visibleFor[playerId] !== false);
        if (!visible) return;

        const btn = document.createElement('button');
        btn.className = 'skill-button';
        btn.innerText = skill.name;
        btn.title = '这回合让对方停一停，我多下一步棋';
        btn.onclick = () => { triggerShoudaoRelax(playerId); };
        area.appendChild(btn);
        return;
      }

      // —— 对战模式：旧逻辑 —— 
      const can =
        apoc &&
        apoc.defenderId === playerId &&
        apoc.mode === 'liba_select' &&
        !gameState.shoudaoUsed[playerId];
      if (!can) return;
      const btn = document.createElement('button');
      btn.className = 'skill-button';
      btn.innerText = skill.name;
      btn.title = '3秒内可点 → 进入10秒口令：输入“see you again”并发送';
      btn.onclick = () => {
        currentPlayer = playerId;
        gameState.currentPlayer = playerId;
        openApocPrompt(playerId, 'shou_dao');
      };
      area.appendChild(btn);
      return;
    }

    // —— 特殊渲染 4：两极反转（对战模式下，力拔后的 3 秒窗口） —— 
    if (skill.id === 'liangjifanzhuan' && gameMode === 'normal') {
      const can =
        apoc &&
        apoc.defenderId === playerId &&
        apoc.mode === 'liangji' &&
        !gameState.liangjiUsed[playerId];
      if (!can) return;
      const btn = document.createElement('button');
      btn.className = 'skill-button';
      btn.innerText = skill.name;
      btn.title = '3秒内可点：双方棋子阵营互换，并封印对手的力拔山兮';
      btn.onclick = () => { triggerLiangji(playerId); };
      area.appendChild(btn);
      return;
    }

    // —— 通用可见性/依赖 —— 
    if (skill.dependsOn) {
      const dep = skills.find(s => s.id === skill.dependsOn);
      if (!dep || !dep.usedBy?.includes(playerId)) return;
    }
    if (skill.visibleFor && skill.visibleFor[playerId] === false) return;
    if (skill.hidden === true && !(skill.visibleFor && skill.visibleFor[playerId])) return;

    // 解压冷却技能：不再用 usedBy 限制次数
    const used = (!isRelaxCdSkill && skill.usedBy?.includes(playerId));

    const btn = document.createElement('button');
    btn.className = 'skill-button';
    btn.innerText = skill.name;
    btn.title = skill.description;

    // 基础禁用态
    let disabled = false, tip = "";

    // 非当前玩家 → 灰
    if (playerId !== currentPlayer) { disabled = true; tip = "非当前回合"; }

    // 已使用过（一次性技能） → 深灰
    if (used) { disabled = true; btn.innerText += " ✅"; tip = "已使用"; }

    // 静如止水跳过 → 灰
    if (gameState.skipNextTurnFor === playerId) { disabled = true; tip = "本轮被静如止水定身"; }

    // 额外回合禁技 → 灰
    const isBonusNoSkill = (playerId === currentPlayer) && (gameState.bonusTurnNoSkillFor === currentPlayer);
    if (isBonusNoSkill) { disabled = true; tip = "本回合因静如止水效果，不能使用技能"; }

    // 一回合一技
    if (playerId === currentPlayer && gameState.skillUsedThisTurn) { disabled = true; tip = "本回合已使用过技能，请落子"; }

    // 落子后禁技
    if (playerId === currentPlayer && gameState.moveMadeThisTurn) { disabled = true; tip = "本回合已落子，不能再用技能"; }

    // 准备/反应/力拔窗口期间：全部禁用（特殊渲染之外）
    if (prep || react || apoc) { disabled = true; tip = "技能结算中…"; }

    // 力拔山兮被封印（仅对力拔按钮生效）
    if (skill.id === "libashanxi" && gameState.libaSealedFor === playerId) {
      disabled = true; tip = "已被两极反转封印";
    }

    // 解压模式：冷却中的飞沙 / 静如止水 等
    if (isRelaxCdSkill && cd > 0) {
      disabled = true;
      tip = `冷却中，还剩 ${cd} 回合可激活`;
      btn.classList.add('skill-disabled');
    }

    if (disabled) {
      btn.disabled = true;
      if (!btn.classList.contains('skill-disabled') && !btn.classList.contains('skill-used')) {
        // 区分“已用(深灰)”与“不可用(浅灰)”
        if (used) btn.classList.add('skill-used');
        else      btn.classList.add('skill-disabled');
      }
      if (tip) btn.title = tip;
    }

    // 点击
    btn.onclick = () => {
      if (btn.disabled) return;

      // 通用守门
      if (playerId !== currentPlayer) return;
      if (used) return;
      if (gameState.preparedSkill || gameState.reactionWindow || gameState.apocWindow || gameState.apocPrompt) {
        showDialogForPlayer(playerId, "技能结算中，请稍候…"); return;
      }
      if (gameState.skipNextTurnFor === playerId) { showDialogForPlayer(playerId, "我被定住了，本轮不能行动！"); return; }
      if (gameState.bonusTurnNoSkillFor === playerId) { showDialogForPlayer(playerId, "本回合因静如止水效果，不能使用技能！"); return; }
      if (gameState.skillUsedThisTurn) { showDialogForPlayer(playerId, "本回合已使用过技能，请先落子"); return; }
      if (gameState.moveMadeThisTurn) { showDialogForPlayer(playerId, "本回合已落子，不能再用技能"); return; }

      // 特例：梅开二度进入准备阶段（不立刻计次）
      if (skill.id === 'meikaierdhu') {
        if (skill.needsOpponentLastMove && !gameState.lastMoveBy[3 - playerId]) { showDialogForPlayer(playerId, "对方还没有落子，无计可施哦"); return; }
        if (skill.requiresEnemy && !hasEnemyPieceFor(playerId)) { showDialogForPlayer(playerId, "现在对方一子未下，技能无从施展！"); return; }
        startPreparedSkill(playerId, 'meikaierdhu'); return;
      }

      // 特例：力拔山兮
      if (skill.id === 'libashanxi') {
        startLibashanxi(playerId);
        return;
      }

      // 特例：两极反转（解压模式独立大招）
      if (skill.id === 'liangjifanzhuan' && gameMode === 'relax') {
        gameState.currentPlayer = playerId;
        applySwapPieces();

        // 冷却 5 回合
        if (isRelaxCdSkill) {
          const turns = RELAX_SKILL_COOLDOWN_TURNS[skill.id] || 5;
          setCooldown(skill.id, playerId, turns);
        }

        gameState.skillUsedThisTurn = true;

        // AI 解压模式：50% 概率飘黑历史台词
        if (
          window.playMode === 'pve' &&
          playerId === 2 &&          // AI 是玩家2
          Math.random() < 0.5 &&
          AI_LIANGJI_QUOTES.length
        ) {
          const line = AI_LIANGJI_QUOTES[Math.floor(Math.random() * AI_LIANGJI_QUOTES.length)];
          setTimeout(() => {
            showDialogForPlayer(2, line);
          }, 2200);
        }

        renderSkillPool(1);
        renderSkillPool(2);
        return;
      }

      // 特例：棒球（解压模式简化版）
      if (skill.id === 'bangqiu') {
        if (gameMode !== 'relax') {
          showDialogForPlayer(playerId, "棒球技能只在解压模式开放哦～");
        } else {
          handleBangqiuRelax(playerId);
          gameState.skillUsedThisTurn = true;

          if (isRelaxCdSkill) {
            const turns = RELAX_SKILL_COOLDOWN_TURNS[skill.id] || 3;
            setCooldown(skill.id, playerId, turns);
          } else {
            skill.usedBy = skill.usedBy || [];
            skill.usedBy.push(playerId);
          }
        }

        renderSkillPool(1);
        renderSkillPool(2);
        return;
      }

      // 其他普通技能（飞沙/静如止水等）
      if (skill.needsOpponentLastMove && !gameState.lastMoveBy[3 - playerId]) { showDialogForPlayer(playerId, "对方还没有落子，无计可施哦"); return; }
      if (skill.requiresEnemy && !hasEnemyPieceFor(playerId)) { showDialogForPlayer(playerId, "现在对方一子未下，技能无从施展！"); return; }

      // 执行
      gameState.currentPlayer = playerId;
      skill.effect(gameState);

      // —— 标记一回合一技 —— 
      gameState.skillUsedThisTurn = true;

      // 所有技能都记录“曾经使用过”
      skill.usedBy = skill.usedBy || [];
      skill.usedBy.push(playerId);

      // 解压模式：冷却技能（飞沙 / 静如止水 / 两极反转 / 棒球 etc）
      if (isRelaxCdSkill) {
        const turns = RELAX_SKILL_COOLDOWN_TURNS[skill.id] || 2;
        setCooldown(skill.id, playerId, turns);
      }

      renderSkillPool(1); renderSkillPool(2);
    };

    area.appendChild(btn);
  });
}

// 导出给 HTML 调用
window.startGame = startGame;

// —— 再来一局 / 返回首页 按钮事件 —— 
window.addEventListener('DOMContentLoaded', () => {
  const btnRestart  = document.getElementById('btn-restart');
  const btnBackHome = document.getElementById('btn-back-home');

  // 再来一局：在当前模式/难度下重开一盘
  if (btnRestart) {
    btnRestart.addEventListener('click', () => {
      gameOver = false;
      window.gameOver = false;

      // 防御性清理各种窗口和计时器
      if (gameState.reactionWindow && gameState.reactionWindow.timeoutId) {
        clearTimeout(gameState.reactionWindow.timeoutId);
      }
      if (gameState.apocWindow && gameState.apocWindow.timeoutId) {
        clearTimeout(gameState.apocWindow.timeoutId);
      }
      if (gameState.apocPrompt && gameState.apocPrompt.timerId) {
        clearInterval(gameState.apocPrompt.timerId);
      }

      if (gameState.relaxLibaWindow && gameState.relaxLibaWindow.timeoutId) {
        clearTimeout(gameState.relaxLibaWindow.timeoutId);
      }
      gameState.relaxLibaWindow = null;

      gameState.reactionWindow = null;
      gameState.apocWindow = null;
      gameState.apocPrompt = null;
      gameState.preparedSkill = null;

      startGame();
    });
  }

  // 返回首页：不刷新页面，只把开始菜单遮罩重新盖上
  if (btnBackHome) {
    btnBackHome.addEventListener('click', () => {
      gameOver = true;
      window.gameOver = true;

      // 清一清状态，避免后台还在跑窗口
      if (gameState.reactionWindow && gameState.reactionWindow.timeoutId) {
        clearTimeout(gameState.reactionWindow.timeoutId);
      }
      if (gameState.apocWindow && gameState.apocWindow.timeoutId) {
        clearTimeout(gameState.apocWindow.timeoutId);
      }
      if (gameState.apocPrompt && gameState.apocPrompt.timerId) {
        clearInterval(gameState.apocPrompt.timerId);
      }

      if (gameState.relaxLibaWindow && gameState.relaxLibaWindow.timeoutId) {
        clearTimeout(gameState.relaxLibaWindow.timeoutId);
      }
      gameState.relaxLibaWindow = null;

      gameState.reactionWindow = null;
      gameState.apocWindow = null;
      gameState.apocPrompt = null;
      gameState.preparedSkill = null;

      // 只需要把开始菜单显示回去即可，背景棋盘保留
      const startMenu = document.getElementById('start-menu');
      if (startMenu) {
        startMenu.classList.remove('hidden');
      }
    });
  }

  // —— 新增：只有“玩家 vs AI”时启用难度选择 —— 
  const diffSel   = document.getElementById('ai-difficulty');
  const diffHint  = document.getElementById('ai-diff-hint');
  const playModeRadios = document.querySelectorAll('input[name="play-mode"]');

  function updateDiffState() {
    const checked = document.querySelector('input[name="play-mode"]:checked');
    const val = checked ? checked.value : 'pvp';
    const isPve = (val === 'pve');

    if (diffSel) {
      diffSel.disabled = !isPve;
      diffSel.style.opacity = isPve ? '1' : '0.6';
    }
    if (diffHint) {
      diffHint.style.opacity = isPve ? '0.9' : '0.4';
    }
  }

  if (playModeRadios && playModeRadios.length) {
    playModeRadios.forEach(r => r.addEventListener('change', updateDiffState));
  }
  updateDiffState();

  // —— 新增：解压模式用的“提前结算”按钮 —— 
  const ctrlBar = document.getElementById('control-bar');
  if (ctrlBar && !document.getElementById('btn-early-end')) {
    const btnEarly = document.createElement('button');
    btnEarly.id = 'btn-early-end';
    btnEarly.textContent = '提前结算';
    btnEarly.style.marginLeft = '12px';
    ctrlBar.appendChild(btnEarly);

    btnEarly.addEventListener('click', () => {
      if (gameOver) return;

      // 仅解压模式可用
      if (gameMode !== 'relax') {
        showDialogForPlayer(currentPlayer, "对战模式暂不支持提前结算，打完这局再走吧～");
        return;
      }

      if (isBoardEmpty()) {
        showDialogForPlayer(1, "还没有任何落子，现在结算有点太早啦。");
        showDialogForPlayer(2, "");
        return;
      }

      settleGameByCount('early');
    });
  }
});
