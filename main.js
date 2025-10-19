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
  // 为兼容旧逻辑保留，但我们下面用更准确的 lastMoveBy 来判断“对手上一手”
  opponentLastMove: null,

  skipNextTurn: false,          // 保留（兼容老代码），当前未使用
  skipNextTurnFor: null,        // ★ 被“静如止水”定住、下回合被跳过的玩家 id（1/2/null）
  bonusTurnNoSkillFor: null,    // ★ 施放静如止水后得到“额外回合”的玩家 id（该回合禁用技能）
  cancelOpponentSkill: false,   // 预留（以后擒拿用）当前版本未使用
  currentPlayer: 1,

  // ★ 分别记录玩家1、2自己的上一手（{x,y}或null）
  lastMoveBy: { 1: null, 2: null },

  // 供技能里用到的 UI/辅助函数
  showDialogForPlayer,
  clearCell,
};

// ———— 启动入口 ————
function startGame() {
  playMode    = document.querySelector('input[name="play-mode"]:checked').value;
  skillMode   = document.querySelector('input[name="skill-mode"]:checked').value;

  document.getElementById('start-menu').style.display = 'none';
  document.querySelector('.game-container').style.display = 'block';

  board = Array.from({ length: 15 }, () => Array(15).fill(0));
  gameState.board = board;

  // 初始化回合相关状态
  currentPlayer = 1;
  gameState.currentPlayer = 1;
  gameState.opponentLastMove = null;
  gameState.lastMoveBy = {1: null, 2: null};
  gameState.skipNextTurnFor = null;
  gameState.bonusTurnNoSkillFor = null;
  gameOver = false;

  initBoard();
  handleStartOfTurn(); // 统一的“回合开始”处理：清对白、处理跳过、刷新UI
}

// ———— 回合开始统一处理：清对白→若该玩家被跳过则直接切人→刷新UI ————
function handleStartOfTurn() {
  // 1) 新回合开始，先清空对白，避免上轮台词残留
  clearDialogs();

  // 2) 如果当前玩家本轮应该被跳过（静如止水效果）
  if (gameState.skipNextTurnFor === currentPlayer) {
    gameState.skipNextTurnFor = null;
    showDialogForPlayer(currentPlayer, "……啊？我被定住了（本轮被跳过）");

    // 直接把回合切给对手
    currentPlayer = 3 - currentPlayer;
    gameState.currentPlayer = currentPlayer;

    // 给玩家一点时间看到提示，再清空并刷新
    setTimeout(() => {
      clearDialogs();
      renderSkillPool(1);
      renderSkillPool(2);
      updateTurnIndicator();
    }, 800);
    return;
  }

  // 3) 正常开始：渲染技能、刷新指示
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

    // 记录“当前玩家”的上一手，供对手技能使用
    gameState.lastMoveBy[currentPlayer] = { x, y };
    // 兼容旧技能：保留一份上一手（对方可用）
    gameState.opponentLastMove = { x, y };

    // 判胜
    if (checkWin(x, y, currentPlayer)) {
      showDialogForPlayer(currentPlayer, `🎉 玩家${currentPlayer}获胜！`);
      gameOver = true;
      return;
    }

    // 换手前：如果上一回合是“静如止水的额外回合”，那位已行动完 → 解除“禁用技能”的限制
    if (gameState.bonusTurnNoSkillFor && gameState.bonusTurnNoSkillFor === currentPlayer) {
      // 本人额外回合刚用完，下一次自己再获得回合时可以正常用技能
      // 但注意是“用完这手后换手”，所以在换手后清除更保险：
      // 我们在切完人后，如果不再是那个人的回合，就清掉它
    }

    // 切给对手
    currentPlayer = 3 - currentPlayer;
    gameState.currentPlayer = currentPlayer;

    // 如果“额外回合禁技能”的人已不是当前回合的人，说明那次额外回合结束，解除禁用
    if (gameState.bonusTurnNoSkillFor && gameState.bonusTurnNoSkillFor !== currentPlayer) {
      gameState.bonusTurnNoSkillFor = null;
    }

    // 进入下一回合的统一处理
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
    // 不可见（隐藏/未被触发/被禁用）直接跳过
    if (skill.enabled === false) return; // 显式禁用（预防未完成技能）
    // 依赖技能：如“梅开二度”依赖“飞沙走石”先被该玩家使用
    if (skill.dependsOn) {
      const dep = skills.find(s => s.id === skill.dependsOn);
      if (!dep || !dep.usedBy?.includes(playerId)) return;
    }
    // 可见性（若定义了 visibleFor 则按玩家判定；否则默认可见）
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

    // ③ 被“静如止水”跳过 → 灰
    if (gameState.skipNextTurnFor === playerId) {
      btn.disabled = true;
      btn.title = "本轮被静如止水定身，不能使用技能";
      btn.style.opacity = 0.6;
    }

    // ④ 施放静如止水而得到“额外回合”的那位 → 本回合禁用技能
    const isBonusNoSkill = (playerId === currentPlayer) && (gameState.bonusTurnNoSkillFor === currentPlayer);
    if (isBonusNoSkill) {
      btn.disabled = true;
      btn.title = "本回合因静如止水效果，不能使用技能";
      btn.style.opacity = 0.6;
    }

    btn.onclick = () => {
      // 双保险：不该点就 return
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

      // 通用守门：对方未落子则禁止（多数“对敌方棋子”的技能都需要对手有上一手）
      if (skill.needsOpponentLastMove) {
        if (!gameState.lastMoveBy[3 - playerId]) {
          showDialogForPlayer(playerId, "对方还没有落子，无计可施哦");
          return;
        }
      }
      // 通用守门：需要敌方棋子存在
      if (skill.requiresEnemy && !hasEnemyPieceFor(playerId)) {
        showDialogForPlayer(playerId, "现在对方一子未下，技能无从施展！");
        return;
      }

      // 触发技能
      gameState.currentPlayer = playerId; // 确保技能内部能拿到施放者
      skill.effect(gameState);

      // 标记使用
      skill.usedBy = skill.usedBy || [];
      skill.usedBy.push(playerId);

      // 技能触发：让某些“被动/反制卡”浮现（只对另一方可见）
      skills.forEach(s2 => {
        if (s2.triggeredBy === skill.id) {
          markSkillVisibleFor(s2.id, 3 - playerId, true, s2.timeout || 3000);
        }
      });

      // 刷新两个面板
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
      // 到时自动隐藏（若尚未使用）
      if (!s.usedBy || !s.usedBy.includes(playerId)) {
        s.visibleFor[playerId] = false;
        renderSkillPool(playerId);
      }
    }, timeoutMs);
  }
}
