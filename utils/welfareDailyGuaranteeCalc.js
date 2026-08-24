/**
 * 每日保底（3000 条 → 保底 10 万金币）共享计算函数
 * 供 status 接口和 claim 接口两边调用，确保口径 100% 唯一。
 *
 * 口径（已与用户反复对齐确认）：
 *   ① todayViews & todayGoldReal：按 UserGold.userId + 北京日 00:00:00~现在 查询 GoldLog
 *                                  全类型 count/sum，和前端 GET /api/gold/today-stats 完全一致。
 *   ② 3000 条门槛：todayViews >= 配置 thresholdViews（方案A：允许奖励类型GoldLog凑数，1条无所谓）
 *   ③ totalGoldForGuarantee = todayGoldReal
 *                            + weeklyVirtualAddGold（周奖已达标未领：+ weeklyTarget.bonusGold 虚抵扣）
 *                            - todayClaimedGapGold（今日已领保底，防止循环叠加）
 *   ④ gapGold = max(0, thresholdGold - totalGoldForGuarantee)
 */

const mongoose = require('mongoose');
const { getBeijingStartOfDay, getBeijingDate, getBeijingDateString } = require('./date');
const GoldLog = mongoose.models.GoldLog || require('../models/GoldLog');
const UserGold = mongoose.models.UserGold || require('../models/UserGold');
const WeeklyTarget = mongoose.models.WeeklyTarget || require('../models/WeeklyTarget');
const WeeklyBonusClaim = mongoose.models.WeeklyBonusClaim || require('../models/WeeklyBonusClaim');
const DailyGuaranteeRecord = mongoose.models.DailyGuaranteeRecord || require('../models/DailyGuaranteeRecord');
const WelfareDailyGuaranteeConfig = mongoose.models.WelfareDailyGuaranteeConfig || require('../models/WelfareDailyGuaranteeConfig');

// 兜底默认配置（数据库无记录 / DB 异常时使用）—— 二段保底版
//   stage 1: 看满 2000 条 → 补齐到 5 万金币
//   stage 2: 看满 3000 条 → 补齐到 10 万金币（含已领第一段的补贴金币）
const DEFAULT_CONFIG = {
  enabled: true,
  stages: [
    { stage: 1, thresholdViews: 2000, thresholdGold: 50000 },
    { stage: 2, thresholdViews: 3000, thresholdGold: 100000 }
  ]
};

// 兼容老逻辑（单段保底时期）：对外暴露的 thresholdViews/thresholdGold 字段
//   - 老接口 /config GET 返回时若没找到 stages，会 fallback 到这两个值
//   - computeDailyGuaranteeStatus 老函数也仍按单段处理
const LEGACY_FALLBACK = { thresholdViews: 3000, thresholdGold: 100000 };

// ===== DB 配置读取（进程内 5s 缓存，避免每次 status/claim 都查 DB）=====
const _CFG_CACHE_TTL_MS = 5 * 1000;
let _cfgCache = null; // { value: {...}, expireAt: ts, source: 'DB'|'DEFAULT', raw: doc }

/**
 * 拉取有效配置（二段保底版）：
 *   1) 命中 5s 进程缓存 → 直接返回
 *   2) 查 WelfareDailyGuaranteeConfig 集合（单文档，取最新一条 updatedAt 倒序）
 *   3) 优先读 stages 数组；老文档只有 thresholdViews/thresholdGold → 自动视为单段（stage=2）
 *   4) 若有 effectiveFromDateStr，判断今天是否 >= 该日期；未到生效日仍返回 DEFAULT_CONFIG
 *   5) 任何异常都兜底 DEFAULT_CONFIG，保证用户侧接口不挂
 *
 * 返回格式（新）:
 *   { stages: [{stage:1, thresholdViews, thresholdGold}, {stage:2, ...}], _meta: {...} }
 *
 * 兼容字段（保留）:
 *   - thresholdViews / thresholdGold：等于"最后一段"（stage=2）的值，方便老接口直接读
 */
