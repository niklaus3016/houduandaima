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
  // 直属上级团队长的全率（组内员工时存直属TL全率，直属员工时存直属TL全率）
  tlCommissionRate: {
    type: Number
  },
  // 级差率 —— 直接固化好的最终值，读的时候不用再减
  //   组内员工（有 teamGroupId）：上上级TL级差 = 上上级TL率 - 组长率，保底 2%
  //   直属员工（无 teamGroupId）：上上级TL级差 = 上上级TL率 - 直属TL率，保底 2%
  //   没有上上级TL → 不填
  jcCommissionRate: {
    type: Number
  },
  // 上级团队长分层提成比例（旧字段，新记录不再写，保留兼容历史数据）
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

// ===== 核心：保存前自动固化提成比例 =====
// 原则：「当时怎么存，之后怎么算」——提成比例变动只影响之后产生的订单，绝不追溯。
//
// 字段含义（每个字段存的是算好的最终值，读的时候直接用）：
//   commissionRate    = 组长提成率（员工直属上级是组长时填，否则 0）
//   tlCommissionRate  = 直属上级团队长的全率（不管员工是组内还是直属，都是直属TL的全率）
//   jcCommissionRate  = 上上级团队长拿的级差率（直接固化好，读的时候不减法）
//                        组内员工：上上级率 - 组长率，保底 2%
//                        直属员工：上上级率 - 直属TL全率，保底 2%
//                        没有上上级TL → 不填
//
// 固化路径：
//   A) 组内员工（有 teamGroupId）:
//        commissionRate   = TeamGroup.groupLeaderId 的提成率（组长那份）
//        tlCommissionRate  = TeamGroup.teamLeaderId 的上级 TL 的全率
//        jcCommissionRate  = 如果直属上级 TL 有上级 parentTlId → 上上级级差；否则不填
//   B) 直属员工（无 teamGroupId，parentId 是 TL）:
//        commissionRate   = 0（没有组长）
//        tlCommissionRate  = 直属上级 TL 的全率
//        jcCommissionRate  = 如果直属 TL 有上级 parentTlId → 上上级级差；否则不填
// ============================================================
goldLogSchema.pre('save', async function (next) {
  try {
    const empId = this.employeeId;
    if (!empId) return next();

    const FORCE_OVERWRITE = !!this.isNew;
    const crSet = typeof this.commissionRate === 'number' && this.commissionRate > 0 && this.commissionRate <= 1;
    const tlSet = typeof this.tlCommissionRate === 'number';
    const jcSet = typeof this.jcCommissionRate === 'number';
    if (!FORCE_OVERWRITE && crSet && tlSet && jcSet) return next();

    const Employee = mongoose.model('Employee');
    const TeamGroup = mongoose.model('TeamGroup');
    const Admin = mongoose.model('Admin');

    const emp = await Employee.findOne({ employeeId: empId }).select('teamGroupId parentId').lean();
    if (!emp) return next();

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

    const COMMISSION_MIN = 0.05;
    const COMMISSION_MAX = 0.20;
    const { getTeamLeaderRealCommission } = require('../utils/commissionRateCache');

    const getTlCommission = async (tlId) => {
      if (!tlId) return tlRateFallback;
      const realCommission = await getTeamLeaderRealCommission(tlId);
      if (realCommission && realCommission >= COMMISSION_MIN && realCommission <= COMMISSION_MAX) {
        return realCommission;
      }
      try {
        const tl = await Admin.findById(tlId).select('commission username').lean();
        if (tl && typeof tl.commission === 'number') {
          const c = +tl.commission;
          if (c >= COMMISSION_MIN && c <= COMMISSION_MAX) return c;
        }
      } catch (_) {}
      return tlRateFallback;
    };

    const calcJcRate = async (directTlId, subRate) => {
      if (!directTlId) return undefined;
      try {
        const tl = await Admin.findById(directTlId).select('parentTlId').lean();
        if (tl && tl.parentTlId) {
          const parentTlRate = await getTlCommission(tl.parentTlId);
          const rawDiff = +parentTlRate - subRate;
          return rawDiff <= 0 ? 0.02 : +(rawDiff).toFixed(6);
        }
      } catch (_) {}
      return undefined;
    };

    // 组内员工的第2级级差：上上级TL就是 directTlId（组长的上级TL），他拿 directTlRate - glRate
    // 不查 directTlId 的 parentTlId，因为只推2级，huangzhenhui 就是第2级
    const calcGroupJcRate = (directTlRate, glRate) => {
      if (!directTlRate || !glRate) return undefined;
      const rawDiff = +directTlRate - +glRate;
      return rawDiff <= 0 ? 0.02 : +(rawDiff).toFixed(6);
    };

    // ---------- 路径 A：组内员工（有 teamGroupId）----------
    if (emp.teamGroupId) {
      let tg = null;
      try { tg = await TeamGroup.findById(emp.teamGroupId).select('commission teamLeaderId groupLeaderId').lean(); } catch (_) {}
      if (!tg) {
        try { tg = await TeamGroup.findOne({ _id: String(emp.teamGroupId) }).select('commission teamLeaderId groupLeaderId').lean(); } catch (_) {}
      }
      if (!tg) {
        try { tg = await TeamGroup.findOne({ groupLeaderId: String(emp.teamGroupId) }).sort({ createdAt: -1 }).select('commission teamLeaderId groupLeaderId status').lean(); } catch (_) {}
      }
      if (tg) {
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
        const directTlId = tg.teamLeaderId || emp.parentId;
        const directTlRate = await getTlCommission(directTlId);

        if (FORCE_OVERWRITE || !crSet) this.commissionRate = glRate ? +glRate : 0;
        if (FORCE_OVERWRITE || !tlSet) this.tlCommissionRate = +directTlRate;
        // 第2级（上上级）级差 = 上上级TL率 − 直属上级率（直属上级是组长，所以减组长率）
        // 只推2级，huangzhenhui 就是第2级，不查他的上级
        const jcRate = calcGroupJcRate(directTlRate, glRate || 0.05);
        if (FORCE_OVERWRITE || !jcSet) {
          this.jcCommissionRate = jcRate;
        }
        // 废弃旧字段
        if (FORCE_OVERWRITE) this.parentTlCommissionRate = undefined;
        return next();
      }
    }

    // ---------- 路径 B：直属员工（无 teamGroupId，parentId 是 TL）----------
    if (emp.parentId) {
      try {
        const tl = await Admin.findById(emp.parentId).select('role parentTlId commission').lean();
        if (tl && (tl.role === 'NORMAL_ADMIN' || tl.role === 'normal_admin')) {
          const directTlRate = await getTlCommission(emp.parentId);

          if (FORCE_OVERWRITE || !crSet) this.commissionRate = 0;
          if (FORCE_OVERWRITE || !tlSet) this.tlCommissionRate = +directTlRate;
          const jcRate = await calcJcRate(emp.parentId, directTlRate);
          if (FORCE_OVERWRITE || !jcSet) {
            this.jcCommissionRate = jcRate;
          }
          if (FORCE_OVERWRITE) this.parentTlCommissionRate = undefined;
          return next();
        }
      } catch (_) {}
    }

    next();
  } catch (e) {
    console.warn('[GoldLog pre-save] 固化 commissionRate/tlCommissionRate/jcCommissionRate 失败，降级：', e.message);
    next();
  }
});

module.exports = mongoose.model('GoldLog', goldLogSchema);