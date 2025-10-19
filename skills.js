// skills.js

// 统一说明：
// - usedBy: [1,2] 表示该技能被哪些玩家用过（每人限用一次）。
// - hidden/visibleFor: 控制是否在卡池可见（可做“触发出现”的隐藏卡）。
// - needsOpponentLastMove: 需要“对手有上一手”。
// - requiresEnemy: 需要“棋盘上存在对手棋子”。

const skills = [
  // 1) 飞沙走石 —— 把“对手的上一手”扔出去
  {
    id: "feishazoushi",
    name: "飞沙走石",
    description: "把对手刚下的一颗子扔出去",
    usedBy: [],
    needsOpponentLastMove: true,
    requiresEnemy: true,
    effect: function (gameState) {
      const caster = gameState.currentPlayer;
      const opp = 3 - caster;
      const move = gameState.lastMoveBy[opp];
      if (!move) {
        gameState.showDialogForPlayer(caster, "对方还没有落子，无计可施哦");
        return;
      }
      gameState.board[move.y][move.x] = 0;
      gameState.clearCell(move.x, move.y);
      gameState.showDialogForPlayer(caster, "飞沙走石发动！对方的棋子飞出去了！");
    }
  },

  // 2) 静如止水 —— 对方下一回合被跳过；施放者获得一次“额外回合”，但那回合不能再用技能
  {
    id: "jingruzhishui",
    name: "静如止水",
    description: "使对方下一轮无法下棋（你将获得一次连续出手，但那次额外回合不能再次用技能）",
    usedBy: [],
    // 该技能不要求对手有上一手，也不要求棋盘上有对手棋
    effect: function (gameState) {
      const caster = gameState.currentPlayer;
      const target = 3 - caster;

      gameState.skipNextTurnFor = target;       // 对方被跳过
      gameState.bonusTurnNoSkillFor = caster;   // 本人额外回合禁用技能

      // 双对白：先施放者，再对方反应
      gameState.showDialogForPlayer(caster, "静如止水发动！对方顿时凝固在原地！");
      setTimeout(() => {
        gameState.showDialogForPlayer(target, "什么！我被定住了！");
      }, 700);
    }
  },

  // 3) 梅开二度 —— 依赖飞沙走石（占位：先禁用，不参与卡池）
  {
    id: "meikaierdhu",
    name: "梅开二度",
    description: "在使用过飞沙走石后，允许再次飞一次（占位，暂不启用）",
    usedBy: [],
    enabled: false,             // ★ 暂时禁用，等我们完成回合状态机再启用
    dependsOn: "feishazoushi",
    needsOpponentLastMove: true,
    requiresEnemy: true,
    effect: function (gameState) {
      const caster = gameState.currentPlayer;
      const opp = 3 - caster;
      const move = gameState.lastMoveBy[opp];
      if (!move) {
        gameState.showDialogForPlayer(caster, "对方还没有落子，无计可施哦");
        return;
      }
      gameState.board[move.y][move.x] = 0;
      gameState.clearCell(move.x, move.y);
      gameState.showDialogForPlayer(caster, "梅开二度！再飞你一次！");
    }
  },

  // 4) 擒拿 —— 被“梅开二度”触发时短暂出现（占位：禁用）
  {
    id: "qin_na",
    name: "擒拿",
    description: "对方准备使用梅开二度时短暂出现（占位，暂不启用）",
    usedBy: [],
    enabled: false,             // ★ 暂时禁用
    hidden: true,
    triggeredBy: "meikaierdhu",
    timeout: 3000,              // 出现3秒
    effect: function (gameState) {
      const caster = gameState.currentPlayer;
      gameState.showDialogForPlayer(caster, "擒拿擒拿，擒擒又拿拿！（占位）");
      // 未来会接入 cancelOpponentSkill 等反制逻辑
    }
  },

  // 5) 调虎离山 —— 被“擒拿”触发时短暂出现（占位：禁用）
  {
    id: "tiaohulishan",
    name: "调虎离山",
    description: "对方使用擒拿后短暂出现（占位，暂不启用）",
    usedBy: [],
    enabled: false,             // ★ 暂时禁用
    hidden: true,
    triggeredBy: "qin_na",
    timeout: 3000,
    effect: function (gameState) {
      const caster = gameState.currentPlayer;
      gameState.showDialogForPlayer(caster, "调虎离山！（占位）");
      // 未来会设计偷子/置换等效果
    }
  }
];