async function getEffectiveConfig() {
  const now = Date.now();
  if (_cfgCache && _cfgCache.expireAt > now) {
    return _cfgCache.value;
  }
  let doc;
  try {
    doc = await WelfareDailyGuaranteeConfig.findOne({}).sort({ updatedAt: -1 }).lean();
  } catch (err) {
    console.warn('[welfareDailyGuarantee] getEffectiveConfig DB err, fallback DEFAULT', err && err.message);
    doc = null;
  }

  let eff;
  const todayStr = getBeijingDateString();
  if (!doc) {
    // 无 DB 记录 → 走 DEFAULT_CONFIG
    eff = {
      ...DEFAULT_CONFIG,
      // 兼容字段
      thresholdViews: DEFAULT_CONFIG.stages[DEFAULT_CONFIG.stages.length - 1].thresholdViews,
      thresholdGold:  DEFAULT_CONFIG.stages[DEFAULT_CONFIG.stages.length - 1].thresholdGold,
      _meta: { source: 'DEFAULT', effectiveFrom: '', updatedAt: null, updatedBy: '', remark: '' }
    };
  } else {
    const effectiveFrom = String(doc.effectiveFromDateStr || '').trim();
    const notEffectiveYet = effectiveFrom && effectiveFrom > todayStr;

    // 解析 stages：优先用新字段，老文档 fallback 单段
    let stages;
    if (Array.isArray(doc.stages) && doc.stages.length > 0 && doc.stages.every(s => s && s.stage > 0 && s.thresholdViews > 0 && s.thresholdGold > 0)) {
      stages = doc.stages.map(s => ({
        stage:           Number(s.stage),
        thresholdViews: Number(s.thresholdViews),
        thresholdGold:  Number(s.thresholdGold)
      }));
    } else if (Number(doc.thresholdViews) > 0 && Number(doc.thresholdGold) > 0) {
      // 老文档（单段保底）→ 视为 stage=2
      stages = [{ stage: 2, thresholdViews: Number(doc.thresholdViews), thresholdGold: Number(doc.thresholdGold) }];
    } else {
      stages = DEFAULT_CONFIG.stages;
    }

    const useDefault = notEffectiveYet;
    const finalStages = useDefault ? DEFAULT_CONFIG.stages : stages;

    // 兼容字段：等于最后一段
    const lastStage = finalStages[finalStages.length - 1];

    eff = {
      enabled: doc.enabled !== false, // 默认 true，只有明确 false 才关闭
      stages: finalStages,
      // 兼容字段
      thresholdViews: lastStage.thresholdViews,
      thresholdGold:  lastStage.thresholdGold,
      _meta: {
        source: useDefault ? 'DEFAULT(pending_effective)' : (Array.isArray(doc.stages) ? 'DB' : 'DB(legacy_single)'),
        effectiveFrom,
        updatedAt: doc.updatedAt || null,
        updatedBy: doc.updatedBy || '',
        remark: doc.remark || ''
      }
    };
  }
  _cfgCache = { value: eff, expireAt: now + _CFG_CACHE_TTL_MS };
  return eff;
}

/**
 * 管理员 SET 配置后调用：强制清本地缓存，并写回 DB（upsert 单文档）—— 二段保底版
 *   入参二选一：
 *     1) stages: [{stage:1, thresholdViews, thresholdGold}, {stage:2, ...}]（推荐，新版）
 *     2) thresholdViews + thresholdGold（兼容老前端，单段保底视为 stage=2）
 *   两种入参都会清进程内缓存，下次 getEffectiveConfig 立刻读到新值
 * 返回写入后的文档
 */
