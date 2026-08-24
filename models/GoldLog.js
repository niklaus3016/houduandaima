const mongoose = require('mongoose');

const goldLogSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
  },
  employeeId: {
    type: String,
    required: true
  },
  deviceId: {
    type: String,
    default: ''
  },
  ecpm: {
    type: Number,
    default: 0
  },
  gold: {
    type: Number,
    required: true
  },
  slotId: {
    type: String,
    default: ''
  },
  commissionRate: {
    type: Number,
    default: 0
  },
  // 团队长分层提成比例（模型A：总包抵扣）——仅对「组长下属G员工」新订单有效
  //   tlCommissionRate = max(0, 当时团队长职级TL_rate − 当时组长GL_commissionRate)
  //   团队长端 groups commission = sum(gold × tlCommissionRate)
  // 对历史数据(tlCommissionRate为null/undefined)：展示层按近似公式 max(0,TL_档_min − GL_rate) 重算，不回写DB
  tlCommissionRate: {
    type: Number
  },
  // 上级团队长分层提成比例（3层级分账）—— 仅对「直属团队长 D员工 → 且 这个团队长有上级 parentTlId」时有效
  //   计算规则（用户确认的模型A + 2%保底）：
  //     正常级差：parentTlCommissionRate = max(0, 上级TL.commission − 直接TL.commission)  → 从总包出，公司不多付
  //     平级/倒挂：parentTlCommissionRate = 0.02 （固定 2% 保底，公司额外出，不切下级）
  //   上级团队长端展示层：sum(gold × parentTlCommissionRate) 计入总提成
  // 历史数据：不回写，展示层用 $ifNull 判空视作「0（无上级贡献）」
  parentTlCommissionRate: {
    type: Number
  },
  type: {
    type: String,
    default: 'income'
  },
  platform: {
    type: String,
    default: ''
  },
  createTime: {
    type: Date,
    default: Date.now
  }
});

// 添加索引
goldLogSchema.index({ userId: 1, createTime: 1 });
goldLogSchema.index({ employeeId: 1, createTime: 1 });
goldLogSchema.index({ employeeId: 1, commissionRate: 1, createTime: 1 });
goldLogSchema.index({ createTime: 1 });
goldLogSchema.index({ createTime: 1, ecpm: 1 });

