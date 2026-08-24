const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const GoldLog = mongoose.models.GoldLog || require('../../models/GoldLog');
const UserGold = mongoose.models.UserGold || require('../../models/UserGold');
const Admin = mongoose.models.Admin || require('../../models/Admin');
const DailyGuaranteeRecord = mongoose.models.DailyGuaranteeRecord || require('../../models/DailyGuaranteeRecord');
const Employee = mongoose.models.Employee || require('../../models/Employee');
const { getBeijingDateString } = require('../../utils/date');
const authMiddleware = require('../../middleware/auth');
const {
  getEffectiveConfig,
  saveAdminConfig,
  resolveIdentity,
  computeDailyGuaranteeStatusMultiStage
} = require('../../utils/welfareDailyGuaranteeCalc');

const STATUS_CACHE_TTL = 60 * 1000; // 60 秒
// 员工端状态缓存：统一用 employeeId 作为主键
// - 单进程内存 Map（无 Redis 依赖，性能最优）
// - 60s 命中直接返回，彻底挡住高频轮询（前端可能每 30s 轮询一次，1000 人规模下可把 DB 压力降 98%）
// - POST /claim 成功后会清除对应员工缓存
const _statusCache = new Map();
function _statusCacheGet(key) {
  const entry = _statusCache.get(key);
  if (!entry) return null;
  if (entry.expireAt < Date.now()) { _statusCache.delete(key); return null; }
  return entry.value;
}
function _statusCacheSet(key, value, ttlMs) {
  _statusCache.set(key, { value, expireAt: Date.now() + ttlMs });
}
// 统一用 employeeId 作为缓存主键（DailyGuaranteeRecord 唯一索引用的就是 employeeId + dateStr）
// resolveIdentity 会把 employeeId / userId 两种入参都归一到同一个 employeeId，
// 这样同一用户不管用哪种参数查，缓存只有一份（避免两套缓存不同步）
function _statusCacheKey(identity) {
  const employeeId = typeof identity === 'string'
    ? identity
    : (identity && (identity.employeeId || (identity._identity && identity._identity.employeeId)) || '');
  return `welfare_daily_guarantee_status__eid:${employeeId}`;
}
function _clearStatusCache(identity) {
  const key = _statusCacheKey(identity);
  _statusCache.delete(key);
  // 兜底：清所有保底缓存（防止历史遗留 key）
  for (const k of Array.from(_statusCache.keys())) {
    if (k.startsWith('welfare_daily_guarantee_status__')) {
      _statusCache.delete(k);
    }
  }
}

// === 进程内 claim 串行锁（防止并发领两段时 race condition 多发金币）===
// 场景：用户同时点 stage1 + stage2 两个按钮 → 两个事务并发跑
//   如果不加锁：两个事务都看到 todayGoldReal=3万（初始值），stage1 补2万 + stage2 补7万 = 总补9万（多发2万）
//   加锁后：stage1 先完成 → GoldLog 写入+2万 → stage2 看到的是 todayGoldReal=5万 → gapGold=5万（正确）
// 仅单进程内有效；Node 应用是单进程，足够覆盖
const _claimInFlight = new Map();  // employeeId → Promise
async function _withClaimLock(employeeId, fn) {
  // 自旋等待前一个 claim 完成（最多 5 秒，超时则放弃锁直接执行）
  const startWait = Date.now();
  while (_claimInFlight.has(employeeId)) {
    if (Date.now() - startWait > 5000) break;
    await new Promise(r => setTimeout(r, 30));
  }
  const p = (async () => {
    try { return await fn(); }
    finally {
      // 只有当前 promise 是自己时才清，避免误清新来的请求
      if (_claimInFlight.get(employeeId) === p) {
        _claimInFlight.delete(employeeId);
      }
    }
  })();
  _claimInFlight.set(employeeId, p);
  return p;
}

// ===== 管理员权限：角色归一化（兼容现网混用多种写法）=====
//   - superadmin / SUPERADMIN / SUPER_ADMIN → 全部视为超管
//   - ADMIN_MANAGER → 也算超管（现网 admin002 / admin003 这种中间账号）
//   - FINANCE / finance → 财务
//   - GROUP_LEADER / NORMAL_ADMIN / TEAM_LEADER → 团队角色

