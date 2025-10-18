// main.js

let playMode = "pvp";
let skillMode = "free";
let currentPlayer = 1;
let board;
let gameOver = false;

const gameState = {
  board: [],
  opponentLastMove: null,
  skipNextTurn: false,  // ← 可保留，但下面主要用 skipNextTurnFor
  cancelOpponentSkill: false,
  currentPlayer: 1,
  // 新增：精确指定要被跳过下一回合的玩家
  skipNextTurnFor: null,          // 1 或 2 或 null
  // 新增：某玩家在“因静如止水得到的额外回合”里禁止用技能
  bonusTurnNoSkillFor: null,      // 1 或 2 或 null

  showDialogForPlayer,
  clearCell,
};

function updateTurnIndicator() {
  const el = document.getElementById('turn-indicator');
  if (el) el.innerText = `轮到玩家 ${currentPlayer}`;
}

function startGame() {
  playMode = document.querySelector('input[name="play-mode"]:checked').value;
  skillMode = document.querySelector('input[name="skill-mode"]:checked').value;

  document.getElementById('start-menu').style.display = 'none';
  document.querySelector('.game-container').style.display = 'block';

  board = Array.from({ length: 15 }, () => Array(15).fill(0));
  gameState.board = board;
  gameState.skipNextTurnFor = null;
  gameState.bonusTurnNoSkillFor = null;
  gameState.opponentLastMove = null;
  gameState.skipNextTurn = false;
  gameState.cancelOpponentSkill = false;

  initBoard();
  renderSkillPool(1);
  renderSkillPool(2);
  updateTurnIndicator();
  showDialogForPlayer(1, "");
  showDialogForPlayer(2, "");
}

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

    // ★ 如果“当前玩家”正是要被跳过的人 → 直接跳过，无任何落子/技能
    if (gameState.skipNextTurnFor === currentPlayer) {
      // 清除跳过标记
      gameState.skipNextTurnFor = null;

      showDialogForPlayer(currentPlayer, "……啊？我被定住了（本轮被跳过）");
      // 直接把回合切给对手
      currentPlayer = 3 - currentPlayer;
      gameState.currentPlayer = currentPlayer;

      // 更新UI
      renderSkillPool(1);
      renderSkillPool(2);
      updateTurnIndicator();
      return;
    }

    // ↓↓↓ 下面是你原来的点击落子逻辑 ↓↓↓
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / cell);
    const y = Math.floor((e.clientY - rect.top) / cell);

    if (board[y][x] !== 0) return;

    board[y][x] = currentPlayer;
    drawPiece(x, y, currentPlayer);
    gameState.opponentLastMove = { x, y };

    if (checkWin(x, y, currentPlayer)) {
      showDialogForPlayer(currentPlayer, `🎉 玩家${currentPlayer}获胜！`);
      gameOver = true;
      return;
    }

    currentPlayer = 3 - currentPlayer;
    gameState.currentPlayer = currentPlayer;

    // 如果换手后，不再是“获益者的额外回合”，就清理禁用
    if (gameState.bonusTurnNoSkillFor && gameState.bonusTurnNoSkillFor !== currentPlayer) {
      // 说明刚刚那位的“额外回合”已经结束，解除限制
      gameState.bonusTurnNoSkillFor = null;
    }

    renderSkillPool(1);
    renderSkillPool(2);
    updateTurnIndicator();
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
      let nx = x + dx * d;
      let ny = y + dy * d;
      if (board[ny]?.[nx] === player) count++;
      else break;
    }
    for (let d = 1; d < 5; d++) {
      let nx = x - dx * d;
      let ny = y - dy * d;
      if (board[ny]?.[nx] === player) count++;
      else break;
    }
    if (count >= 5) return true;
  }
  return false;
}

function renderSkillPool(playerId) {
  const area = document.getElementById(`player${playerId}-skill-area`);
  area.innerHTML = '';

  if (skillMode !== 'free') return;

  skills.forEach(skill => {
    const used = skill.usedBy.includes(playerId);

    // 梅开二度依赖关系（维持原逻辑）
    if (skill.dependsOn) {
      const depSkill = skills.find(s => s.id === skill.dependsOn);
      if (!depSkill || !depSkill.usedBy.includes(playerId)) return;
    }

    // 可见性（维持原逻辑）
    const isVisible = skill.visible !== false;
    if (!isVisible) return;

    const btn = document.createElement('button');
    btn.className = 'skill-button';
    btn.innerText = skill.name;
    btn.title = skill.description;

    // ① 非当前玩家 → 置灰禁用
    if (playerId !== currentPlayer) {
      btn.disabled = true;
      btn.style.opacity = 0.5;
    }

    // ② 当前玩家但已用过 → 置灰禁用
    if (used) {
      btn.disabled = true;
      btn.innerText += ' ✅';
    }

    // 如果这是因【静如止水】获得的额外回合，则禁止该玩家使用技能（只许落子）
    const isBonusNoSkill = (playerId === currentPlayer) && (gameState.bonusTurnNoSkillFor === currentPlayer);
    if (isBonusNoSkill) {
      btn.disabled = true;
      btn.title = "本回合因静如止水效果，不能使用技能";
      btn.style.opacity = 0.6;
    }

    btn.onclick = () => {
      if (playerId !== currentPlayer) return;
      if (used) return;

      // A) 对方还没落过子（你之前有的通用规则——保留）
      if (!gameState.opponentLastMove) {
        showDialogForPlayer(playerId, "对方还没有落子，无计可施哦");
        return;
      }

      // B) 对方棋盘上一个子都没有 → 不允许使用需要目标的技能
      //    （如果以后某些技能不需要目标，给它加 skill.ignoreTargetCheck = true 即可跳过）
      if (!skill.ignoreTargetCheck && !hasEnemyPieceFor(playerId)) {
        showDialogForPlayer(playerId, "现在对方一子未下，技能无从施展！");
        return;
      }

      // （可选：这里也可以校验“当前回合是否已经进行过落子/技能”，但这是问题6，暂不改）

      // 真正执行技能
      skill.effect(gameState);
      skill.usedBy.push(playerId);

      // 刷新两个面板
      renderSkillPool(1);
      renderSkillPool(2);

      // 触发型技能显隐（保持原逻辑）
      skills.forEach(hiddenSkill => {
        if (hiddenSkill.triggeredBy === skill.id) {
          hiddenSkill.visible = true;
          setTimeout(() => {
            hiddenSkill.visible = false;
            renderSkillPool(1);
            renderSkillPool(2);
          }, hiddenSkill.timeout || 3000);
        }
      });
    };

    area.appendChild(btn);
  });
}

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

function showDialogForPlayer(playerId, text) {
  const box = document.getElementById(`dialog-player${playerId}`);
  if (box) box.innerText = text;
}