async function saveAdminConfig({ stages, thresholdViews, thresholdGold, effectiveFromDateStr, updatedBy, remark, enabled }) {
  // 获取现有文档，以便保留未修改的字段
  const exist = await WelfareDailyGuaranteeConfig.findOne({}).sort({ updatedAt: -1 }).lean();

  // 入参校验：stages 优先
  let finalStages = null;
  if (Array.isArray(stages) && stages.length > 0) {
    // 校验 stages：必须 stage 严格递增 + views/gold 都严格递增
    for (let i = 0; i < stages.length; i++) {
      const s = stages[i];
      if (!s || !(Number(s.stage) > 0) || !(Number(s.thresholdViews) > 0) || !(Number(s.thresholdGold) > 0)) {
        throw new Error('stages 中每段必须含正数的 stage/thresholdViews/thresholdGold');
      }
      if (Number(s.stage) !== i + 1) {
        throw new Error(`stages 必须按 stage=1,2,... 递增（第 ${i+1} 项的 stage 应为 ${i+1}）`);
      }
      if (i > 0) {
        if (Number(s.thresholdViews) <= Number(stages[i-1].thresholdViews)) {
          throw new Error(`stages[${i}].thresholdViews 必须大于 stages[${i-1}].thresholdViews`);
        }
        if (Number(s.thresholdGold) <= Number(stages[i-1].thresholdGold)) {
          throw new Error(`stages[${i}].thresholdGold 必须大于 stages[${i-1}].thresholdGold`);
        }
      }
    }
    finalStages = stages.map(s => ({
      stage:           Number(s.stage),
      thresholdViews: Number(s.thresholdViews),
      thresholdGold:  Number(s.thresholdGold)
    }));
  } else if (exist) {
    // 如果没传 stages，但有现有文档，保留现有 stages
    if (Array.isArray(exist.stages) && exist.stages.length > 0) {
      finalStages = exist.stages.map(s => ({
        stage: Number(s.stage),
        thresholdViews: Number(s.thresholdViews),
        thresholdGold: Number(s.thresholdGold)
      }));
    } else if (Number(exist.thresholdViews) > 0 && Number(exist.thresholdGold) > 0) {
      finalStages = [{ stage: 2, thresholdViews: Number(exist.thresholdViews), thresholdGold: Number(exist.thresholdGold) }];
    }
  }

  // 如果仍然没有 stages，尝试用老字段
  if (!finalStages) {
    const tv = Number(thresholdViews);
    const tg = Number(thresholdGold);
    if (tv > 0 && tg > 0) {
      finalStages = [{ stage: 2, thresholdViews: tv, thresholdGold: tg }];
    }
  }

  // 如果还是没有 stages，但提供了 enabled 字段，允许只更新 enabled（使用默认 stages）
  if (!finalStages && enabled !== undefined) {
    finalStages = DEFAULT_CONFIG.stages.map(s => ({
      stage: Number(s.stage),
      thresholdViews: Number(s.thresholdViews),
      thresholdGold: Number(s.thresholdGold)
    }));
  }

  if (!finalStages) {
    throw new Error('必须提供 stages 数组 或 (thresholdViews + thresholdGold)');
  }

  // 处理 enabled 字段：如果没传，保留现有值（或默认 true）
  let finalEnabled;
  if (enabled === undefined || enabled === null) {
    finalEnabled = exist ? (exist.enabled !== false) : true;
  } else {
    finalEnabled = !!enabled;
  }

  const payload = {
    enabled: finalEnabled,
    stages: finalStages,
    // 同时写老字段（兼容老前端 GET /config 直接读 thresholdViews/thresholdGold）
    thresholdViews: finalStages[finalStages.length - 1].thresholdViews,
    thresholdGold:  finalStages[finalStages.length - 1].thresholdGold,
    effectiveFromDateStr: String(effectiveFromDateStr || '').trim(),
    updatedBy: String(updatedBy || ''),
    remark: String(remark || '')
  };

  // 单文档模式：先查 _id，有则 update，无则 create
  let doc;
  if (exist) {
    doc = await WelfareDailyGuaranteeConfig.findByIdAndUpdate(exist._id, { $set: payload }, { new: true, runValidators: true }).lean();
  } else {
    doc = await WelfareDailyGuaranteeConfig.create(payload);
    doc = doc.toObject ? doc.toObject() : doc;
  }
  // 清进程内缓存，下次 getEffectiveConfig 立刻读到新值
  _cfgCache = null;
  return doc;
}