function _normRole(admin) {
  if (!admin) return '';
  const r = String(admin.role || '').trim().toUpperCase();
  if (!r) return '';
  if (r === 'SUPER_ADMIN' || r === 'SUPERADMIN') return 'SUPER_ADMIN';
  if (r === 'ADMIN_MANAGER') return 'SUPER_ADMIN'; // 现网中间管理账号按超管处理
  if (r === 'FINANCE') return 'FINANCE';
  if (r === 'GROUP_LEADER') return 'GROUP_LEADER';
  if (r === 'TEAM_LEADER') return 'TEAM_LEADER';
  if (r === 'NORMAL_ADMIN') return 'NORMAL_ADMIN';
  return r;
}

async function _isPrivilegedAdmin(admin) {
  if (!admin) return false;
  const role = _normRole(admin);
  return (
    role === 'SUPER_ADMIN' ||
    role === 'FINANCE' ||
    role === 'TEAM_LEADER' ||
    role === 'GROUP_LEADER' ||
    role === 'NORMAL_ADMIN'
  );
}

function _isSuperOrFinance(admin) {
  if (!admin) return false;
  const role = _normRole(admin);
  return role === 'SUPER_ADMIN' || role === 'FINANCE';
}
/**
 * _adminScope：和 dashboard.js L83-103（KPI 接口）的身份判断 100% 对齐，避免越权或漏看
 * 优先级：
 *   SUPER_ADMIN / FINANCE → ALL
 *   role=GROUP_LEADER    → GL（按 teamGroupId 过滤本组）
 *   role=NORMAL_ADMIN 且有 teamName → 优先走 TL（看整个团队，即使有 teamGroupId 也不切 GL，和 TL 登录数据看板一致）
 *   role=NORMAL_ADMIN 无 teamName 但有 teamGroupId → GL
 *   其他 → NONE
 */
async function _adminScope(admin) {
  const role = _normRole(admin);
  const isSuper = (role === 'SUPER_ADMIN' || role === 'FINANCE');
  if (isSuper) return { kind: 'ALL' };
  const isGlByRole = (role === 'GROUP_LEADER');
  const hasTeamName = !!(admin.teamName && String(admin.teamName).trim());
  if (isGlByRole) {
    const tgid = String(admin.teamGroupId || '').trim();
    if (!tgid) return { kind: 'NONE' };
    const employees = await Employee.find({ teamGroupId: tgid }).select('employeeId').lean();
    return { kind: 'GL', employeeIds: employees.map(e => String(e.employeeId)) };
  }
  if (hasTeamName) {
    // NORMAL_ADMIN 有 teamName → TL 身份，看整个团队（不要被 teamGroupId 带偏，和 dashboard 一致）
    const teamName = String(admin.teamName).trim();
    const employees = await Employee.find({ teamName }).select('employeeId').lean();
    return { kind: 'TL', employeeIds: employees.map(e => String(e.employeeId)) };
  }
  if (admin.teamGroupId) {
    const tgid = String(admin.teamGroupId).trim();
    const employees = await Employee.find({ teamGroupId: tgid }).select('employeeId').lean();
    return { kind: 'GL', employeeIds: employees.map(e => String(e.employeeId)) };
  }
  return { kind: 'NONE' };
}

/**
 * GET /status
 *   员工端轮询今日礼包状态，兼容两种参数：
 *   ?employeeId=8300      （和员工端主 token 对齐）
 *   ?userId=user_xxx      （和前端 /api/gold/today-stats?userId= 对齐）
 *   60s 内缓存；POST /claim 成功后会清除缓存
 *
 * 返回里同时包含：
 *   - 兼容老字段：thresholdViews/thresholdGold/status/gapGold 等（等于最后一段的值）
 *   - 新字段 stages: [{stage, thresholdViews, thresholdGold, status, gapGold, progress, claimedRecord}, ...]
 *   老前端读老字段不受影响；新前端读 stages 渲染多段礼包
 */
