const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const size = 15; // 15x15
const cellSize = canvas.width / size;
const board = Array.from({ length: size }, () => Array(size).fill(0)); // 0: 空, 1: 黑, 2: 白

let currentPlayer = 1; // 1黑先手，2白后手
let gameOver = false;

function drawBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#000';
  for (let i = 0; i < size; i++) {
    ctx.beginPath();
    ctx.moveTo(cellSize / 2, cellSize / 2 + i * cellSize);
    ctx.lineTo(canvas.width - cellSize / 2, cellSize / 2 + i * cellSize);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cellSize / 2 + i * cellSize, cellSize / 2);
    ctx.lineTo(cellSize / 2 + i * cellSize, canvas.height - cellSize / 2);
    ctx.stroke();
  }
}

function drawPiece(x, y, player) {
  const centerX = x * cellSize + cellSize / 2;
  const centerY = y * cellSize + cellSize / 2;
  const radius = cellSize / 2.5;

  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
  ctx.fillStyle = player === 1 ? 'black' : 'white';
  ctx.fill();
  ctx.strokeStyle = 'black';
  ctx.stroke();
}

function checkWin(x, y, player) {
  const directions = [
    [1, 0], [0, 1], [1, 1], [1, -1]
  ];
  for (let [dx, dy] of directions) {
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

canvas.addEventListener('click', (e) => {
  if (gameOver) return;
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left) / cellSize);
  const y = Math.floor((e.clientY - rect.top) / cellSize);
  if (board[y][x] !== 0) return;

  board[y][x] = currentPlayer;
  drawPiece(x, y, currentPlayer);

  if (checkWin(x, y, currentPlayer)) {
    document.getElementById('dialog-box').innerText = `🎉 玩家${currentPlayer} 获胜！`;
    gameOver = true;
    return;
  }

  currentPlayer = 3 - currentPlayer;
  document.getElementById('dialog-box').innerText = `轮到 玩家${currentPlayer}`;
});

drawBoard();
