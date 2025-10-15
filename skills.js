// skills.js

const skills = [
  {
    id: "feishazoushi",
    name: "飞沙走石",
    description: "把对方刚下的一个子扔出去",
    usedBy: [],
    effect: function (gameState) {
      const move = gameState.opponentLastMove;
      gameState.board[move.y][move.x] = 0;
      gameState.clearCell(move.x, move.y);
      gameState.showDialog("飞沙走石发动！对方的棋子飞出去了！");
    }
  },
  {
    id: "jingruzhishui",
    name: "静如止水",
    description: "使对方这轮无法下棋",
    usedBy: [],
    effect: function (gameState) {
      gameState.skipNextTurn = true;
      gameState.showDialog("静如止水发动！对方顿时凝固在原地！");
    }
  }
];
