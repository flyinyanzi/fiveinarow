// main.js

let playMode = "pvp";
let skillMode = "free"; // 这版只实现“自由选技能”
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

  // ★ 新增：本回合是否已使用过技能（每回合最多一次技能）
  skillUsedThisTurn: false,

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
  gameOver = false;

  initBoard();
  handleStartOfTurn();
}

// ———— 回合开始统一处理：清对白→若该玩家被跳过则直接切人→生效额外回合禁技→刷新UI ————
function handleStartOfTurn() {
  // 1) 新回合开始，先清空对白 + 重置“本回合已用技能”标记
  clearDialogs();
  gameState.skillUsedThisTurn = false; // ★ 每回合开头清零

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

    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / cell);
    const y = Math.floor((e.clientY - rect.top) / cell);
    if (board[y][x] !== 0) return;

    // 正式落子
    board[y][x] = currentPlayer;
    drawPiece(x, y, currentPlayer);

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
      const ny = y - dy * d;
      if (board[ny]?.[nx] === player) count++;
      else break;
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

// ———— 技能 UI 渲染（左右各自卡池） ————
function renderSkillPool(playerId) {
  const area = document.getElementById(`player${playerId}-skill-area`);
  area.innerHTML = '';
  if (skillMode !== 'free') return; // 这版只做自由选

  skills.forEach(skill => {
    if (skill.enabled === false) return; // 显式禁用（占位技能）

    // 依赖关系：如“梅开二度”依赖“飞沙走石”被该玩家使用
    if (skill.dependsOn) {
      const dep = skills.find(s => s.id === skill.dependsOn);
      if (!dep || !dep.usedBy?.includes(playerId)) return;
    }
    // 可见性：支持 hidden/visibleFor（以后触发卡用）
    if (skill.visibleFor && skill.visibleFor[playerId] === false) return;
    if (skill.hidden === true && !(skill.visibleFor && skill.visibleFor[playerId])) return;

    const used = skill.usedBy?.includes(playerId);
    const btn = document.createElement('button');
    btn.className = 'skill-button';
    btn.innerText = skill.name;
    btn.title = skill.description;

    // ① 非当前玩家 → 灰
    if (playerId !== currentPlayer) {
      btn.disabled = true;
      btn.style.opacity = 0.5;
    }

    // ② 已被该玩家用过 → 灰
    if (used) {
      btn.disabled = true;
      btn.innerText += ' ✅';
    }

    // ③ 被静如止水跳过 → 灰
    if (gameState.skipNextTurnFor === playerId) {
      btn.disabled = true;
      btn.title = "本轮被静如止水定身，不能使用技能";
      btn.style.opacity = 0.6;
    }

    // ④ 额外回合禁技 → 灰
    const isBonusNoSkill = (playerId === currentPlayer) && (gameState.bonusTurnNoSkillFor === currentPlayer);
    if (isBonusNoSkill) {
      btn.disabled = true;
      btn.title = "本回合因静如止水效果，不能使用技能";
      btn.style.opacity = 0.6;
    }

    // ⑤ 本回合已用过技能 → 灰（“一回合只允许使用一次技能”）
    if (playerId === currentPlayer && gameState.skillUsedThisTurn) {
      btn.disabled = true;
      btn.title = "本回合已使用过技能，请落子";
      btn.style.opacity = 0.6;
    }

    btn.onclick = () => {
      // 双保险：各种不允许的情况
      if (playerId !== currentPlayer) return;
      if (used) return;
      if (gameState.skipNextTurnFor === playerId) {
        showDialogForPlayer(playerId, "我被定住了，本轮不能行动！");
        return;
      }
      if (gameState.bonusTurnNoSkillFor === playerId) {
        showDialogForPlayer(playerId, "本回合因静如止水效果，不能使用技能！");
        return;
      }
      if (gameState.skillUsedThisTurn) {
        showDialogForPlayer(playerId, "本回合已使用过技能，请先落子");
        return;
      }

      // 通用守门：需要对方上一手
      if (skill.needsOpponentLastMove) {
        if (!gameState.lastMoveBy[3 - playerId]) {
          showDialogForPlayer(playerId, "对方还没有落子，无计可施哦");
          return;
        }
      }
      // 通用守门：需要敌方棋子
      if (skill.requiresEnemy && !hasEnemyPieceFor(playerId)) {
        showDialogForPlayer(playerId, "现在对方一子未下，技能无从施展！");
        return;
      }

      // 触发技能
      gameState.currentPlayer = playerId; // 确保技能内部拿到施放者
      skill.effect(gameState);

      // 标记使用
      skill.usedBy = skill.usedBy || [];
      skill.usedBy.push(playerId);

      // ★ 关键：本回合已用技能 → 禁用后续技能，直到玩家完成一次落子
      gameState.skillUsedThisTurn = true;

      // 触发型技能显隐（保留框架）
      skills.forEach(s2 => {
        if (s2.triggeredBy === skill.id) {
          markSkillVisibleFor(s2.id, 3 - playerId, true, s2.timeout || 3000);
        }
      });

      // 刷新两个面板（让按钮立即置灰）
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