/** 手动强制刷新缓存（一般 SET 后自动清，测试用） */
function _refreshConfigCache() { _cfgCache = null; }

// ===== 员工 token 和接口参数 → 标准身份对象 =====
// priority: employeeId (from token / query) > userId (from query)
async function resolveIdentity({ employeeId, userId }) {
  const eid = String(employeeId || '').trim();
  const uid = String(userId || '').trim();
  if (!eid && !uid) {
    throw new Error('MISSING_IDENTITY');
  }
  let userGold;
  if (eid) {
    userGold = await UserGold.findOne({ employeeId: eid }).select('employeeId userId currentMonthGold').lean();
  } else {
    userGold = await UserGold.findOne({ userId: uid }).select('employeeId userId currentMonthGold').lean();
  }
  if (!userGold) {
    throw new Error('USERGOLD_NOT_FOUND');
  }
  return {
    employeeId: String(userGold.employeeId),
    userId: String(userGold.userId),
    currentMonthGold: userGold.currentMonthGold || 0
  };
}

// ===== 本周辅助（逻辑与 weeklyBonus.js 完全一致，避免不同步）=====
function getCurrentWeek() {
  const now = getBeijingDate();
  const year = now.getFullYear();
  const firstDayOfYear = new Date(year, 0, 1);
  const dayOfWeek = firstDayOfYear.getUTCDay() || 7;
  const daysToFirstMonday = (8 - dayOfWeek) % 7;
  const firstMonday = new Date(firstDayOfYear);
  firstMonday.setDate(firstMonday.getDate() + daysToFirstMonday);
  const diffTime = now - firstMonday;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const weekNumber = Math.floor(diffDays / 7) + 1;
  return `${year}-${weekNumber.toString().padStart(2, '0')}`;
}
function getWeekRange(week) {
  const [year, weekNumber] = week.split('-').map(Number);
  const firstDayOfYear = new Date(year, 0, 1);
  const dayOfWeek = firstDayOfYear.getUTCDay() || 7;
  const daysToFirstMonday = (8 - dayOfWeek) % 7;
  const firstMonday = new Date(firstDayOfYear);
  firstMonday.setDate(firstMonday.getDate() + daysToFirstMonday);
  const weekStart = new Date(firstMonday);
  weekStart.setDate(weekStart.getDate() + (weekNumber - 1) * 7);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  weekEnd.setHours(0, 0, 0, 0);
  return {
    start: new Date(weekStart.getTime() - 8 * 60 * 60 * 1000),
    end:   new Date(weekEnd.getTime()   - 8 * 60 * 60 * 1000)
  };
}

// ===== 今日（北京日）todayViews / todayGoldReal：和前端 /api/gold/today-stats 完全一致 =====
async function getTodayStats(userId) {
  const todayStart = getBeijingStartOfDay();
  // gold.js /today-stats 使用 userId + { $gte: todayStart } 无条件上限（非闭区间），全类型 count + gold sum
  const agg = await GoldLog.aggregate([
    { $match: { userId, createTime: { $gte: todayStart } } },
    { $group: {
        _id: null,
        todayViews:    { $sum: 1 },
        todayGoldReal: { $sum: '$gold' }
    }}
  ]);
  if (agg.length === 0) return { todayViews: 0, todayGoldReal: 0 };
  return {
    todayViews:    Number(agg[0].todayViews    || 0),
    todayGoldReal: Number(agg[0].todayGoldReal || 0)
  };
}

