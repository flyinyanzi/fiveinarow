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
    enabled: true,
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
    enabled: true,
    // ★ 新增：要求对手棋子必须存在（统一守门）
    requiresEnemy: true,
    effect: function (gameState) {
      const caster = gameState.currentPlayer;
      const target = 3 - caster;
      gameState.skipNextTurnFor = target;
      gameState.bonusTurnPendingFor = caster;
      gameState.showDialogForPlayer(caster, "静如止水发动！对方顿时凝固在原地！");
      setTimeout(() => {
        gameState.showDialogForPlayer(target, "什么！我被定住了！");
      }, 700);
    }
  },

  // 3) 梅开二度 —— 依赖飞沙走石；点下去进入“准备阶段”，等待对手3秒是否擒拿
  {
    id: "meikaierdhu",
    name: "梅开二度",
    description: "在使用过飞沙走石后，可再飞一次（进入准备阶段，给予对手3秒反应窗口）",
    usedBy: [],
    dependsOn: "feishazoushi",
    needsOpponentLastMove: true,
    requiresEnemy: true,
    enabled: true,
    effect: function (gameState) {
      // 进入准备阶段由 main.js 处理，这里不直接结算
      const caster = gameState.currentPlayer;
      if (!gameState.lastMoveBy[3 - caster]) {
        gameState.showDialogForPlayer(caster, "对方还没有落子，无计可施哦");
        return;
      }
      if (typeof startPreparedSkill === 'function') {
        startPreparedSkill(caster, 'meikaierdhu');
      }
    }
  },

  // 4) 擒拿 —— 仅在对方“梅开二度”准备阶段的3秒反应窗口内可用，用于取消
  {
    id: "qin_na",
    name: "擒拿",
    description: "对方准备使用梅开二度时的3秒内可反制，直接取消其技能",
    usedBy: [],
    hidden: true,            // 平时不显示
    visibleFor: {1: false, 2: false}, // 通过 markSkillVisibleFor 临时点亮
    enabled: true,
    effect: function (gameState) {
      const caster = gameState.currentPlayer; // 此时 caster 是防守方
      if (typeof cancelPreparedSkill === 'function') {
        cancelPreparedSkill(caster);
      }
    }
  },

  // 5) 调虎离山 —— 第二步再启用（此处占位）
  {
    id: "tiaohulishan",
    name: "调虎离山",
    description: "在被擒拿后3秒内可使用，反制对方并令其丢掉最近的两颗棋子",
    usedBy: [],
    hidden: true,
    visibleFor: {1: false, 2: false},
    enabled: true,
    effect: function (gameState) {
      const caster = gameState.currentPlayer;
      const target = 3 - caster;

      // ---- 找到“仍然在棋盘上”的目标最近两子 ----
      const target = 3 - caster;

      // 从落子历史从后往前找，挑出仍然是 target 的有效棋子坐标
      const validRecent = [];
      for (let i = gameState.moveHistory.length - 1; i >= 0 && validRecent.length < 2; i--) {
        const m = gameState.moveHistory[i];
        if (m.player !== target) continue;
        if (gameState.board[m.y]?.[m.x] === target) {
          validRecent.push({ x: m.x, y: m.y });
        }
      }

      // 移除最多两颗（可能只有1颗或0颗）
      validRecent.forEach(pos => {
        gameState.board[pos.y][pos.x] = 0;
        gameState.clearCell(pos.x, pos.y);
      });

      // 更新对方 lastMove（若最后一步被移除，则回溯找到仍存在的最后一步）
      let newLast = null;
      for (let i = gameState.moveHistory.length - 1; i >= 0; i--) {
        const m = gameState.moveHistory[i];
        if (m.player === target && gameState.board[m.y]?.[m.x] === target) {
          newLast = { x: m.x, y: m.y };
          break;
        }
      }
      gameState.lastMoveBy[target] = newLast;

      // 记录：调虎离山本局被此玩家用过（每人限用一次）
      const tiao = skills.find(s => s.id === 'tiaohulishan');
      if (tiao) {
        tiao.usedBy = tiao.usedBy || [];
        if (!tiao.usedBy.includes(caster)) tiao.usedBy.push(caster);
      }

      gameState.showDialogForPlayer(caster, "调虎离山发动！拿走你的棋子和尊严！");
      setTimeout(() => {
        gameState.showDialogForPlayer(target, "啊？！我的棋子呢？！？");
      }, 700);

      // 清空所有技能状态
      if (gameState.reactionWindow?.timeoutId) clearTimeout(gameState.reactionWindow.timeoutId);
      gameState.reactionWindow = null;
      gameState.preparedSkill = null;

      // 技能使用标记
      gameState.skillUsedThisTurn = true;

      // 隐藏调虎离山
      markSkillVisibleFor('tiaohulishan', caster, false);

      // 重新渲染按钮状态
      renderSkillPool(1);
      renderSkillPool(2);
    }
  }

];
