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
      gameState.showDialogForPlayer(gameState.currentPlayer, "飞沙走石发动！对方的棋子飞出去了！");
    }
  },
  {
    id: "jingruzhishui",
    name: "静如止水",
    description: "使对方这轮无法下棋",
    usedBy: [],
    effect: function (gameState) {
      gameState.skipNextTurn = true;
      gameState.showDialogForPlayer(gameState.currentPlayer, "静如止水发动！对方顿时凝固在原地！");
    }
  },
  {
    id: "meikaierdhu",
    name: "梅开二度",
    description: "飞沙走石之后可再次使用一次飞沙走石",
    usedBy: [],
    visible: false,
    dependsOn: "feishazoushi",
    effect: function (gameState) {
      const move = gameState.opponentLastMove;
      gameState.board[move.y][move.x] = 0;
      gameState.clearCell(move.x, move.y);
      gameState.showDialogForPlayer(gameState.currentPlayer, "梅开二度！再飞你一次！");
    }
  },
  {
    id: "qin_na",
    name: "擒拿",
    description: "对方准备使用梅开二度时短时间内可反制，取消其技能",
    usedBy: [],
    visible: false,
    triggeredBy: "meikaierdhu",
    timeout: 3000,
    effect: function (gameState) {
      gameState.cancelOpponentSkill = true;
      gameState.showDialogForPlayer(gameState.currentPlayer, "擒拿擒拿，擒擒又拿拿！");
    }
  },
  {
    id: "tiaohulishan",
    name: "调虎离山",
    description: "对方使用擒拿后短时间内可发动，偷取其两个棋子",
    usedBy: [],
    visible: false,
    triggeredBy: "qin_na",
    timeout: 3000,
    effect: function (gameState) {
      let removed = 0;
      for (let y = 0; y < 15; y++) {
        for (let x = 0; x < 15; x++) {
          if (gameState.board[y][x] === 3 - gameState.currentPlayer) {
            gameState.board[y][x] = 0;
            gameState.clearCell(x, y);
            removed++;
            if (removed >= 2) break;
          }
        }
        if (removed >= 2) break;
      }
      gameState.showDialogForPlayer(gameState.currentPlayer, "调虎离山成功，顺走对方两子！");
    }
  }
];
