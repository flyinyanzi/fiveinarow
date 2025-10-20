// main.js

let playMode = "pvp";
let skillMode = "free"; // 当前实现“自由选技能”
let currentPlayer = 1;
let board;
let gameOver = false;

// ———— UI helpers ————
function showDialogForPlayer(playerId, text) {
  const box = document.getElementById(`dialog-player${playerId}`);
  if (box) box.innerText = text;
}
function updateTurnIndicator() {
  const el = document.getElementById('turn-indicator');
  if (el) el.innerText = `轮到玩家 ${currentPlayer}`;
}
function clearDialogs() {
  showDialogForPlayer(1, "");
  showDialogForPlayer(2, "");
}

// ———— 游戏状态对象（集中放置） ————
const gameState = {
  board: [],
  opponentLastMove: null, // 兼容旧逻辑

  skipNextTurn: false,          // 兼容字段
  skipNextTurnFor: null,        // 被“静如止水”定住、下回合被跳过的玩家 id（1/2/null）
  bonusTurnPendingFor: null,    // 谁将获得额外回合（尚未开始）
  bonusTurnNoSkillFor: null,    // 额外回合禁用技能的玩家 id（额外回合开始时才设）
  cancelOpponentSkill: false,   // 预留
  currentPlayer: 1,

  lastMoveBy: { 1: null, 2: null }, // 分别记录玩家1/2自己的上一手

  // 回合内限制
  skillUsedThisTurn: false,     // 本回合是否已使用过技能（每回合最多一次）
  moveMadeThisTurn: false,      // 本回合是否已落子（落子后不能再用技能）

  // 反应式技能窗口/准备阶段
  preparedSkill: null,          // { playerId, skillId }
  reactionWindow: null,         // { defenderId, forSkillId, timeoutId }

  showDialogForPlayer,
  clearCell,
};

// ———— 启动入口 ————
function startGame() {
  playMode  = document.querySelector('input[name="play-mode"]:checked').value;
  skillMode = document.querySelector('input[name="skill-mode"]:checked').value;

  document.getElementById('start-menu').style.display = 'none';
  document.querySelector('.game-container').style.display = 'block';

  board = Array.from({ length: 15 }, () => Array(15).fill(0));
  gameState.board = board;

  currentPlayer = 1;
  gameState.currentPlayer = 1;
  gameState.opponentLastMove = null;
  gameState.lastMoveBy = {1: null, 2: null};
  gameState.skipNextTurnFor = null;
  gameState.bonusTurnPendingFor = null;
  gameState.bonusTurnNoSkillFor = null;
  gameState.skillUsedThisTurn = false;
  gameState.moveMadeThisTurn = false;
  gameState.preparedSkill = null;
  gameState.reactionWindow = null;
  gameOver = false;

  initBoard();
  handleStartOfTurn();
}

// ———— 回合开始统一处理：清对白→跳过→生效额外回合禁技→刷新UI ————
function handleStartOfTurn() {
  // 1) 新回合开始：清对白 + 重置回合标记
  clearDialogs();
  gameState.skillUsedThisTurn = false;
  gameState.moveMadeThisTurn = false;

  // 2) 如果当前玩家本轮应该被跳过（静如止水效果）
  if (gameState.skipNextTurnFor === currentPlayer) {
    gameState.skipNextTurnFor = null;
    showDialogForPlayer(currentPlayer, "……啊？我被定住了（本轮被跳过）");

    currentPlayer = 3 - currentPlayer;
    gameState.currentPlayer = currentPlayer;

    setTimeout(() => {
      clearDialogs();
      // 跳过完成后，若此时轮到的人是待生效额外回合的人 → 现在才设禁技
      if (gameState.bonusTurnPendingFor === currentPlayer) {
        gameState.bonusTurnNoSkillFor = currentPlayer; // 额外回合开始：禁技生效
      }
      renderSkillPool(1);
      renderSkillPool(2);
      updateTurnIndicator();
    }, 800);
    return;
  }

  // 3) 正常开始：如果这个人正好是“待生效的额外回合的人”，现在设禁技
  if (gameState.bonusTurnPendingFor === currentPlayer) {
    gameState.bonusTurnNoSkillFor = currentPlayer;
  }

  renderSkillPool(1);
  renderSkillPool(2);
  updateTurnIndicator();
}