// ===== 周奖状态：是否已达标未领、虚加金币多少（和 weeklyBonus.js 100% 对齐）=====
//  ⚠️  关键口径：
//     1) 本周 GoldLog 条数：按 userId 维度（和 weeklyBonus.js claim L89-93 / progress L175-179 完全一致）
//        ❌ 之前错用 employeeId 维度，在部分 userId 多 employeeId 或数据错位时会误判（如 6974 有 -4 条差）
//     2) 本周是否已领：按 userId + employeeId + week 三字段匹配（和 weeklyBonus.js claim L70-73 / progress L185-188 对齐）
async function getWeeklyVirtualAdd(userId, employeeId) {
  const currentWeek = getCurrentWeek();
  const [weeklyTarget, isClaimed] = await Promise.all([
    WeeklyTarget.findOne({ week: currentWeek }).select('week targetCount bonusGold').lean(),
    WeeklyBonusClaim.exists({ userId, employeeId, week: currentWeek })
  ]);
  if (!weeklyTarget || weeklyTarget.targetCount <= 0) {
    return {
      week: currentWeek,
      targetCount: 0,
      currentCount: 0,
      bonusGold: 0,
      isQualified: false,
      isClaimed: false,
      virtualAddGold: 0
    };
  }
  const { start, end } = getWeekRange(currentWeek);
  // countDocuments（比聚合管道的 $match+$count 快）
  const currentCount = await GoldLog.countDocuments({
    userId,
    createTime: { $gte: start, $lt: end }
  });
  const isQualified = currentCount >= weeklyTarget.targetCount;
  const virtualAddGold = (isQualified && !isClaimed) ? Number(weeklyTarget.bonusGold || 0) : 0;
  return {
    week: currentWeek,
    targetCount: Number(weeklyTarget.targetCount),
    currentCount,
    bonusGold: Number(weeklyTarget.bonusGold || 0),
    isQualified,
    isClaimed: !!isClaimed,
    virtualAddGold
  };
}

// ===== 今日是否已领保底（二段版：返回多条，按 stage 区分）=====
//   - 老接口：getTodayClaimedRecord 单条 → 兼容老逻辑，返回 stage=2 或最新一条
//   - 新接口：getTodayClaimedRecords 多条 → 二段保底用，返回所有已领段
async function getTodayClaimedRecords(employeeId, dateStr) {
  // 兼容老数据：stage 字段可能不存在（升级前老记录），统一视为 stage=2
  //   等价查询：{ employeeId, dateStr, $or: [{stage: {$exists: false}}, {stage: 2}] }
  //   但因为 schema default=2，新建的记录永远有 stage 字段，所以这里只查当天所有段
  const docs = await DailyGuaranteeRecord.find({ employeeId, dateStr }).lean();
  return docs;
}
// 兼容老调用方：返回最新一条（按 claimedAt 倒序）
async function getTodayClaimedRecord(employeeId, dateStr) {
  const docs = await getTodayClaimedRecords(employeeId, dateStr);
  if (!docs.length) return null;
  // 优先返回 stage=2 那条（兼容老逻辑读"单段保底")
  const stage2 = docs.find(d => Number(d.stage || 2) === 2);
  return stage2 || docs.sort((a,b) => new Date(b.claimedAt) - new Date(a.claimedAt))[0];
}