// ===== 核心：保存前自动固化 commissionRate =====
// 原则：「当时怎么存，之后怎么算」——提成比例变动只影响之后产生的订单，绝不追溯。
// 路径：
//   A) 归属小组 G 员工（任何情况都不和上上级TL相关 ✅ 用户核心规则）:
//        commissionRate       = TeamGroup.commission（组长那份）
//        tlCommissionRate     = max(0, 直接TL本级.commission − TeamGroup.commission)
//        parentTlCommissionRate = 不填 / null（G员工永远不沾上级TL的上级）
//   B) 直属团队长 D 员工:
//        commissionRate       = 0（没组长，GL 那份不存在；保持 commissionRate=GL_rate 语义不变）
//        tlCommissionRate     = 直接TL本级.commission（TL 直接拿全量总包）
//        parentTlCommissionRate
//            · 直接TL有上级parentTlId →
//                正常(上>下)：上.commission - 下.commission（级差，公司总包不变）
//                平级/倒挂：0.02（保底2%，公司额外出，不切下级）
//            · 直接TL独立（无上级） → 不填 / null
//  「直接TL本级.commission」取值优先级：
//    1) Admin(直接TL).commission > 0 → 用这个（超管手动调职级/TDD模拟升级时会写这个字段）
//    2) 否则 TLConf 最低档 P5.commission（兜底兼容老逻辑）
// ============================================================
goldLogSchema.pre('save', async function (next) {
  try {
    const empId = this.employeeId;
    if (!empId) return next();

    // 🔒 铁律：新文档（isNew）一律强制重算覆盖3个分账字段 —— 彻底杜绝 routes/gold.js 这类外部调用点传错值污染固化逻辑
    // 非新文档（update 场景）：调用方已显式设置3个合法字段时，允许手动覆盖跳过；否则按下方逻辑补齐缺的字段（绝不追溯改历史）
    const FORCE_OVERWRITE = !!this.isNew;
    const crSet = typeof this.commissionRate === 'number' && this.commissionRate > 0 && this.commissionRate <= 1;
    const tlSet = typeof this.tlCommissionRate === 'number';
    const parentTlSet = typeof this.parentTlCommissionRate === 'number';
    if (!FORCE_OVERWRITE && crSet && tlSet && parentTlSet) return next();

    // 懒加载模型（避免 require 循环）
    const Employee = mongoose.model('Employee');
    const TeamGroup = mongoose.model('TeamGroup');
    const Admin = mongoose.model('Admin');

    const emp = await Employee.findOne({ employeeId: empId }).select('teamGroupId parentId').lean();
    if (!emp) return next();

    // 取团队长职级配置（给 TL_rate 兜底用）
    let tlCfg = null;
    try {
      const TLConf = mongoose.models.TeamLeaderLevelConfig || require('./TeamLeaderLevelConfig');
      tlCfg = await TLConf.findOne({ key: 'global' }).select('levels').lean();
    } catch (_) {}
    const sortedLevels = (tlCfg && Array.isArray(tlCfg.levels) && tlCfg.levels.length)
      ? [...tlCfg.levels].sort((a,b) => (a.minRevenue||0) - (b.minRevenue||0))
      : [];
    const TL_RATE_DEFAULT = 0.20;
    const tlRateFallback = (sortedLevels[0] && typeof sortedLevels[0].commission === 'number')
      ? +sortedLevels[0].commission
      : TL_RATE_DEFAULT;

    // ---------- 辅助：取某个TL的当前本级commission率 ----------
    //    ✅ 优先从缓存获取业绩页面实时算档的提成率（与业绩页面 100% 对齐）
    //    🔒 铁律：如果 Admin.commission 异常（=0 / >0.20 / <0.05），绝不用异常值固化，
    //    按最新档位配置+合法取值范围强制兜底，同时打印告警
    const COMMISSION_MIN = 0.05;   // P1 组长最低
    const COMMISSION_MAX = 0.20;   // P8 团队长最高
    // 收集当前所有档位合法的 commission 值集合（供"异常值"判定）
    const validCommissions = new Set();
    sortedLevels.forEach(l => { if (typeof l.commission === 'number') validCommissions.add(+l.commission); });
    if (!validCommissions.has(0.05)) validCommissions.add(0.05); // P1 组长
    let corruptedAdminsWarned = new Set();
    
    const { getTeamLeaderRealCommission } = require('../utils/commissionRateCache');
    
    const getTlCommission = async (tlId) => {
      if (!tlId) return tlRateFallback;
      
      // ✅ 优先使用业绩页面实时算档的提成率（带缓存，30分钟）
      const realCommission = await getTeamLeaderRealCommission(tlId);
      if (realCommission && realCommission >= COMMISSION_MIN && realCommission <= COMMISSION_MAX) {
        return realCommission;
      }
      
      // 兜底：从 Admin.commission 获取
      try {
        const tl = await Admin.findById(tlId).select('commission username').lean();
        if (tl && typeof tl.commission === 'number') {
          const c = +tl.commission;
          const cValid = c >= COMMISSION_MIN && c <= COMMISSION_MAX;
          if (cValid) return c;
          const tlIdStr = String(tlId);
          if (!corruptedAdminsWarned.has(tlIdStr)) {
            corruptedAdminsWarned.add(tlIdStr);
            console.warn(`[GoldLog.pre-save] ⚠️ Admin.commission异常 username=${tl.username||'?'} _id=${tlIdStr.slice(-8)} commission=${(c*100).toFixed(2)}% → 强制兜底 ${(tlRateFallback*100).toFixed(1)}%。请立即重算该 Admin 的 commission！`);
          }
        }
      } catch (_) {}
      return tlRateFallback;
    };

    // ---------- 路径 A：归属小组 G 员工（永远不沾上上级 ✅ 用户核心规则）----------
    if (emp.teamGroupId) {
      let tg = null;
      try { tg = await TeamGroup.findById(emp.teamGroupId).select('commission teamLeaderId groupLeaderId').lean(); } catch (_) {}
      if (!tg) {
        try { tg = await TeamGroup.findOne({ _id: String(emp.teamGroupId) }).select('commission teamLeaderId groupLeaderId').lean(); } catch (_) {}
      }
      // 🔧 兼容老存储习惯：Employee.teamGroupId 存「组长本人 Admin._id」而不是 TeamGroup._id，
      //    所以两次按 _id 查找失败后，fallback 按 groupLeaderId 找关联的 TeamGroup（不限状态，拿到提成/归属即可）
      if (!tg) {
        try { tg = await TeamGroup.findOne({ groupLeaderId: String(emp.teamGroupId) }).sort({ createdAt: -1 }).select('commission teamLeaderId groupLeaderId status').lean(); } catch (_) {}
      }
      // ✅ 修复（三率缺失根因）：如果三条查询 TG 都没拿到 → Employee.teamGroupId 指向了已删除/不存在的 TG/组，
      //    视为「没有小组」，跳过路径A交给下面路径B（D员工逻辑）用 emp.parentId 接管，
      //    避免后续访问 tg.teamLeaderId 抛 TypeError → catch 降级导致三率全没写入
      if (tg) {
        // 新职级 v2：优先取组长 Admin.commission（晋升/调档/懒触发都会把档位 commission 写入 Admin.commission），
        //   历史数据 fallback 到 TeamGroup.commission 字段。
        let glRate = null;
        try {
          const glAdminId = tg.groupLeaderId || emp.parentId;
          if (glAdminId) {
            const admin = await Admin.findById(glAdminId).select('commission role').lean();
            if (admin && typeof admin.commission === 'number' && admin.commission > 0 && admin.commission <= 1) {
              glRate = +admin.commission;
            }
          }
        } catch (_) {}
        if (!(glRate && typeof glRate === 'number' && glRate > 0 && glRate <= 1)) {
          glRate = (typeof tg.commission === 'number' && tg.commission > 0 && tg.commission <= 1) ? +tg.commission : null;
        }
        if (glRate) {
          // ✅ 防御性：如果 TG.teamLeaderId 也异常为空，fallback 到 emp.parentId 当直接TL
          const directTlId = tg.teamLeaderId || emp.parentId;
          const directTlRate = await getTlCommission(directTlId);
          // 固化组长那份（新文档强制覆盖 / 非新文档只在没设时填）
          if (FORCE_OVERWRITE || !crSet) this.commissionRate = glRate;
          // 固化直接TL spread
          if (FORCE_OVERWRITE || !tlSet) {
            this.tlCommissionRate = Math.max(0, +(+directTlRate - glRate).toFixed(6));
          }
          // G员工：parentTlCommissionRate 永远不填（和上上级无关）
          if (FORCE_OVERWRITE || !parentTlSet) {
            this.parentTlCommissionRate = undefined;
          }
          return next();
        }
      }
    }

    // ---------- 路径 B：直属团队长 D（没组但 parentId 是 NORMAL_ADMIN）----------
    if (emp.parentId) {
      try {
        const tl = await Admin.findById(emp.parentId).select('role parentTlId commission').lean();
        if (tl && (tl.role === 'NORMAL_ADMIN' || tl.role === 'normal_admin')) {
          const directTlRate = await getTlCommission(emp.parentId);
          // D员工：commissionRate=0（无GL），tlCommissionRate = directTlRate（TL 本级全拿总包）
          // 新文档强制覆盖，非新文档只在没设时填
          if (FORCE_OVERWRITE || !crSet) this.commissionRate = 0;
          if (FORCE_OVERWRITE || !tlSet) this.tlCommissionRate = +directTlRate;
          // 计算 parentTlCommissionRate：如果直接TL有上级
          if (FORCE_OVERWRITE || !parentTlSet) {
            if (tl.parentTlId) {
              const parentTlRate = await getTlCommission(tl.parentTlId);
              if (parentTlRate > directTlRate) {
                // 正常级差：上级>下级 → 级差分，从总包出（公司总包=parentTlRate，不变）
                this.parentTlCommissionRate = +(+parentTlRate - directTlRate).toFixed(6);
              } else {
                // 平级 / 倒挂 → 保底 2%，公司额外出（不切下级 directTlRate 分毫）
                this.parentTlCommissionRate = 0.02;
              }
            } else {
              // 直接TL是独立战队，没上级 → 上上级分成为空
              this.parentTlCommissionRate = undefined;
            }
          }
          return next();
        }
      } catch (_) {}
    }

    next();
  } catch (e) {
    // pre-save 异常不应阻塞金币流水写入：降级为不填
    console.warn('[GoldLog pre-save] 固化 commissionRate/tlCommissionRate/parentTlCommissionRate 失败，降级：', e.message);
    next();
  }
});

module.exports = mongoose.model('GoldLog', goldLogSchema);