router.get('/status', async (req, res) => {
  try {
    const employeeIdParam = String(req.query.employeeId || '').trim();
    const userIdParam     = String(req.query.userId     || '').trim();
    if (!employeeIdParam && !userIdParam) {
      return res.status(400).json({ success: false, message: '缺少 employeeId 或 userId' });
    }
    // 1) 先 resolveIdentity：employeeId / userId 两种入参都归一化为同一个标准身份，
    //    这样 cacheKey 也只有一份，避免同一用户两套缓存不同步
    const idObj = await resolveIdentity({ employeeId: employeeIdParam, userId: userIdParam });
    const cacheKey = _statusCacheKey(idObj);
    const cached = _statusCacheGet(cacheKey);
    if (cached) {
      return res.json({ success: true, ...cached });
    }
    const st = await computeDailyGuaranteeStatusMultiStage({ employeeId: idObj.employeeId, userId: idObj.userId });
    const payload = {
      // === 新字段（二段保底）===
      enabled: st.enabled !== false,
      stages: st.stages.map(s => ({
        stage:            s.stage,
        thresholdViews:   s.thresholdViews,
        thresholdGold:    s.thresholdGold,
        status:           s.status,
        gapGold:          s.gapGold,
        progress:         s.progress,
        claimedRecord:    s.claimedRecord
      })),

      // === 兼容老字段（取最后一段的值，老前端无需改动）===
      date:                st.date,
      thresholdViews:      st.thresholdViews,
      thresholdGold:       st.thresholdGold,
      todayViews:          st.todayViews,
      todayViewsProgress:  st.todayViewsProgress,
      todayGoldReal:       st.todayGoldReal,
      weeklyVirtualGold:   st.weekly.virtualAddGold,
      totalGoldForGuarantee: st.totalGoldForGuarantee,
      gapGold:             st.gapGold,
      status:              st.status,
      claimedRecord:       st.claimedRecord,
      weekly: {
        week:            st.weekly.week,
        targetCount:     st.weekly.targetCount,
        currentCount:    st.weekly.currentCount,
        bonusGold:       st.weekly.bonusGold,
        isQualified:     st.weekly.isQualified,
        isClaimed:       st.weekly.isClaimed,
        virtualAddGold:  st.weekly.virtualAddGold
      }
    };
    _statusCacheSet(cacheKey, payload, STATUS_CACHE_TTL);
    return res.json({ success: true, ...payload });
  } catch (err) {
    console.error('[daily-guarantee status]', err);
    if (err && err.message === 'USERGOLD_NOT_FOUND') {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }
    return res.status(500).json({ success: false, message: err.message || '服务错误' });
  }
});

/**
 * POST /claim
 *   领取今日保底礼包（authMiddleware 员工 token）—— 二段保底版
 *   - Body 参数：
 *       stage: 1 或 2（必填；1=第一段5万, 2=第二段10万）
 *       若不传或传入非 1/2 的值，默认 stage=2（兼容老前端单段调用）
 *   - 幂等：复合唯一索引 (employeeId, dateStr, stage)，同一天同段重复领直接返回已领记录
 *   - 实时重算：每次领之前重新走 computeDailyGuaranteeStatusMultiStage，拒绝条件未满足的情况
 *   - 落库 3 份：DailyGuaranteeRecord（含 stage）、GoldLog(type=daily_guarantee_stage{N})、UserGold.currentMonthGold += gapGold
 *   - GoldLog 写入后 todayGoldReal 实时累加，下一段检查时口径自动包含已领段补贴
 */