// ===== 统一状态计算入口 =====
// 返回前端 status 接口所有字段（不含 claimedRecord 本身，由调用方拼）
//  - 不传入 config 时：自动读 DB 配置（5s 缓存 + DEFAULT 兜底）
//  - 传入 config 时：测试脚本专用，直接使用传入的配置
async function computeDailyGuaranteeStatus({ employeeId, userId }, config) {
  const dateStr = getBeijingDateString();
  const idObj = await resolveIdentity({ employeeId, userId });
  const [ stats, weekly, claimed, effCfg ] = await Promise.all([
    getTodayStats(idObj.userId),
    getWeeklyVirtualAdd(idObj.userId, idObj.employeeId),
    getTodayClaimedRecord(idObj.employeeId, dateStr),
    config ? Promise.resolve(config) : getEffectiveConfig()
  ]);
  const useCfg = config || effCfg;

  const todayClaimedGapGold = claimed ? Number(claimed.gapGold || 0) : 0;
  const totalGoldForGuarantee = stats.todayGoldReal + weekly.virtualAddGold - todayClaimedGapGold;
  const needViews = stats.todayViews < useCfg.thresholdViews;
  const gapPreCheck = Math.max(0, useCfg.thresholdGold - totalGoldForGuarantee);

  let status;
  if (claimed) {
    status = 'CLAIMED';
  } else if (needViews) {
    status = 'NOT_QUALIFIED';
  } else if (gapPreCheck <= 0) {
    status = 'NO_GAP_FOUND';
  } else {
    status = 'ELIGIBLE_TO_CLAIM';
  }

  const gapGold = (status === 'ELIGIBLE_TO_CLAIM') ? gapPreCheck : 0;
  const progress = useCfg.thresholdViews > 0
    ? Number((stats.todayViews / useCfg.thresholdViews).toFixed(4))
    : 0;

  return {
    employeeId: idObj.employeeId,
    date: dateStr,
    thresholdViews: useCfg.thresholdViews,
    thresholdGold:  useCfg.thresholdGold,

    todayViews:    stats.todayViews,
    todayViewsProgress: progress,
    todayGoldReal: stats.todayGoldReal,

    weekly,

    totalGoldForGuarantee: Number(totalGoldForGuarantee.toFixed(2)),
    gapGold: Number(gapGold.toFixed(2)),
    status,

    claimedRecord: claimed ? {
      gapGold:   Number(claimed.gapGold || 0),
      claimedAt: claimed.claimedAt
    } : null,

    // 给 claim 接口用：避免重复查
    _identity: idObj,
    _claimed:  claimed
  };
}

/**
 * 二段保底状态计算入口（多段版）
 *   - 不传入 config 时：自动读 DB 配置（5s 缓存 + DEFAULT 兜底）
 *   - 传入 config 时：测试脚本专用，直接使用传入的配置（必须含 stages 数组）
 *
 * 返回格式：
 *   {
 *     employeeId, date,
 *     todayViews, todayGoldReal, weekly,
 *     stages: [
 *       {
 *         stage, thresholdViews, thresholdGold,
 *         status: 'CLAIMED'|'NOT_QUALIFIED'|'NO_GAP_FOUND'|'ELIGIBLE_TO_CLAIM',
 *         gapGold,
 *         progress,
 *         claimedRecord: { gapGold, claimedAt } | null,
 *         viewsAtClaim, goldAtClaim, virtualWeeklyAtClaim, totalGoldForGuaranteeAtClaim  // 仅 CLAIMED 时有
 *       },
 *       ...
 *     ],
 *     // 兼容老字段：thresholdViews/thresholdGold/status/gapGold 等于"最后一段"的值
 *     thresholdViews, thresholdGold, status, gapGold,
 *     totalGoldForGuarantee,
 *     claimedRecord,  // 兼容老接口：最后一段的 claimedRecord
 *     _identity, _claimedMap
 *   }
 *
 * 关键口径（用户已拍板）：
 *   1) todayGoldReal 实时查 GoldLog 全部 sum（含已领段补贴金币，因为 claim 时写了 GoldLog）
 *   2) weeklyVirtualAddGold 周奖虚抵扣，所有段共用
 *   3) todayClaimedGapGold = sum(已领段的 gapGold)
 *      作用：避免重复计算（如果用户已领过第一段，totalGoldForGuarantee 不会再被减）
 *      但实际上 todayGoldReal 已包含已领段补贴，所以这里减一次是为了和"未领时的虚拟口径"对齐
 *      （现状 [welfareDailyGuaranteeCalc.js L255] 逻辑不变，只是改为多段累加）
 *   4) 每段独立判断：
 *      - needViews = todayViews < thresholdViews_stage
 *      - gapPreCheck = max(0, thresholdGold_stage - totalGoldForGuarantee)
 *      - status = CLAIMED | NOT_QUALIFIED | NO_GAP_FOUND | ELIGIBLE_TO_CLAIM
 *
 * ⚠️ 动态状态：第一段"可领窗口"会随用户继续看广告、金币上涨自动关闭
 *    （例如：用户看 2000 条 3万 时第一段可领，不领；看到 3000 条 9万 时第一段自动 NO_GAP_FOUND）
 */
