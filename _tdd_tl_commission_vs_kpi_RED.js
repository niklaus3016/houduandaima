// ============================================================
// RED 对账：cuiding 视角下
//   A) /team-leader/commission 接口当前算法的 today/month/...
//   B) computeNewKpi (KPI接口权威) teamCommission today/month/...
// 逐字段对比，找出哪里口径不一致
// ============================================================
const mongoose = require('mongoose');
require('./models/Admin');
require('./models/Employee');
require('./models/TeamGroup');
require('./models/GoldLog');
require('./models/TeamLeaderLevelConfig');
const MONGO = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

// 直接 require dashboard router → 拿到 computeNewKpi + 工具函数
const dashboardRouter = require('./routes/dashboard');

const RANGES = ['today', 'yesterday', 'week', 'month', 'lastMonth'];

// ============================================================
// 方式B：KPI 权威 → computeNewKpi → teamCommission
// ============================================================
async function kpiAuthority(tlAdminId) {
  const scope = { kind: 'TL', adminId: String(tlAdminId) };
  const out = {};
  for (const r of RANGES) {
    const res = await dashboardRouter.computeNewKpi(scope, r);
    out[r] = +res.teamCommission || 0;
  }
  return out;
}

// ============================================================
// 方式A：旧 /team-leader/commission 接口算法（完全抄 dashboard.js L1823-L2045）
//   → 复制原有逻辑，保证 1:1
// ============================================================
function getBeijingDate() {
  const d = new Date();
  return new Date(d.getTime() + 8 * 3600 * 1000);
}
function getUTCDate() { return new Date(); }