router.post('/claim', authMiddleware, async (req, res) => {
  const { username } = req.user || {};
  const employeeId = String(username || '').trim();
  if (!employeeId) {
    return res.status(401).json({ success: false, message: '认证缺失 employeeId' });
  }
  // 解析 stage：1 或 2，默认 2（兼容老前端）
  let stage = Number(req.body && req.body.stage);
  if (stage !== 1 && stage !== 2) stage = 2;

  // 用进程内串行锁包整个事务，防止并发领两段时 race condition 多发金币
  //   并发场景：用户同时点 stage1 + stage2 两个按钮 → 两个事务串行执行，
  //   stage1 先完成（GoldLog +2万）→ stage2 看到的是 todayGoldReal=5万 → gapGold=5万（正确）
  try {
    const result = await _withClaimLock(employeeId, async () => {
      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        const idObj = await resolveIdentity({ employeeId });
        const dateStr = getBeijingDateString();

        // 实时重算（不用缓存，确保口径最新）
        const st = await computeDailyGuaranteeStatusMultiStage({ employeeId, userId: idObj.userId });

        // 找到对应 stage 的状态
        const stageInfo = st.stages.find(s => s.stage === stage);
        if (!stageInfo) {
          await session.abortTransaction();
          session.endSession();
          return { code: 400, body: { success: false, message: `stage ${stage} 不存在` } };
        }

        // 0 领取场景：已领
        if (stageInfo.status === 'CLAIMED') {
          await session.abortTransaction();
          session.endSession();
          return { code: 200, body: {
            success: true,
            message: `今日第 ${stage} 段保底礼包已领取`,
            alreadyClaimed: true,
            stage,
            date: dateStr,
            gapGold: stageInfo.claimedRecord ? stageInfo.claimedRecord.gapGold : 0,
            claimedAt: stageInfo.claimedRecord ? stageInfo.claimedRecord.claimedAt : null,
            viewsAtClaim: stageInfo.viewsAtClaim,
            goldAtClaim:  stageInfo.goldAtClaim
          }};
        }
        // 0 领取场景：保底福袋已关闭
        if (stageInfo.status === 'DISABLED') {
          await session.abortTransaction();
          session.endSession();
          return { code: 400, body: {
            success: false,
            message: '保底福袋功能已关闭，请联系管理员'
          }};
        }
        // 0 领取场景：未达标
        if (stageInfo.status === 'NOT_QUALIFIED') {
          await session.abortTransaction();
          session.endSession();
          return { code: 400, body: {
            success: false,
            message: `未达到第 ${stage} 段 ${stageInfo.thresholdViews} 条保底门槛，当前 ${st.todayViews} 条`
          }};
        }
        // 0 领取场景：金币已超阈值
        if (stageInfo.status === 'NO_GAP_FOUND') {
          await session.abortTransaction();
          session.endSession();
          return { code: 400, body: {
            success: false,
            message: `第 ${stage} 段保底线上金币已达 ${st.totalGoldForGuarantee}，无需补差`
          }};
        }
        // 仅 ELIGIBLE_TO_CLAIM 状态继续
        const gapGold = Math.floor(Number(stageInfo.gapGold));
        if (gapGold <= 0) {
          await session.abortTransaction();
          session.endSession();
          return { code: 400, body: { success: false, message: '补差金币为 0，无需领取' } };
        }

        // 1) 写 DailyGuaranteeRecord（带 stage）
        let record;
        try {
          [record] = await DailyGuaranteeRecord.create([{
            employeeId: idObj.employeeId,
            userId:     idObj.userId,
            dateStr,
            stage,
            thresholdViews: stageInfo.thresholdViews,
            thresholdGold:  stageInfo.thresholdGold,
            viewsAtClaim:   st.todayViews,
            goldAtClaim:    st.todayGoldReal,
            virtualWeeklyAtClaim: st.weekly.virtualAddGold,
            totalGoldForGuaranteeAtClaim: st.totalGoldForGuarantee,
            gapGold,
            claimedAt: new Date()
          }], { session });
        } catch (err) {
          if (err && (err.code === 11000 || (err.codeName && err.codeName.includes('DuplicateKey')))) {
            await session.abortTransaction();
            session.endSession();
            const dup = await DailyGuaranteeRecord.findOne({ employeeId, dateStr, stage }).lean();
            _clearStatusCache({ employeeId, userId: idObj.userId });
            return { code: 200, body: {
              success: true,
              message: `今日第 ${stage} 段保底礼包已领取`,
              alreadyClaimed: true,
              stage,
              date: dateStr,
              gapGold: dup ? Number(dup.gapGold) : 0,
              claimedAt: dup ? dup.claimedAt : null
            }};
          }
          throw err;
        }

        // 2) 写 GoldLog（type=daily_guarantee_stage{N}，1 条，金币 gapGold）
        await GoldLog.create([{
          userId: idObj.userId,
          employeeId: idObj.employeeId,
          platform: 'system',
          adType:   'welfare',
          type:     `daily_guarantee_stage${stage}`,
          gold:     gapGold,
          createTime: new Date()
        }], { session });

        // 3) 更新 UserGold.currentMonthGold
        const up = await UserGold.updateOne(
          { employeeId: idObj.employeeId },
          { $inc: { currentMonthGold: gapGold } },
          { session }
        );
        if (!up || up.matchedCount !== 1) {
          throw new Error('UserGold update failed');
        }

        await session.commitTransaction();
        session.endSession();

        // 4) 清缓存，保证下次 /status 立即看到 CLAIMED
        _clearStatusCache({ employeeId, userId: idObj.userId });

        return { code: 200, body: {
          success: true,
          stage,
          date: dateStr,
          gapGold,
          claimedAt: record.claimedAt,
          viewsAtClaim:   st.todayViews,
          goldAtClaim:    st.todayGoldReal,
          weeklyVirtualGold: st.weekly.virtualAddGold,
          totalGoldForGuaranteeBefore: st.totalGoldForGuarantee
        }};
      } catch (err) {
        try { await session.abortTransaction(); } catch (_) {}
        try { session.endSession(); } catch (_) {}
        throw err;
      }
    });
    return res.status(result.code).json(result.body);
  } catch (err) {
    console.error('[daily-guarantee claim]', err);
    return res.status(500).json({ success: false, message: err.message || '领取失败' });
  }
});