// ———— 棋盘与落子 ————
function initBoard() {
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
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

    // 若处于技能准备/反应窗口中，禁止落子
    if (gameState.preparedSkill || gameState.reactionWindow) {
      showDialogForPlayer(currentPlayer, "技能结算中，稍候再落子……");
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / cell);
    const y = Math.floor((e.clientY - rect.top) / cell);
    if (board[y][x] !== 0) return;

    // 正式落子
    board[y][x] = currentPlayer;
    drawPiece(x, y, currentPlayer);

    // 回合内标记：已落子
    gameState.moveMadeThisTurn = true;

    // 记录“当前玩家”的上一手
    gameState.lastMoveBy[currentPlayer] = { x, y };
    gameState.opponentLastMove = { x, y }; // 兼容

    // 判胜
    if (checkWin(x, y, currentPlayer)) {
      showDialogForPlayer(currentPlayer, `🎉 玩家${currentPlayer}获胜！`);
      gameOver = true;
      return;
    }

    // 切给对手
    const justPlayed = currentPlayer;
    currentPlayer = 3 - currentPlayer;
    gameState.currentPlayer = currentPlayer;

    // 若刚刚走子的人是“额外回合禁技的人”，说明额外回合已结束 → 清空两个标记
    if (gameState.bonusTurnNoSkillFor === justPlayed) {
      gameState.bonusTurnNoSkillFor = null;
      gameState.bonusTurnPendingFor = null;
    }

    handleStartOfTurn();
  };
}

function drawPiece(x, y, player) {
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const cell = canvas.width / 15;
  const cx = x * cell + cell / 2;
  const cy = y * cell + cell / 2;
  const radius = cell / 2.5;

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
  ctx.fillStyle = player === 1 ? 'black' : 'white';
  ctx.fill();
  ctx.stroke();
}

function clearCell(x, y) {
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const cell = canvas.width / 15;
  ctx.clearRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2);

  // 重绘网格局部十字
  ctx.beginPath();
  ctx.moveTo(x * cell + cell / 2, y * cell);
  ctx.lineTo(x * cell + cell / 2, y * cell + cell);
  ctx.moveTo(x * cell, y * cell + cell / 2);
  ctx.lineTo(x * cell + cell, y * cell + cell / 2);
  ctx.stroke();
}

function checkWin(x, y, player) {
  const dirs = [
    [1, 0], [0, 1], [1, 1], [1, -1]
  ];
  for (let [dx, dy] of dirs) {
    let count = 1;
    for (let d = 1; d < 5; d++) {
      const nx = x + dx * d;
      const ny = y + dy * d;
      if (board[ny]?.[nx] === player) count++;
      else break;
    }
    for (let d = 1; d < 5; d++) {
      const nx = x - dx * d;
      const ny = y - dx * d; // 这里有个错误? 原先代码是 ny = y - dy*d，应 correct.
    }
    // 修正上面循环：
  }
  // 为防止上面错误，重写函数：
  return checkWinFixed(x, y, player);
}

function checkWinFixed(x, y, player) {
  const dirs = [
    [1, 0], [0, 1], [1, 1], [1, -1]
  ];
  for (let [dx, dy] of dirs) {
    let count = 1;
    for (let d = 1; d < 5; d++) {
      const nx = x + dx * d;
      const ny = y + dy * d;
      if (board[ny]?.[nx] === player) count++; else break;
    }
    for (let d = 1; d < 5; d++) {
      const nx = x - dx * d;
      const ny = y - dy * d;
      if (board[ny]?.[nx] === player) count++; else break;
    }
    if (count >= 5) return true;
  }
  return false;
}

// ———— 工具：统计/判断棋子数（用于“需要敌方棋子”的技能守门） ————
function countPiecesOf(playerId) {
  let cnt = 0;
  for (let y = 0; y < board.length; y++) {
    for (let x = 0; x < board[y].length; x++) {
      if (board[y][x] === playerId) cnt++;
    }
  }
  return cnt;
}
function hasEnemyPieceFor(playerId) {
  return countPiecesOf(3 - playerId) > 0;
}

// ———— 技能准备/反应流程（第一步：梅开二度 + 擒拿取消） ————
function startPreparedSkill(playerId, skillId) {
  // 仅支持 meikaierdhu 的准备阶段
  gameState.preparedSkill = { playerId, skillId };
  showDialogForPlayer(playerId, "梅开二度，准备出手！");

  // 开启对手擒拿反应窗口（3秒）
  const defenderId = 3 - playerId;
  // 擒拿按钮3秒可见
  markSkillVisibleFor('qin_na', defenderId, true, 3000);

  // 在窗口内，允许 defender 点击“擒拿”；其他行为一律禁用
  // 记录窗口
  const to = setTimeout(() => {
    // 超时无人反应 → 结算梅开二度
    if (gameState.preparedSkill && gameState.preparedSkill.playerId === playerId && gameState.preparedSkill.skillId === 'meikaierdhu') {
      resolvePreparedSkill();
    }
  }, 3000);
  gameState.reactionWindow = { defenderId, forSkillId: 'meikaierdhu', timeoutId: to };

  // 刷新按钮状态
  renderSkillPool(1);
  renderSkillPool(2);
}

