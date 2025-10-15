// main.js

let playMode = "pvp";
let skillMode = "free";
let currentPlayer = 1;
let board = Array.from({ length: 15 }, () => Array(15).fill(0));

function startGame() {
  playMode = document.querySelector('input[name="play-mode"]:checked').value;
  skillMode = document.querySelector('input[name="skill-mode"]:checked').value;

  document.getElementById('start-menu').style.display = 'none';
  document.querySelector('.game-container').style.display = 'block';

  initBoard();
  initSkillUI();
  showDialog(`玩家${currentPlayer}开始！`);
}

function initBoard() {
  // 绘制棋盘（略）
}

function placePiece(x, y) {
  if (board[y][x] !== 0) return;
  board[y][x] = currentPlayer;
  // drawPiece(x, y, currentPlayer);

  // 记录落子（供技能调用）
  gameState.opponentLastMove = { x, y };
  currentPlayer = 3 - currentPlayer;

  onTurnStart(); // 进入下一回合
}

function onTurnStart() {
  if (playMode === "pve" && currentPlayer === 2) {
    aiTurn();
  } else {
    if (skillMode === "free") {
      renderSkillPool();
    } else if (skillMode === "random") {
      renderDrawButton();
    }
  }
}

function showDialog(text) {
  document.getElementById('dialog-box').innerText = text;
}

function clearCellOnCanvas(x, y) {
  const cellSize = 600 / 15;
  const ctx = document.getElementById('board').getContext('2d');
  ctx.clearRect(x * cellSize + 1, y * cellSize + 1, cellSize - 2, cellSize - 2);
}

// 游戏状态管理对象
const gameState = {
  board,
  opponentLastMove: null
};