/**
 * GET /overview
 *   管理员端：某天的保底礼包发放统计（需要管理员 token）—— 二段保底版
 *   参数：?date=20260821（默认今天）
 *   返回里包含：
 *     - 总统计（兼容老前端）
 *     - stages: [{stage, totalClaimedCount, totalClaimedGold, totalViewsSnapshot}, ...]（按段分组）
 */
router.get('/overview', authMiddleware, async (req, res) => {
  try {
    const admin = await Admin.findOne({ username: (req.user && req.user.username) || '' }).lean();
    if (!(await _isPrivilegedAdmin(admin))) {
      return res.status(403).json({ success: false, message: '无权限' });
    }
    const dateStr = String(req.query.date || getBeijingDateString()).trim();
    const scope = await _adminScope(admin);
    if (scope.kind === 'NONE') {
      return res.json({
        success: true,
        date: dateStr,
        totalClaimedCount: 0,
        totalClaimedGold:  0,
        totalViewsSnapshot: 0,
        stages: [],
        topClaims: [],
        scope: 'NONE'
      });
    }
    const match = { dateStr };
    if (scope.kind !== 'ALL') {
      match.employeeId = { $in: scope.employeeIds };
    }
    const agg = await DailyGuaranteeRecord.aggregate([
      { $match: match },
      { $facet: {
          stats: [
            { $group: {
                _id: null,
                totalClaimedCount:  { $sum: 1 },
                totalClaimedGold:   { $sum: '$gapGold' },
                totalViewsSnapshot: { $sum: '$viewsAtClaim' }
            }}
          ],
          // 按段分组统计（新增）
          stagesStats: [
            { $group: {
                _id: { $ifNull: ['$stage', 2] },  // 老数据没 stage 字段，视为 stage=2
                totalClaimedCount:  { $sum: 1 },
                totalClaimedGold:   { $sum: '$gapGold' },
                totalViewsSnapshot: { $sum: '$viewsAtClaim' }
            }},
            { $sort: { _id: 1 } },
            { $project: {
                _id: 0,
                stage:               '$_id',
                totalClaimedCount:   1,
                totalClaimedGold:    1,
                totalViewsSnapshot:  1
            }}
          ],
          top: [
            { $sort: { claimedAt: -1 } },
            { $limit: 50 },
            { $project: {
                _id: 0,
                employeeId: 1,
                dateStr: 1,
                stage: { $ifNull: ['$stage', 2] },  // ✅ 新增 stage 字段
                gapGold: 1,
                viewsAtClaim: 1,
                goldAtClaim: 1,
                virtualWeeklyAtClaim: 1,
                claimedAt: 1
            }}
          ]
      }}
    ]);
    const stats = (agg[0].stats && agg[0].stats[0]) || { totalClaimedCount: 0, totalClaimedGold: 0, totalViewsSnapshot: 0 };
    return res.json({
      success: true,
      date: dateStr,
      scope: scope.kind,
      // 兼容老字段
      totalClaimedCount: stats.totalClaimedCount || 0,
      totalClaimedGold:  Number(stats.totalClaimedGold || 0),
      totalViewsSnapshot: stats.totalViewsSnapshot || 0,
      // 新字段：按段分组
      stages: agg[0].stagesStats || [],
      topClaims: (agg[0].top || []).map(r => ({ ...r, stage: r.stage || 2 }))
    });
  } catch (err) {
    console.error('[daily-guarantee overview]', err);
    return res.status(500).json({ success: false, message: err.message || '服务错误' });
  }
});

// ========== 管理员：保底配置 ==========

/**
 * GET /config
 *   管理员（所有有权限角色可读）：当前生效的保底配置 + 实际生效来源（DB / DEFAULT / pending）—— 二段保底版
 *   返回：
 *     - 兼容老字段：thresholdViews / thresholdGold（等于最后一段的值）
 *     - 新字段 stages: [{stage, thresholdViews, thresholdGold}, ...]
 */