function resolvePreparedSkill() {
  const prep = gameState.preparedSkill;
  if (!prep) return;
  const caster = prep.playerId;
  const opp = 3 - caster;

  // 结算效果（与飞沙走石一致：再飞一次对手上一手）
  const move = gameState.lastMoveBy[opp];
  if (move) {
    gameState.board[move.y][move.x] = 0;
    gameState.clearCell(move.x, move.y);
    showDialogForPlayer(caster, "梅开二度！再飞你一次！");
  } else {
    showDialogForPlayer(caster, "对方还没有落子，无计可施哦");
  }

  // 标记“梅开二度”被该玩家使用（计入一回合一次技能）
  const meikai = skills.find(s => s.id === 'meikaierdhu');
  if (meikai) {
    meikai.usedBy = meikai.usedBy || [];
    if (!meikai.usedBy.includes(caster)) meikai.usedBy.push(caster);
  }
  gameState.skillUsedThisTurn = true;

  // 清理窗口与准备态
  if (gameState.reactionWindow?.timeoutId) clearTimeout(gameState.reactionWindow.timeoutId);
  gameState.reactionWindow = null;
  gameState.preparedSkill = null;

  // 擒拿按钮隐藏
  markSkillVisibleFor('qin_na', opp, false);

  renderSkillPool(1);
  renderSkillPool(2);
}

function cancelPreparedSkill(byPlayerId) {
  const prep = gameState.preparedSkill;
  if (!prep) return;
  const attacker = prep.playerId;
  const defender = 3 - attacker;
  if (byPlayerId !== defender) return; // 只有防守方可取消

  // 取消准备中的梅开二度（不计入对方的一回合一次技能）
  showDialogForPlayer(defender, "擒拿擒拿，擒擒又拿拿！");
  showDialogForPlayer(attacker, "我的梅开二度被擒住了？！本回合只能落子……");

  // 清理窗口与准备态 + 停止超时结算
  if (gameState.reactionWindow?.timeoutId) clearTimeout(gameState.reactionWindow.timeoutId);
  gameState.reactionWindow = null;
  gameState.preparedSkill = null;

  // 立即隐藏擒拿按钮
  markSkillVisibleFor('qin_na', defender, false);

  // ★ 关键：被取消的一方（当前回合的进攻方）本回合不再允许使用任何技能，避免循环
  if (currentPlayer === attacker) {
    gameState.skillUsedThisTurn = true; // 锁定本回合技能
  }

  renderSkillPool(1);
  renderSkillPool(2);
}

