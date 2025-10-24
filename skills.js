// skills.js  —  技能定义清单（效果函数由 main.js 提供/调用）

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
      if (!move) { gameState.showDialogForPlayer(caster, "对方还没有落子，无计可施哦"); return; }
      gameState.board[move.y][move.x] = 0;
      gameState.clearCell(move.x, move.y);
      gameState.showDialogForPlayer(caster, "飞沙走石发动！对方的棋子飞出去了！");
    }
  },

  // 2) 静如止水 —— 对方下一回合被跳过；施放者获得一次“额外回合”（该额外回合禁技）
  {
    id: "jingruzhishui",
    name: "静如止水",
    description: "使对方下一轮无法下棋（你将获得一次连续出手，但那次额外回合不能再次用技能）",
    usedBy: [],
    enabled: true,
    requiresEnemy: true, // 对方至少有一子
    effect: function (gameState) {
      const caster = gameState.currentPlayer;
      const target = 3 - caster;
      gameState.skipNextTurnFor = target;
      gameState.bonusTurnPendingFor = caster;
      gameState.showDialogForPlayer(caster, "静如止水发动！对方顿时凝固在原地！");
      setTimeout(() => { gameState.showDialogForPlayer(target, "什么！我被定住了！"); }, 700);
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
      const caster = gameState.currentPlayer;
      if (!gameState.lastMoveBy[3 - caster]) { gameState.showDialogForPlayer(caster, "对方还没有落子，无计可施哦"); return; }
      if (typeof startPreparedSkill === 'function') startPreparedSkill(caster, 'meikaierdhu');
    }
  },

  // 4) 擒拿 —— 仅在对方“梅开二度”准备阶段的3秒反应窗口内可用，用于取消（综艺模式：不限次，只在窗口可点）
  {
    id: "qin_na",
    name: "擒拿",
    description: "对方准备使用梅开二度时的3秒内可反制，直接取消其技能",
    usedBy: [],
    hidden: true,
    visibleFor: {1: false, 2: false}, // 由 renderSkillPool 特殊渲染
    enabled: true,
    effect: function (_gameState) { /* 逻辑在 main.js 的 cancelPreparedSkill */ }
  },

  // 5) 调虎离山 —— 被擒拿后3秒出现的反制卡（每人一次）
  {
    id: "tiaohulishan",
    name: "调虎离山",
    description: "被擒拿后3秒内可使用，反制对方并令其丢掉最近的两颗棋子",
    usedBy: [],
    hidden: true,
    visibleFor: {1: false, 2: false},
    enabled: true,
    effect: function (gameState) {
      // 先把窗口 & 按钮关掉，防止并发触发
      if (gameState.reactionWindow?.timeoutId) clearTimeout(gameState.reactionWindow.timeoutId);
      gameState.reactionWindow = null;
      markSkillVisibleFor('tiaohulishan', gameState.currentPlayer, false);
      
      const caster = gameState.currentPlayer;
      const target = 3 - caster;

      // 找到仍存在的对手最近两子
      const validRecent = [];
      for (let i = gameState.moveHistory.length - 1; i >= 0 && validRecent.length < 2; i--) {
        const m = gameState.moveHistory[i];
        if (m.player !== target) continue;
        if (gameState.board[m.y]?.[m.x] === target) validRecent.push({ x: m.x, y: m.y });
      }
      validRecent.forEach(pos => {
        gameState.board[pos.y][pos.x] = 0;
        gameState.clearCell(pos.x, pos.y);
      });

      // 回溯 lastMoveBy[target]
      let newLast = null;
      for (let i = gameState.moveHistory.length - 1; i >= 0; i--) {
        const m = gameState.moveHistory[i];
        if (m.player === target && gameState.board[m.y]?.[m.x] === target) { newLast = { x: m.x, y: m.y }; break; }
      }
      gameState.lastMoveBy[target] = newLast;

      gameState.showDialogForPlayer(caster, "调虎离山发动！拿走你的棋子和尊严！");
      setTimeout(() => { gameState.showDialogForPlayer(target, "啊？！我的棋子呢？！？"); }, 700);

      // 记录一次（每人一次）
      const tiao = skills.find(s => s.id === 'tiaohulishan');
      tiao.usedBy = tiao.usedBy || [];
      if (!tiao.usedBy.includes(caster)) tiao.usedBy.push(caster);

      // 清理窗口
      if (gameState.reactionWindow?.timeoutId) clearTimeout(gameState.reactionWindow.timeoutId);
      gameState.reactionWindow = null;

      // 隐藏按钮
      const me = skills.find(s => s.id === 'tiaohulishan');
      if (me) { me.visibleFor = me.visibleFor || {}; me.visibleFor[caster] = false; }
    }
  },

  // 6) 力拔山兮 —— 触发 3 秒克制选择窗口（东山/手刀；都用过则出现两极反转）
  {
    id: "libashanxi",
    name: "力拔山兮",
    description: "摔坏棋盘！若3秒内无人成功选择反制，则直接获胜（不用落子）",
    usedBy: [],
    enabled: true,
    effect: function (gameState) {
      const caster = gameState.currentPlayer;
      if (typeof startLibashanxi === 'function') startLibashanxi(caster);
    }
  },

  // 7) 东山再起（按钮名：捡起棋盘）—— 3秒内点击后进入10秒口令
  {
    id: "dongshanzaiqi",
    name: "捡起棋盘",
    description: "10秒内输入“东山再起”并发送以复原棋盘（一次性）",
    usedBy: [],
    hidden: true,
    visibleFor: {1: false, 2: false},
    enabled: true,
    effect: function (gameState) {
      if (typeof openApocPrompt === 'function') openApocPrompt(gameState.currentPlayer, 'dongshanzaiqi');
    }
  },

  // 8) 手刀 —— 3秒内点击后进入10秒口令；成功则复原并对对方施加静如止水
  {
    id: "shou_dao",
    name: "手刀",
    description: "10秒内输入“see you again”并发送以反杀（一次性）",
    usedBy: [],
    hidden: true,
    visibleFor: {1: false, 2: false},
    enabled: true,
    effect: function (gameState) {
      if (typeof openApocPrompt === 'function') openApocPrompt(gameState.currentPlayer, 'shou_dao');
    }
  },

  // 9) 两极反转 —— 当东山/手刀都被用过后，A再次力拔时，B的技能区出现3秒按钮；成功则互换阵营并封印A的力拔
  {
    id: "liangjifanzhuan",
    name: "两极反转",
    description: "双方棋子阵营互换，并封印对手的力拔山兮（通常一次）",
    usedBy: [],
    hidden: true,
    visibleFor: {1: false, 2: false},
    enabled: true,
    effect: function (gameState) {
      const caster = gameState.currentPlayer;
      if (typeof triggerLiangji === 'function') triggerLiangji(caster);
      const me = skills.find(s => s.id === 'liangjifanzhuan');
      me.usedBy = me.usedBy || [];
      if (!me.usedBy.includes(caster)) me.usedBy.push(caster);
    }
  }
];