router.get('/config', authMiddleware, async (req, res) => {
  try {
    const admin = await Admin.findOne({ username: (req.user && req.user.username) || '' }).lean();
    if (!(await _isPrivilegedAdmin(admin))) {
      return res.status(403).json({ success: false, message: '无权限' });
    }
    const eff = await getEffectiveConfig();
    return res.json({
      success: true,
      // 开关状态
      enabled: eff.enabled !== false,
      // 新字段
      stages: eff.stages || [],
      // 兼容老字段
      thresholdViews: eff.thresholdViews,
      thresholdGold:  eff.thresholdGold,
      source: eff._meta ? eff._meta.source : 'DEFAULT',
      effectiveFromDateStr: eff._meta ? eff._meta.effectiveFrom : '',
      updatedAt: eff._meta ? eff._meta.updatedAt : null,
      updatedBy: eff._meta ? eff._meta.updatedBy : '',
      remark:    eff._meta ? eff._meta.remark : ''
    });
  } catch (err) {
    console.error('[daily-guarantee config GET]', err);
    return res.status(500).json({ success: false, message: err.message || '服务错误' });
  }
});

/**
 * POST /config
 *   超管/财务：保存保底配置 —— 二段保底版
 *   Body（可选 enabled 字段）:
 *     enabled: true/false (optional)
 *     方式1（推荐）:
 *       stages: [
 *         { stage: 1, thresholdViews: 2000, thresholdGold: 50000 },
 *         { stage: 2, thresholdViews: 3000, thresholdGold: 100000 }
 *       ]
 *     方式2（兼容老前端）:
 *       thresholdViews       (Number, required, >=1)
 *       thresholdGold        (Number, required, >=1)
 *     通用可选:
 *       effectiveFromDateStr (String, optional, YYYY-MM-DD。留空=立即生效)
 *       remark               (String, optional, 备注)
 *   写完后清本地 status 缓存前缀（避免老缓存影响展示）
 */
router.post('/config', authMiddleware, async (req, res) => {
  try {
    const admin = await Admin.findOne({ username: (req.user && req.user.username) || '' }).lean();
    if (!_isSuperOrFinance(admin)) {
      return res.status(403).json({ success: false, message: '仅超管/财务可修改配置' });
    }
    const body = req.body || {};

    // 校验 stages 或老字段
    const hasStages = Array.isArray(body.stages) && body.stages.length > 0;
    const hasOldFields = body.thresholdViews !== undefined && body.thresholdGold !== undefined;

    if (!hasStages && !hasOldFields) {
      // 如果没传 stages/老字段，但传了 enabled，允许只更新 enabled
      if (body.enabled === undefined) {
        return res.status(400).json({
          success: false,
          message: '必须提供 stages 数组、(thresholdViews + thresholdGold)、或 enabled'
        });
      }
    }

    // 兼容老字段：单段保底视为 stage=2
    if (!hasStages && hasOldFields) {
      const tv = Number(body.thresholdViews);
      const tg = Number(body.thresholdGold);
      if (!(tv >= 1) || !(tg >= 1)) {
        return res.status(400).json({ success: false, message: '条数和金额必须 ≥ 1' });
      }
      body.stages = [{ stage: 2, thresholdViews: tv, thresholdGold: tg }];
    }

    let effectiveFromDateStr = String(body.effectiveFromDateStr || '').trim();
    if (effectiveFromDateStr) {
      // 兼容 YYYYMMDD → YYYY-MM-DD
      if (/^\d{8}$/.test(effectiveFromDateStr)) {
        effectiveFromDateStr = `${effectiveFromDateStr.slice(0,4)}-${effectiveFromDateStr.slice(4,6)}-${effectiveFromDateStr.slice(6,8)}`;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFromDateStr)) {
        return res.status(400).json({ success: false, message: 'effectiveFromDateStr 格式 YYYY-MM-DD 或 YYYYMMDD' });
      }
    }

    // 处理 enabled 字段
    let enabled = undefined;
    if (body.enabled !== undefined && body.enabled !== null) {
      enabled = !!body.enabled;
    }

    const doc = await saveAdminConfig({
      stages: body.stages,
      effectiveFromDateStr,
      updatedBy: admin.username || String(admin._id || ''),
      remark: String(body.remark || ''),
      enabled
    });
    // 把 status 缓存全清，确保新阈值立即生效
    for (const k of Array.from(_statusCache.keys())) {
      if (k.startsWith('welfare_daily_guarantee_status__')) {
        _statusCache.delete(k);
      }
    }
    return res.json({
      success: true,
      message: '已保存',
      enabled: doc.enabled !== false,
      stages: doc.stages || [],
      // 兼容老字段
      thresholdViews: doc.thresholdViews,
      thresholdGold:  doc.thresholdGold,
      effectiveFromDateStr: doc.effectiveFromDateStr || '',
      updatedAt: doc.updatedAt,
      updatedBy: doc.updatedBy,
      remark: doc.remark || ''
    });
  } catch (err) {
    console.error('[daily-guarantee config POST]', err);
    return res.status(500).json({ success: false, message: err.message || '保存失败' });
  }
});

