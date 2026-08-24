// TDD RED：超管 super/kpi 新需求 4 项 → 先断言当前实现失败
// 需求：
//   ① 新增主字段：dividendTotal（分红金额总计 = userShareCommission*25% - managementCommission）
//   ② 新增主字段：newUserCount（新增用户 = 时间窗口内 Employee.createdAt 计数）
//   ③ 毛利算法调整：platformProfit = 业务总收入 - 用户分成 - 管理分成总计 - 分红金额总计
//   ④ 补齐环比：platformProfitRateGrowth（毛利率环比）、ecpmAvgGrowth（ECPM环比）、dividendTotalGrowth、newUserCountGrowth
//
// 用法：node _tdd_super_kpi_new_fields_RED.js
//
// TDD RED：超管 super/kpi 新需求 4 项 → 先断言当前实现失败
// 需求：
//   ① 新增主字段：dividendTotal（分红金额总计 = userShareCommission*25% - managementCommission）
//   ② 新增主字段：newUserCount（新增用户 = 时间窗口内 Employee.createdAt 计数）
//   ③ 毛利算法调整：platformProfit = 业务总收入 - 用户分成 - 管理分成总计 - 分红金额总计
//   ④ 补齐环比：platformProfitRateGrowth（毛利率环比）、ecpmAvgGrowth（ECPM环比）、dividendTotalGrowth、newUserCountGrowth
//
// 用法：node _tdd_super_kpi_new_fields_RED.js
//
const mongoose = require('mongoose');
const MONGO = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';
require('./models/Admin');
require('./models/Employee');
require('./models/GoldLog');
require('./models/UserGold');
require('./models/UserActivity');
require('./models/Team');
require('./models/TeamGroup');
require('./models/LoginRecord');
const db = require('./routes/dashboard');
const assert = require('assert');

let fails = 0;
function assertPass(msg) { console.log("  ✅ PASS " + msg); }
function assertFail(msg, want, got) {
  fails++;
  console.log("  ❌ FAIL " + msg + "  期望=" + want + "  实际=" + got);
}
function assertExists(o, key) {
  if (o[key] === undefined) return assertFail("字段 " + key + " 不存在", "number", "undefined");
  if (typeof o[key] !== "number") return assertFail("字段 " + key + " 类型非number", "number", typeof o[key]);
  if (!isFinite(o[key])) return assertFail("字段 " + key + " 非有限值", "finite", String(o[key]));
  return true;
}
function assertClose(msg, actual, expected, tolRel=0.001, tolAbs=0.01) {
  const diff = Math.abs(+actual - +expected);
  const maxTol = Math.max(tolAbs, tolRel * Math.abs(+expected));
  if (diff <= maxTol) return assertPass(msg + `  actual=${(+actual).toFixed(4)} expected=${(+expected).toFixed(4)} diff=${diff.toFixed(4)}`);
  fails++;
  console.log("  ❌ FAIL " + msg + `  actual=${(+actual).toFixed(4)} expected=${(+expected).toFixed(4)} diff=${diff.toFixed(4)} maxTol=${maxTol.toFixed(4)}`);
  return false;
}

(async () => {
  await mongoose.connect(MONGO, {});
  console.log("\n══════ [1/4] 字段存在性检查：dividendTotal / newUserCount / 4 个新环比 ═════=");
  const d = await db.computeSuperKpi('today');
  const REQUIRED_FIELDS = [
    'dividendTotal', 'newUserCount',
    'platformProfitRateGrowth', 'ecpmAvgGrowth', 'dividendTotalGrowth', 'newUserCountGrowth'
  ];
  for (const k of REQUIRED_FIELDS) {
    assertExists(d, k);
  }

  console.log("\n══════ [2/4] 分红金额总计 恒等式：dividendTotal ≡ userShareCommission * 25% - managementCommission ═════=");
  for (const rng of ['today', 'yesterday', 'week', 'month']) {
    const x = await db.computeSuperKpi(rng);
    const expDiv = +((+x.userShareCommission || 0) * 0.25 - (+x.managementCommission || 0)).toFixed(2);
    assertClose(`${rng}/dividendTotal 恒等式`, x.dividendTotal, expDiv, 0.001, 0.01);
  }

  console.log("\n══════ [3/4] 新毛利算法：platformProfit ≡ rev - userShare - mgmt - dividendTotal（比旧公式多减了分红）══════=");
  for (const rng of ['today', 'yesterday', 'week', 'month']) {
    const x = await db.computeSuperKpi(rng);
    const rev = +x.businessRevenue || 0;
    const us  = +x.userShareCommission || 0;
    const mg  = +x.managementCommission || 0;
    const div = +x.dividendTotal || 0;
    const expProfit = +(rev - us - mg - div).toFixed(2);
    assertClose(`${rng}/新毛利公式 platformProfit = rev-user-mgmt-div`, x.platformProfit, expProfit, 0.001, 0.01);
    // 新毛利应该比旧毛利更小（或等于，如果 div=0）
    const oldProfit = +(rev - us - mg).toFixed(2);
    if (div !== 0) {
      if (Math.abs(x.platformProfit - oldProfit) < 0.001) {
        assertFail(`${rng}/新毛利应该比旧毛利少一个 dividend`, `profit=${expProfit}（旧=${oldProfit} 差值=${div}）`, `profit=${x.platformProfit}（和旧公式一样，没减分红）`);
      } else {
        assertPass(`${rng}/新毛利确实比旧毛利少了分红  div=${div}`);
      }
    } else {
      assertPass(`${rng}/分红=0，新毛利和旧毛利相等`);
    }
    // 同步验证毛利率也变了
    const expRate = rev > 0 ? +((expProfit / rev * 100).toFixed(2)) : 0;
    assertClose(`${rng}/毛利率恒等式（新口径）`, x.platformProfitRate, expRate, 0.001, 0.02);
  }

  console.log("\n══════ [4/4] newUserCount 口径：Employee.createdAt 在时间窗内，并且环比一致══════=");
  const { _getKpiTimeRange } = db;
  const _mongoose = require('mongoose');
  const Employee = _mongoose.model('Employee');
  for (const rng of ['today', 'yesterday', 'week', 'month']) {
    const x = await db.computeSuperKpi(rng);
    const { start: s, end: e, prevStart: ps, prevEnd: pe } = _getKpiTimeRange(rng);
    const cnt = await Employee.countDocuments({ createdAt: { $gte: s, $lt: e } });
    const prevCnt = await Employee.countDocuments({ createdAt: { $gte: ps, $lt: pe } });
    if (x.newUserCount === cnt) {
      assertPass(`${rng}/newUserCount=${cnt} 等于 Employee.createdAt 窗口计数`);
    } else {
      assertFail(`${rng}/newUserCount 口径`, cnt, x.newUserCount);
    }
    // 环比校验
    const expMom = (prevCnt === 0 || !isFinite(prevCnt) || prevCnt == null) ? 0
      : +(((cnt - prevCnt) / Math.abs(prevCnt) * 100).toFixed(1));
    if (x.newUserCountGrowth === expMom) {
      assertPass(`${rng}/newUserCountGrowth=${x.newUserCountGrowth}%，按 db 计数独立计算=${expMom}%`);
    } else {
      assertFail(`${rng}/newUserCountGrowth`, `${expMom}% (cnt=${cnt},prev=${prevCnt})`, `${x.newUserCountGrowth}%`);
    }
  }

  console.log("\n══════ 总结 ═════=");
  console.log("失败断言数 = " + fails);
  process.exit(fails > 0 ? 1 : 0);
})().catch(e => { console.error("TDD 异常：", e); process.exit(2); });
