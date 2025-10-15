// skills.js

const skills = [
  {
    id: "feishazoushi",
    name: "飞沙走石",
    description: "把对方刚下的一个子扔出去",
    trigger: "onUse",
    effect: function (gameState) {
      const move = gameState.opponentLastMove;
      if (!move) return;
      gameState.board[move.y][move.x] = 0;
      clearCellOnCanvas(move.x, move.y);
      showDialog("飞沙走石！对方的棋子飞出去了！");
    }
  }

  // 更多技能将加入此数组
];