async function computeDailyGuaranteeStatusMultiStage({ employeeId, userId }, config) {
  const dateStr = getBeijingDateString();
  const idObj = await resolveIdentity({ employeeId, userId });
  const [ stats, weekly, claimedDocs, effCfg ] = await Promise.all([
    getTodayStats(idObj.userId),
    getWeeklyVirtualAdd(idObj.userId, idObj.employeeId),
    getTodayClaimedRecords(idObj.employeeId, dateStr),
    config ? Promise.resolve(config) : getEffectiveConfig()
  ]);
  const useCfg = config || effCfg;
  // 配置兜底：必须含 stages 数组
  const stagesCfg = (Array.isArray(useCfg.stages) && useCfg.stages.length > 0)
    ? useCfg.stages
    : DEFAULT_CONFIG.stages;

  // 开关检查：如果 enabled=false，所有段返回 DISABLED 状态
  const enabled = useCfg.enabled !== false; // 默认 true，只有明确 false 才关闭

  // 已领段映射：stage → doc
  const claimedMap = new Map();
  for (const d of claimedDocs) {
    const st = Number(d.stage || 2);
    claimedMap.set(st, d);
  }
  // 已领段 gapGold 总和（用做 totalGoldForGuarantee 减项，避免重复算）
  //   注意：今天 todayGoldReal 已经包含了已领段的补贴金币（因为 claim 时写了 GoldLog）
  //   所以"本段检查时今日已领金币合计"应该是 todayGoldReal + weeklyVirtualAdd - 0
  //   而不是 todayGoldReal + weeklyVirtualAdd - todayClaimedGapGold
  //   下方两种实现等价：
  //     方式A: totalGoldForGuarantee = todayGoldReal + weeklyVirtualAdd - todayClaimedGapGold
  //            ✗ 错误，会少算已领段补贴（双扣）
  //     方式B: totalGoldForGuarantee = todayGoldReal + weeklyVirtualAdd
  //            ✓ 正确，已领段补贴在 todayGoldReal 里已经有了
  //   结论：方式 B 正确，和老 [L255] 逻辑等价（老逻辑里"单段保底已领"时 todayClaimedGapGold = claimed.gapGold，
  //         减掉之后总金币回到"不含已领段补贴"的口径，但因为老接口一旦 CLAIMED 就直接返回，gapGold 是 0，所以不影响）
  //         多段场景：第2段检查时第1段已经领了 → todayGoldReal 包含了第1段补贴 → 不能再减
  //         ✅ 这里采用"不减 todayClaimedGapGold"的实现（方式B）
  const totalGoldForGuarantee = stats.todayGoldReal + weekly.virtualAddGold;

  // 如果开关关闭，所有段返回 DISABLED
  if (!enabled) {
    const stagesResult = stagesCfg.map(stageCfg => ({
      stage: Number(stageCfg.stage),
      thresholdViews: Number(stageCfg.thresholdViews),
      thresholdGold: Number(stageCfg.thresholdGold),
      status: 'DISABLED',
      gapGold: 0,
      progress: 0,
      claimedRecord: null,
      viewsAtClaim: null,
      goldAtClaim: null,
      virtualWeeklyAtClaim: null,
      totalGoldForGuaranteeAtClaim: null
    }));

    return {
      employeeId: idObj.employeeId,
      date: dateStr,
      // 兼容老字段
      thresholdViews: stagesResult[stagesResult.length - 1].thresholdViews,
      thresholdGold:  stagesResult[stagesResult.length - 1].thresholdGold,
      status: 'DISABLED',
      gapGold: 0,
      todayViewsProgress: 0,
      totalGoldForGuarantee: Number(totalGoldForGuarantee.toFixed(2)),
      claimedRecord: null,

      // 新字段
      todayViews:    stats.todayViews,
      todayGoldReal: stats.todayGoldReal,
      weekly,
      stages: stagesResult,
      enabled: false,

      // 给 claim 接口用：避免重复查
      _identity: idObj,
      _claimedMap: claimedMap
    };
  }

  const stagesResult = stagesCfg.map(stageCfg => {
    const stage = Number(stageCfg.stage);
    const claimed = claimedMap.get(stage);
    const needViews = stats.todayViews < Number(stageCfg.thresholdViews);
    const gapPreCheck = Math.max(0, Number(stageCfg.thresholdGold) - totalGoldForGuarantee);

    let status;
    if (claimed) {
      status = 'CLAIMED';
    } else if (needViews) {
      status = 'NOT_QUALIFIED';
    } else if (gapPreCheck <= 0) {
      status = 'NO_GAP_FOUND';
    } else {
      status = 'ELIGIBLE_TO_CLAIM';
    }
    const gapGold = (status === 'ELIGIBLE_TO_CLAIM') ? gapPreCheck : 0;
    const progress = stageCfg.thresholdViews > 0
      ? Number((stats.todayViews / stageCfg.thresholdViews).toFixed(4))
      : 0;

    return {
      stage,
      thresholdViews: Number(stageCfg.thresholdViews),
      thresholdGold:  Number(stageCfg.thresholdGold),
      status,
      gapGold: Number(gapGold.toFixed(2)),
      progress,
      claimedRecord: claimed ? {
        gapGold:   Number(claimed.gapGold || 0),
        claimedAt: claimed.claimedAt
      } : null,
      // 仅 CLAIMED 时附带快照（便于审计/调试）
      viewsAtClaim:   claimed ? Number(claimed.viewsAtClaim || 0) : null,
      goldAtClaim:    claimed ? Number(claimed.goldAtClaim || 0) : null,
      virtualWeeklyAtClaim: claimed ? Number(claimed.virtualWeeklyAtClaim || 0) : null,
      totalGoldForGuaranteeAtClaim: claimed ? Number(claimed.totalGoldForGuaranteeAtClaim || 0) : null
    };
  });

  // 兼容老字段：取最后一段的值
  const lastStage = stagesResult[stagesResult.length - 1];

  return {
    employeeId: idObj.employeeId,
    date: dateStr,
    // 兼容老字段
    thresholdViews: lastStage.thresholdViews,
    thresholdGold:  lastStage.thresholdGold,
    status:         lastStage.status,
    gapGold:        lastStage.gapGold,
    todayViewsProgress: lastStage.progress,
    totalGoldForGuarantee: Number(totalGoldForGuarantee.toFixed(2)),
    claimedRecord: lastStage.claimedRecord,

    // 新字段
    todayViews:    stats.todayViews,
    todayGoldReal: stats.todayGoldReal,
    weekly,
    stages: stagesResult,
    enabled: true,

    // 给 claim 接口用：避免重复查
    _identity: idObj,
    _claimedMap: claimedMap
  };
}

module.exports = {
  DEFAULT_CONFIG,
  LEGACY_FALLBACK,
  getEffectiveConfig,
  saveAdminConfig,
  _refreshConfigCache,
  resolveIdentity,
  getCurrentWeek,
  getWeekRange,
  getTodayStats,
  getWeeklyVirtualAdd,
  getTodayClaimedRecord,
  getTodayClaimedRecords,
  computeDailyGuaranteeStatus,
  computeDailyGuaranteeStatusMultiStage
};
