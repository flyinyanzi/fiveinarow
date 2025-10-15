// skills.js

const skills = [
  {
    id: "feishazoushi",
    name: "飞沙走石",
    description: "把对方刚下的一个子扔出去",
    usedBy: [],  // 标记使用者（1 或 2）
    effect: function (gameState) {
      const move = gameState.opponentLastMove;
      if (!move) {
        gameState.showDialog("你还没给我机会施展啊！");
        return;
      }
      gameState.board[move.y][move.x] = 0;
      gameState.clearCell(move.x, move.y);
      gameState.showDialog("飞沙走石发动！对方的棋子飞出去了！");
    }
  }
];