/**
 * PATCH /config/enabled
 *   超管/财务：快速切换保底福袋开关（on/off）
 *   Body:
 *     enabled: true 或 false
 *     remark: 可选备注
 */
router.patch('/config/enabled', authMiddleware, async (req, res) => {
  try {
    const admin = await Admin.findOne({ username: (req.user && req.user.username) || '' }).lean();
    if (!_isSuperOrFinance(admin)) {
      return res.status(403).json({ success: false, message: '仅超管/财务可修改开关' });
    }
    const body = req.body || {};
    if (body.enabled === undefined || body.enabled === null) {
      return res.status(400).json({ success: false, message: '必须提供 enabled 字段（true 或 false）' });
    }

    const enabled = !!body.enabled;
    const doc = await saveAdminConfig({
      updatedBy: admin.username || String(admin._id || ''),
      remark: String(body.remark || ''),
      enabled
    });

    // 把 status 缓存全清，确保开关状态立即生效
    for (const k of Array.from(_statusCache.keys())) {
      if (k.startsWith('welfare_daily_guarantee_status__')) {
        _statusCache.delete(k);
      }
    }

    return res.json({
      success: true,
      message: enabled ? '保底福袋已开启' : '保底福袋已关闭',
      enabled: doc.enabled !== false,
      updatedAt: doc.updatedAt
    });
  } catch (err) {
    console.error('[daily-guarantee config PATCH enabled]', err);
    return res.status(500).json({ success: false, message: err.message || '操作失败' });
  }
});

// ========== 管理员：领取历史记录（分页 + 筛选） ==========

/**
 * 日期字符串归一化：兼容 YYYYMMDD → YYYY-MM-DD（后端唯一格式）
 */
function _normDateStr(s) {
  if (!s) return '';
  const x = String(s).trim();
  if (/^\d{8}$/.test(x)) return `${x.slice(0,4)}-${x.slice(4,6)}-${x.slice(6,8)}`;
  return x;
}

/**
 * GET /claims
 *   管理员：保底礼包领取历史（分页 + 多条件筛选，scope 权限与 overview 完全一致）—— 二段保底版
 *   Query 参数：
 *     date          单个日期（YYYY-MM-DD 或 YYYYMMDD），优先级高于 range
 *     dateFrom      起始日期（含）
 *     dateTo        结束日期（含）
 *     employeeId    精确匹配员工号
 *     stage         段位筛选：1 或 2（不传=全部段位）
 *     minGapGold    最小补差金币（含）
 *     maxGapGold    最大补差金币（含）
 *     page          页码（默认 1）
 *     pageSize      每页条数（默认 20，最大 200）
 *     sortBy        'claimedAt' | 'gapGold' | 'dateStr'（默认 claimedAt）
 *     sortOrder     'desc' | 'asc'（默认 desc）
 *
 *   返回：{ list, pagination, summary }
 *     list 每条记录带 Employee.name / teamName / groupName / stage（若能查到）
 */