async function tlCommissionLegacy(currentAdminRaw) {
  const Admin    = mongoose.model('Admin');
  const Employee = mongoose.model('Employee');
  const TeamGroup= mongoose.model('TeamGroup');
  const GoldLog  = mongoose.model('GoldLog');
  const currentAdmin = currentAdminRaw; // 已是 doc-like lean 对象，含 _id/teamName

  // 直属员工 parentId = currentAdmin._id
  const employees = await Employee.find({ parentId: currentAdmin._id.toString() });
  const employeeIds = employees.map(e => e.employeeId);

  // 下属 TL 直属 D parentTlCommissionRate 贡献
  let subTlDirectEmpIds = [];
  try {
    const subordinateTls = await Admin.find({
      parentTlId: currentAdmin._id.toString(),
      role: { $in: ['NORMAL_ADMIN', 'normal_admin'] }
    }).select('_id').lean().exec();
    const subTlIds = subordinateTls.map(t => t._id.toString());
    if (subTlIds.length) {
      const subTlDirectEmps = await Employee.find({
        parentId: { $in: subTlIds },
        $or: [{ teamGroupId: null }, { teamGroupId: '' }, { teamGroupId: { $exists: false } }]
      }).select('employeeId parentId').lean().exec();
      subTlDirectEmpIds = subTlDirectEmps.map(e => e.employeeId).filter(Boolean);
    }
  } catch (_) { subTlDirectEmpIds = []; }
  const calcSubTlContribution = async (start, end) => {
    if (!subTlDirectEmpIds.length) return 0;
    const match = { employeeId: { $in: subTlDirectEmpIds }, createTime: { $gte: start } };
    if (end) match.createTime.$lt = end;
    const rateExpr = {
      $cond: [
        { $and: [
          { $gt:  [ { $ifNull: ['$parentTlCommissionRate', 0] }, 0 ] },
          { $lte: [ { $ifNull: ['$parentTlCommissionRate', 0] }, 1 ] }
        ] },
        '$parentTlCommissionRate',
        0
      ]
    };
    const [agg] = await GoldLog.aggregate([
      { $match: match },
      { $group: { _id: null, total: { $sum: { $multiply: ['$gold', rateExpr] } } } }
    ]).exec();
    return +((agg?.total || 0) / 1000);
  };

  // 战队 groups（按 teamName 找）
  const groups = await TeamGroup.find({ teamName: currentAdmin.teamName });

  // 时间计算（L1901-L1941 一字不差复制）
  const beijingNow = getBeijingDate();
  const now = getUTCDate();
  const todayStartBeijing = new Date(beijingNow);
  todayStartBeijing.setUTCHours(0, 0, 0, 0);
  const todayStart = new Date(todayStartBeijing.getTime() - 8 * 60 * 60 * 1000);
  const todayEnd = new Date(beijingNow.getTime() + 8 * 60 * 60 * 1000);
  const yesterdayStartBeijing = new Date(beijingNow);
  yesterdayStartBeijing.setUTCDate(yesterdayStartBeijing.getUTCDate() - 1);
  yesterdayStartBeijing.setUTCHours(0, 0, 0, 0);
  const yesterdayStart = new Date(yesterdayStartBeijing.getTime() - 8 * 60 * 60 * 1000);
  const yesterdayEnd = todayStart;
  const dayOfWeek = beijingNow.getUTCDay() || 7;
  const daysToMonday = dayOfWeek - 1;
  const mondayBeijing = new Date(beijingNow);
  mondayBeijing.setUTCDate(beijingNow.getUTCDate() - daysToMonday);
  mondayBeijing.setUTCHours(0, 0, 0, 0);
  const weekStart = new Date(mondayBeijing.getTime() - 8 * 60 * 60 * 1000);
  const monthStartBeijing = new Date(beijingNow);
  monthStartBeijing.setUTCDate(1);
  monthStartBeijing.setUTCHours(0, 0, 0, 0);
  const monthStart = new Date(monthStartBeijing.getTime() - 8 * 60 * 60 * 1000);
  const lastMonthStartBeijing = new Date(beijingNow);
  lastMonthStartBeijing.setUTCMonth(lastMonthStartBeijing.getUTCMonth() - 1);
  lastMonthStartBeijing.setUTCDate(1);
  lastMonthStartBeijing.setUTCHours(0, 0, 0, 0);
  const lastMonthStart = new Date(lastMonthStartBeijing.getTime() - 8 * 60 * 60 * 1000);
  const lastMonthEndBeijing = new Date(monthStartBeijing);
  lastMonthEndBeijing.setUTCDate(0);
  lastMonthEndBeijing.setUTCHours(23, 59, 59, 999);
  const lastMonthEnd = new Date(lastMonthEndBeijing.getTime() - 8 * 60 * 60 * 1000);

  // 5 time buckets sum gold (直属D parentId=TL)
  const [todayStats, yesterdayStats, weekStats, monthStats, lastMonthStats,
         todaySubTlContrib, yesterdaySubTlContrib, weekSubTlContrib, monthSubTlContrib, lastMonthSubTlContrib] = await Promise.all([
    GoldLog.aggregate([{ $match: { employeeId: { $in: employeeIds }, createTime: { $gte: todayStart, $lt: todayEnd } } }, { $group: { _id: null, totalGold: { $sum: '$gold' } } }]),
    GoldLog.aggregate([{ $match: { employeeId: { $in: employeeIds }, createTime: { $gte: yesterdayStart, $lt: yesterdayEnd } } }, { $group: { _id: null, totalGold: { $sum: '$gold' } } }]),
    GoldLog.aggregate([{ $match: { employeeId: { $in: employeeIds }, createTime: { $gte: weekStart, $lt: todayEnd } } }, { $group: { _id: null, totalGold: { $sum: '$gold' } } }]),
    GoldLog.aggregate([{ $match: { employeeId: { $in: employeeIds }, createTime: { $gte: monthStart, $lt: todayEnd } } }, { $group: { _id: null, totalGold: { $sum: '$gold' } } }]),
    GoldLog.aggregate([{ $match: { employeeId: { $in: employeeIds }, createTime: { $gte: lastMonthStart, $lt: lastMonthEnd } } }, { $group: { _id: null, totalGold: { $sum: '$gold' } } }]),
    calcSubTlContribution(todayStart, todayEnd),
    calcSubTlContribution(yesterdayStart, yesterdayEnd),
    calcSubTlContribution(weekStart, todayEnd),
    calcSubTlContribution(monthStart, todayEnd),
    calcSubTlContribution(lastMonthStart, lastMonthEnd)
  ]);

  // 组长提成按组
  const calculateGroupLeaderRevenueOptimized = async (start, end) => {
    const promises = groups.map(async (group) => {
      const groupEmployees = employees.filter(e =>
        e.groupName === group.groupName ||
        e.teamGroupId === group._id.toString() ||
        e.teamGroupId === group._id
      );
      if (groupEmployees.length === 0) return 0;
      const ids = groupEmployees.map(e => e.employeeId);
      const matchCondition = { employeeId: { $in: ids }, createTime: { $gte: start } };
      if (end) matchCondition.createTime.$lt = end;
      const COMM = +group.commission || 0.05;
      const rateExpr = {
        $cond: [
          { $and: [ { $gt: [ { $ifNull: ['$commissionRate', 0] }, 0 ] }, { $lte: [ { $ifNull: ['$commissionRate', 0] }, 1 ] } ] },
          '$commissionRate',
          COMM
        ]
      };
      const [agg] = await GoldLog.aggregate([
        { $match: matchCondition },
        { $group: { _id: null, totalCommissionGold: { $sum: { $multiply: ['$gold', rateExpr] } } } }
      ]).exec();
      return +((agg?.totalCommissionGold || 0) / 1000);
    });
    const revs = await Promise.all(promises);
    return revs.reduce((a,b)=>a+b, 0);
  };
  const [todayGroupRevenue, yesterdayGroupRevenue, weekGroupRevenue, monthGroupRevenue, lastMonthGroupRevenue] = await Promise.all([
    calculateGroupLeaderRevenueOptimized(todayStart, todayEnd),
    calculateGroupLeaderRevenueOptimized(yesterdayStart, yesterdayEnd),
    calculateGroupLeaderRevenueOptimized(weekStart, todayEnd),
    calculateGroupLeaderRevenueOptimized(monthStart, todayEnd),
    calculateGroupLeaderRevenueOptimized(lastMonthStart, lastMonthEnd)
  ]);

  // 最低档率（L2023-L2031 一字不差）
  let TL_RATE_B = 0.20;
  try {
    const TLConfB = mongoose.models.TeamLeaderLevelConfig;
    const tlCfgB = await TLConfB.findOne({ key: 'global' }).select('levels').lean().exec();
    if (tlCfgB && Array.isArray(tlCfgB.levels) && tlCfgB.levels.length > 0) {
      const sortedB = [...tlCfgB.levels].sort((a,b) => (a.minRevenue||0) - (b.minRevenue||0));
      if (sortedB[0] && typeof sortedB[0].commission === 'number') TL_RATE_B = +sortedB[0].commission;
    }
  } catch (_) {}
  const calculateTeamCommission = (totalGold, groupRevenue) => {
    const teamUserRevenue = (totalGold || 0) / 1000;
    const teamCommissionRevenue = (teamUserRevenue * TL_RATE_B) - groupRevenue;
    return Math.max(0, teamCommissionRevenue);
  };
  const todayCommission     = calculateTeamCommission(todayStats[0]?.totalGold, todayGroupRevenue)         + todaySubTlContrib;
  const yesterdayCommission = calculateTeamCommission(yesterdayStats[0]?.totalGold, yesterdayGroupRevenue) + yesterdaySubTlContrib;
  const weekCommission      = calculateTeamCommission(weekStats[0]?.totalGold, weekGroupRevenue)           + weekSubTlContrib;
  const monthCommission     = calculateTeamCommission(monthStats[0]?.totalGold, monthGroupRevenue)         + monthSubTlContrib;
  const lastMonthCommission = calculateTeamCommission(lastMonthStats[0]?.totalGold, lastMonthGroupRevenue) + lastMonthSubTlContrib;
  return {
    today:     parseFloat(todayCommission.toFixed(2)),
    yesterday: parseFloat(yesterdayCommission.toFixed(2)),
    week:      parseFloat(weekCommission.toFixed(2)),
    month:     parseFloat(monthCommission.toFixed(2)),
    lastMonth: parseFloat(lastMonthCommission.toFixed(2)),
    _TL_RATE_B: TL_RATE_B,
    _directIdsLen: employeeIds.length,
    _subTLDIdsLen: subTlDirectEmpIds.length,
    _groupsLen: groups.length
  };
}