// ———— 技能 UI 渲染（左右各自卡池） ————
function renderSkillPool(playerId) {
  const area = document.getElementById(`player${playerId}-skill-area`);
  area.innerHTML = '';
  if (skillMode !== 'free') return; // 这版只做自由选

  const prep = gameState.preparedSkill;
  const react = gameState.reactionWindow;

  skills.forEach(skill => {
    if (skill.enabled === false) return; // 显式禁用（占位技能）

    // 依赖关系：如“梅开二度”依赖“飞沙走石”被该玩家使用
    if (skill.dependsOn) {
      const dep = skills.find(s => s.id === skill.dependsOn);
      if (!dep || !dep.usedBy?.includes(playerId)) return;
    }
    // 可见性：支持 hidden/visibleFor（触发卡用）
    if (skill.visibleFor && skill.visibleFor[playerId] === false) return;
    if (skill.hidden === true && !(skill.visibleFor && skill.visibleFor[playerId])) return;

    const used = skill.usedBy?.includes(playerId);
    const btn = document.createElement('button');
    btn.className = 'skill-button';
    btn.innerText = skill.name;
    btn.title = skill.description;

    // 基础禁用态
    let disabled = false;
    let tip = '';

    // ① 非当前玩家 → 灰（但反应窗口里允许擒拿解禁）
    if (playerId !== currentPlayer) {
      disabled = true;
      tip = '非当前回合';
    }

    // ② 已被该玩家用过 → 灰
    if (used) {
      disabled = true; btn.innerText += ' ✅'; tip = '已使用';
    }

    // ③ 被静如止水跳过 → 灰
    if (gameState.skipNextTurnFor === playerId) {
      disabled = true; tip = '本轮被静如止水定身，不能使用技能';
    }

    // ④ 额外回合禁技 → 灰
    const isBonusNoSkill = (playerId === currentPlayer) && (gameState.bonusTurnNoSkillFor === currentPlayer);
    if (isBonusNoSkill) {
      disabled = true; tip = '本回合因静如止水效果，不能使用技能';
    }

    // ⑤ 本回合已用过技能 → 灰
    if (playerId === currentPlayer && gameState.skillUsedThisTurn) {
      disabled = true; tip = '本回合已使用过技能，请落子';
    }

    // ⑥ 本回合已落子 → 灰
    if (playerId === currentPlayer && gameState.moveMadeThisTurn) {
      disabled = true; tip = '本回合已落子，不能再用技能';
    }

    // ⑦ 技能准备/反应窗口中的特殊开放/限制
    if (prep) {
      // 准备阶段：只有进攻方准备了“梅开二度”
      if (prep.playerId === playerId) {
        // 进攻方在准备阶段内不能再点任何技能
        disabled = true; tip = '技能准备中…';
      } else {
        // 防守方只有在反应窗口中且是“擒拿”才解禁
        if (react && react.defenderId === playerId && react.forSkillId === 'meikaierdhu' && skill.id === 'qin_na') {
          disabled = false; tip = '对方梅开二度准备中，可擒拿！';
        } else {
          disabled = true; tip = '等待对方技能结算…';
        }
      }
    }

    if (disabled) {
      btn.disabled = true; btn.style.opacity = 0.6; if (tip) btn.title = tip;
    }

    btn.onclick = () => {
      if (btn.disabled) return;

      // 双保险：一切不允许的情况
      if (playerId !== currentPlayer) return;
      if (used) return;
      if (gameState.skipNextTurnFor === playerId) { showDialogForPlayer(playerId, '我被定住了，本轮不能行动！'); return; }
      if (gameState.bonusTurnNoSkillFor === playerId) { showDialogForPlayer(playerId, '本回合因静如止水效果，不能使用技能！'); return; }
      if (gameState.skillUsedThisTurn) { showDialogForPlayer(playerId, '本回合已使用过技能，请先落子'); return; }
      if (gameState.moveMadeThisTurn) { showDialogForPlayer(playerId, '本回合已落子，不能再用技能'); return; }

      // 特例：梅开二度进入准备阶段（不立刻计次）
      if (skill.id === 'meikaierdhu') {
        // 守门：需要对手上一手 & 对手棋子
        if (skill.needsOpponentLastMove && !gameState.lastMoveBy[3 - playerId]) { showDialogForPlayer(playerId, '对方还没有落子，无计可施哦'); return; }
        if (skill.requiresEnemy && !hasEnemyPieceFor(playerId)) { showDialogForPlayer(playerId, '现在对方一子未下，技能无从施展！'); return; }
        startPreparedSkill(playerId, 'meikaierdhu');
        return;
      }

      // 特例：擒拿 → 只能在反应窗口中由防守方使用，用于取消
      if (skill.id === 'qin_na') {
        if (!(gameState.reactionWindow && gameState.reactionWindow.defenderId === playerId && gameState.reactionWindow.forSkillId === 'meikaierdhu')) {
          return; // 非反应窗口，直接无效
        }
        cancelPreparedSkill(playerId);
        // 擒拿本身计次：作为反应技能，这里可选择是否计入；第一步我们不计次（只取消对方）
        return;
      }

      // 其他普通技能（本步只剩飞沙走石、静如止水）——通用守门
      if (skill.needsOpponentLastMove) {
        if (!gameState.lastMoveBy[3 - playerId]) { showDialogForPlayer(playerId, '对方还没有落子，无计可施哦'); return; }
      }
      if (skill.requiresEnemy && !hasEnemyPieceFor(playerId)) {
        showDialogForPlayer(playerId, '现在对方一子未下，技能无从施展！'); return;
      }

      // 触发技能（普通型）
      gameState.currentPlayer = playerId; // 确保技能内部拿到施放者
      skill.effect(gameState);

      // 标记使用
      skill.usedBy = skill.usedBy || [];
      skill.usedBy.push(playerId);

      // 一回合仅一次技能
      gameState.skillUsedThisTurn = true;

      renderSkillPool(1);
      renderSkillPool(2);
    };

    area.appendChild(btn);
  });
}

// ———— 让某技能对某一方暂时可见（带超时消失） ————
function markSkillVisibleFor(skillId, playerId, visible, timeoutMs) {
  const s = skills.find(x => x.id === skillId);
  if (!s) return;
  s.visibleFor = s.visibleFor || {1: true, 2: true};
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