router.get('/claims', authMiddleware, async (req, res) => {
  try {
    const admin = await Admin.findOne({ username: (req.user && req.user.username) || '' }).lean();
    if (!(await _isPrivilegedAdmin(admin))) {
      return res.status(403).json({ success: false, message: '无权限' });
    }
    const scope = await _adminScope(admin);
    if (scope.kind === 'NONE') {
      return res.json({
        success: true,
        list: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
        summary: { totalClaimedCount: 0, totalClaimedGold: 0 }
      });
    }

    // 1) 解析筛选条件
    const q = req.query || {};
    const date          = _normDateStr(q.date);
    let dateFrom = _normDateStr(q.dateFrom);
    let dateTo   = _normDateStr(q.dateTo);
    if (date) {
      dateFrom = date;
      dateTo   = date;
    }
    const employeeId = String(q.employeeId || '').trim();
    const minGapGold = q.minGapGold === undefined || q.minGapGold === '' ? null : Number(q.minGapGold);
    const maxGapGold = q.maxGapGold === undefined || q.maxGapGold === '' ? null : Number(q.maxGapGold);
    // ✅ 新增：段位筛选
    let stageFilter = null;
    if (q.stage !== undefined && q.stage !== '') {
      const sn = Number(q.stage);
      if (sn === 1 || sn === 2) stageFilter = sn;
    }

    const page = Math.max(1, parseInt(q.page, 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(q.pageSize, 10) || 20));
    const sortBy    = (q.sortBy === 'gapGold' || q.sortBy === 'dateStr') ? q.sortBy : 'claimedAt';
    const sortOrder = q.sortOrder === 'asc' ? 1 : -1;

    // 2) 构造 mongo $match
    const match = {};
    if (scope.kind !== 'ALL') {
      match.employeeId = { $in: scope.employeeIds };
    }
    if (stageFilter !== null) {
      match.stage = stageFilter;
    }
    if (employeeId) {
      if (scope.kind !== 'ALL') {
        // 管理员想查某人，但某人不在其 scope 内 → 直接返回空（避免越权）
        if (!scope.employeeIds.includes(employeeId)) {
          return res.json({
            success: true,
            list: [],
            pagination: { page, pageSize, total: 0, totalPages: 0 },
            summary: { totalClaimedCount: 0, totalClaimedGold: 0 },
            _scopeWarning: employeeId ? '员工不在该管理员权限范围内' : undefined
          });
        }
      }
      match.employeeId = employeeId;
    }
    if (dateFrom && dateTo) {
      match.dateStr = { $gte: dateFrom, $lte: dateTo };
    } else if (dateFrom) {
      match.dateStr = { $gte: dateFrom };
    } else if (dateTo) {
      match.dateStr = { $lte: dateTo };
    }
    if (minGapGold !== null || maxGapGold !== null) {
      match.gapGold = {};
      if (minGapGold !== null) match.gapGold.$gte = minGapGold;
      if (maxGapGold !== null) match.gapGold.$lte = maxGapGold;
    }

    // 3) 并行：分页 list + 总数 + 汇总（gold sum）
    const cursor = DailyGuaranteeRecord.aggregate();
    cursor.match(match);
    // facet 三个桶：分页 list / total / summary
    cursor.append({
      $facet: {
        total:   [{ $count: 'count' }],
        summary: [{ $group: { _id: null, totalClaimedGold: { $sum: '$gapGold' } } }],
        list:    [
          { $sort: { [sortBy]: sortOrder, _id: -1 } },
          { $skip: (page - 1) * pageSize },
          { $limit: pageSize },
          { $project: {
              _id: 0,
              employeeId: 1,
              userId: 1,
              dateStr: 1,
              stage: { $ifNull: ['$stage', 2] },  // ✅ 新增 stage 字段，老数据兜底 2
              thresholdViews: 1,
              thresholdGold: 1,
              viewsAtClaim: 1,
              goldAtClaim: 1,
              virtualWeeklyAtClaim: 1,
              totalGoldForGuaranteeAtClaim: 1,
              gapGold: 1,
              claimedAt: 1
          }}
        ]
      }
    });
    const facetRes = await cursor.exec();
    const facet = (facetRes && facetRes[0]) || { total: [], summary: [], list: [] };
    const total = (facet.total && facet.total[0] && facet.total[0].count) || 0;
    const totalClaimedGold = Number((facet.summary && facet.summary[0] && facet.summary[0].totalClaimedGold) || 0);
    const list = facet.list || [];

    // 4) 把员工姓名/团队信息拼进去（批量查一次 Employee）
    if (list.length) {
      const eids = [...new Set(list.map(r => r.employeeId).filter(Boolean))];
      if (eids.length) {
        const empMap = new Map();
        const emps = await Employee.find({ employeeId: { $in: eids } })
          .select('employeeId name teamName groupName phone username').lean();
        emps.forEach(e => empMap.set(String(e.employeeId), e));
        for (const r of list) {
          const e = empMap.get(String(r.employeeId));
          r.employee = e ? {
            name:     e.name || '',
            phone:    e.phone || '',
            username: e.username || '',
            teamName: e.teamName || '',
            groupName:e.groupName || ''
          } : null;
        }
      }
    }

    const totalPages = Math.ceil(total / pageSize) || 0;
    return res.json({
      success: true,
      list,
      pagination: {
        page,
        pageSize,
        total,
        totalPages
      },
      summary: {
        totalClaimedCount: total,
        totalClaimedGold
      },
      scope: scope.kind
    });
  } catch (err) {
    console.error('[daily-guarantee claims]', err);
    return res.status(500).json({ success: false, message: err.message || '服务错误' });
  }
});

module.exports = router;