(async () => {
  await mongoose.connect(MONGO, {});
  const Admin = mongoose.model('Admin');
  const cui = await Admin.findOne({ username: 'cuiding' }).select('_id username teamName teamGroupId commission parentTlId').lean();
  console.log('TL基准：cuiding._id=' + String(cui._id) + ' teamName=' + cui.teamName + ' commission=' + (cui.commission*100).toFixed(1) + '%\n');

  const [kpiOut, legacyOut] = await Promise.all([
    kpiAuthority(cui._id),
    tlCommissionLegacy(cui)
  ]);

  console.log('═══════════════════════════════════════════════');
  console.log('【方式A】旧 /team-leader/commission 接口算法（前端Settings.tsx用的）：');
  console.log(`  TL_RATE_B(最低档率)=${(legacyOut._TL_RATE_B*100).toFixed(1)}%  直属D=${legacyOut._directIdsLen} 下属TL直属D=${legacyOut._subTLDIdsLen} 战队Groups=${legacyOut._groupsLen}`);
  for (const r of RANGES) console.log(`  ${r.padEnd(10)} ¥${legacyOut[r].toFixed(2)}`);
  console.log('\n【方式B】KPI权威 computeNewKpi → teamCommission（前端团队Tab用的）：');
  for (const r of RANGES) console.log(`  ${r.padEnd(10)} ¥${kpiOut[r].toFixed(2)}`);
  console.log('\n【差异Δ = A − B】');
  let allMatch = true;
  for (const r of RANGES) {
    const d = +(legacyOut[r] - kpiOut[r]).toFixed(2);
    const ok = Math.abs(d) <= 0.01;
    if (!ok) allMatch = false;
    console.log(`  ${r.padEnd(10)} ¥${d.toFixed(2).padStart(8)}  ${ok?'✅ 一致':'❌ 不一致'}`);
  }
  console.log('\n▶ 结论：' + (allMatch ? '✅ 全一致，无需修改' : '❌ 有差异，需要让 team-leader/commission 直接复用 computeNewKpi'));
  process.exit(0);
})().catch(e => { console.error('❌', e.message || e); process.exit(1); });
