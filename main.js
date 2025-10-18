// main.js

let playMode = "pvp";
let skillMode = "free";
let currentPlayer = 1;
let board;
let gameOver = false;

const gameState = {
  board: [],
  opponentLastMove: null,
  skipNextTurn: false,
  cancelOpponentSkill: false,
  currentPlayer: 1,
  showDialogForPlayer,
  clearCell,
};

function startGame() {
  playMode = document.querySelector('input[name="play-mode"]:checked').value;
  skillMode = document.querySelector('input[name="skill-mode"]:checked').value;

  document.getElementById('start-menu').style.display = 'none';
  document.querySelector('.game-container').style.display = 'block';

  board = Array.from({ length: 15 }, () => Array(15).fill(0));
  gameState.board = board;
  gameState.opponentLastMove = null;
  gameState.skipNextTurn = false;
  gameState.cancelOpponentSkill = false;

  initBoard();
  renderSkillPool(1);
  renderSkillPool(2);
  showDialogForPlayer(1, "玩家1先手");
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

    if (gameState.skipNextTurn) {
      gameState.skipNextTurn = false;
      showDialogForPlayer(currentPlayer, "玩家" + currentPlayer + "跳过回合！");
      currentPlayer = 3 - currentPlayer;
      gameState.currentPlayer = currentPlayer;
      renderSkillPool(1);
      renderSkillPool(2);
      return;
    }

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
    renderSkillPool(1);
    renderSkillPool(2);
    showDialogForPlayer(currentPlayer, `轮到玩家${currentPlayer}`);
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
    const isVisible = skill.visible !== false || playerId === 1 || playerId === 2;

    // 梅开二度：飞沙走石使用后再显示
    if (skill.dependsOn) {
      const depSkill = skills.find(s => s.id === skill.dependsOn);
      if (!depSkill || !depSkill.usedBy.includes(playerId)) return;
    }

    if (!isVisible) return;

    const btn = document.createElement('button');
    btn.className = 'skill-button';
    btn.innerText = skill.name;
    btn.title = skill.description;

    if (used) {
      btn.disabled = true;
      btn.innerText += ' ✅';
    }

    btn.onclick = () => {
      if (used) return;

      if (!gameState.opponentLastMove) {
        showDialogForPlayer(playerId, "对方还没有落子，无计可施哦");
        return;
      }

      if (gameState.cancelOpponentSkill) {
        showDialogForPlayer(playerId, "技能被取消，无法发动！");
        return;
      }

      skill.effect(gameState);
      skill.usedBy.push(playerId);
      renderSkillPool(1);
      renderSkillPool(2);

      // 如果技能触发了其他技能的显现（如擒拿）
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

function showDialogForPlayer(playerId, text) {
  const box = document.getElementById(`dialog-player${playerId}`);
  if (box) box.innerText = text;
}
