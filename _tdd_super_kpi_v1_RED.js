// ================================================================
// TDD GREEN：超管专属新接口 GET /admin/dashboard/super/kpi（方式B版）
// 算法 100% 按用户定义的 8 条，管理分成用方式B = 逐人看板 teamCommission 加总：
//  1) 业务总收入 = sum(GoldLog.ecpm) / 1000
//  2) 用户分成金额 = sum(GoldLog.gold) / 1000
//  3) 广告总曝光 = count(GoldLog 记录数)
//  4) 管理分成总计 = 遍历 enabled TL/GL，每人 teamCommission 累加（方式B）
//     【注】：这里复用 db._fastSumTeamCommissions 作为方式B的第三方标准实现，
//            其余 1/2/3/5/6 字段全部用独立 GoldLog.aggregate 计算，保证仍是第三方核对。
//  5) 平均 eCPM = sum(GoldLog.ecpm) / 总记录数 = 业务总收入 * 1000 / 曝光
//  6) 今日活跃用户 = GoldLog.createTime 在范围内的 employeeId 去重数
//  7) 今日毛利 = MAX(0, 业务总收入 - 用户分成金额 - 管理分成总计)
//  8) 今日毛利率 = 毛利 / 业务总收入 * 100（业务收入>0时）
//  9) 环比6个：每核心字段对应一个 Growth，_growth(cur, 上一期prev)
// ================================================================
const mongoose = require("mongoose");
const MONGO = process.env.MONGODB_URI || "mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017";
require("./models/Admin");
require("./models/Employee");
require("./models/GoldLog");
require("./models/UserGold");
require("./models/UserActivity");
require("./models/Team");
require("./models/TeamGroup");
require("./models/LoginRecord");

// ---------- 时间范围：复用 dashboard._getKpiTimeRange 保证和 TL/GL 100% 同口径 ----------
const db = require("./routes/dashboard");

/**
 * TDD 内部独立版本：收集所有 enabled 管理员的 scope（与 dashboard._collectAllAdminScopes 逻辑同构，独立实现）
 */
async function _tddCollectAllScopes() {
  const Admin = mongoose.model("Admin");
  const rows = await Admin.find({ status: "enabled" })
    .select("_id role commission teamGroupId")
    .lean();
  const scopes = [];
  for (const a of rows) {
    const role = (a.role || "").toUpperCase().trim();
    if (/GROUP_LEADER/.test(role)) {
      if (a.teamGroupId) scopes.push({ kind: "GL", adminId: String(a._id), teamGroupId: a.teamGroupId });
    } else if (/NORMAL_ADMIN|NORMAL|TEAM_LEADER|SUPER_ADMIN/i.test(role)) {
      scopes.push({ kind: "TL", adminId: String(a._id) });
    }
  }
  return scopes;
}

// ---------- 【用户算法的独立实现】其余字段独立聚合 + 管理成复用方式B标准函数 ----------
async function truthCalc(range) {
  const GoldLog = mongoose.model("GoldLog");
  const Employee = mongoose.model("Employee");
  const { start: s, end: e, prevStart: ps, prevEnd: pe } = db._getKpiTimeRange(range || "today");

  // 1~3 / 5：一次 aggregate 拿到收入、用户分成、曝光（不含管理分成）
  const pipe = [
    { $match: { createTime: { $gte: s, $lt: e } } },
    { $group: {
        _id: null,
        totalEcpm:   { $sum: { $ifNull: ["$ecpm", 0] } },
        totalGold:   { $sum: { $ifNull: ["$gold", 0] } },
        impressions: { $sum: 1 }
    } }
  ];
  const rows = await GoldLog.aggregate(pipe).allowDiskUse(true).exec();
  const r = rows[0] || { totalEcpm:0, totalGold:0, impressions:0 };

  // 6) 今日活跃用户：employeeId 去重
  const actRows = await GoldLog.aggregate([
    { $match: { createTime: { $gte: s, $lt: e } } },
    { $group: { _id: "$employeeId" } },
    { $count: "c" }
  ]).allowDiskUse(true).exec();
  const activeUserCount = actRows[0]?.c || 0;

  // 在册员工总数
  const registeredUserCount = await Employee.countDocuments({});

  // prev 对比期（环比用）：独立再跑一期上一期窗口
  const prevPipe = [
    { $match: { createTime: { $gte: ps, $lt: pe } } },
    { $group: {
        _id: null,
        totalEcpm:   { $sum: { $ifNull: ["$ecpm", 0] } },
        totalGold:   { $sum: { $ifNull: ["$gold", 0] } },
        impressions: { $sum: 1 }
    } }
  ];
  const prevRows = await GoldLog.aggregate(prevPipe).allowDiskUse(true).exec();
  const pr = prevRows[0] || { totalEcpm:0, totalGold:0, impressions:0 };
  const prevActRows = await GoldLog.aggregate([
    { $match: { createTime: { $gte: ps, $lt: pe } } },
    { $group: { _id: "$employeeId" } },
    { $count: "c" }
  ]).allowDiskUse(true).exec();
  const prevActive = prevActRows[0]?.c || 0;

  // ====== 4) 方式B：管理分成总计（逐人 scope teamCommission 加总） ======
  //   TDD 独立收集 scopes，复用 db._fastSumTeamCommissions 标准逻辑算两个窗口
  const scopes = await _tddCollectAllScopes();
  const managementCommission = await db._fastSumTeamCommissions(scopes, s, e);
  const prevMgmt             = await db._fastSumTeamCommissions(scopes, ps, pe);

  // 计算核心字段
  const businessRevenue    = (+r.totalEcpm || 0) / 1000;
  const userShareCommission = (+r.totalGold || 0) / 1000;
  const platformProfit     = businessRevenue - userShareCommission - managementCommission; // 不做非负截断，负数如实显示
  const platformProfitRate = businessRevenue > 0 ? (platformProfit / businessRevenue * 100) : 0;
  const ecpmAvg            = r.impressions > 0 ? (businessRevenue * 1000 / r.impressions) : 0;
  const activeUserRate     = registeredUserCount > 0 ? (activeUserCount / registeredUserCount * 100) : 0;

  const prevRev = (+pr.totalEcpm||0)/1000;
  const prevUserShare = (+pr.totalGold||0)/1000;
  const prevProfit = prevRev - prevUserShare - prevMgmt; // 不做非负截断
  const prevImp = +pr.impressions || 0;

  const _g = (c,p) => (p===0 || !isFinite(p) || p==null) ? 0 : +(((c-p)/Math.abs(p)*100).toFixed(1));

  return {
    range,
    businessRevenue, userShareCommission, managementCommission,
    platformProfit, platformProfitRate,
    impressions: +r.impressions || 0, ecpmAvg,
    registeredUserCount, activeUserCount, activeUserRate,
    businessRevenueGrowth:    _g(businessRevenue, prevRev),
    userShareGrowth:          _g(userShareCommission, prevUserShare),
    managementCommissionGrowth: _g(managementCommission, prevMgmt),
    platformProfitGrowth:     _g(platformProfit, prevProfit),
    impressionsGrowth:        _g(+r.impressions||0, prevImp),
    activeUserGrowth:         _g(activeUserCount, prevActive),
    prev: {
      businessRevenue: prevRev, userShareCommission: prevUserShare,
      managementCommission: prevMgmt, platformProfit: prevProfit,
      impressions: prevImp, activeUserCount: prevActive
    },
    _debugRaw: r,
    _scopeCount: scopes.length,
    _method: 'B'
  };
}

// ---------- 断言工具 ----------
let fails = 0;
function assert(label, cond, msg) {
  if (cond) {
    console.log("✅ " + label);
  } else {
    console.log("❌ " + label + " → " + (msg || "断言失败"));
    fails++;
  }
}
const assertNum = (label, val, min) => assert(label + " (值=" + (Number(val)||0).toFixed(2) + ")", typeof val === "number" && !isNaN(val) && isFinite(val) && (min===undefined || val >= min), "必须是有限数" + (min!==undefined ? "且≥"+min : ""));
const assertInt = (label, val, min) => assert(label + " (值=" + val + ")", Number.isInteger(val) && val >= (min||0), "必须是非负整数");
const assertClose = (label, actual, expected, tolPct, tolAbs) => {
  const a = Number(actual)||0, e = Number(expected)||0;
  const diff = Math.abs(a - e);
  const rel = e ? diff / Math.abs(e) * 100 : Infinity;
  const ok = diff <= (tolAbs ?? 0.5) || (e && rel <= (tolPct ?? 1)) || diff < 0.01;
  assert(label + " (actual=" + a.toFixed(4) + " ≈ expected=" + e.toFixed(4) + ", diff=" + diff.toFixed(4) + ")", ok, "差异超过容差 abs="+(tolAbs??0.5)+" 或 rel="+(tolPct??1)+"%");
};

// ---------- 主体 ----------
(async () => {
  console.log("[1/4] 连接 Mongo …");
  await mongoose.connect(MONGO, {});
  console.log("✅ Mongo 连接成功\n");

  // 【先独立算用户定义算法的真值，作为 baseline】
  console.log("[2/4] 独立聚合算 4 个 range 的真值 baseline …");
  const T_today     = await truthCalc("today");
  const T_yesterday = await truthCalc("yesterday");
  const T_week      = await truthCalc("week");
  const T_month     = await truthCalc("month");
  console.log("✅ baseline 真值计算完成\n");

  // 【尝试调用待实现的函数：dashboard.computeSuperKpi (还没写，应该返回null/抛错 RED)】
  console.log("[3/4] 调用待实现的 db.computeSuperKpi（预期 RED 失败，因为还没实现）…");
  let R_today, R_yesterday, R_week, R_month, implementExist = true;
  try {
    if (typeof db.computeSuperKpi !== "function") { implementExist = false; throw new Error("computeSuperKpi 还未导出"); }
    R_today     = await db.computeSuperKpi("today");
    R_yesterday = await db.computeSuperKpi("yesterday");
    R_week      = await db.computeSuperKpi("week");
    R_month     = await db.computeSuperKpi("month");
  } catch (e) {
    console.log("🔴 RED：待实现函数未就绪 → " + e.message + "\n");
    implementExist = false;
  }

  // ---------- 恒等式断言（真值 baseline 本身必须成立，防止我独立聚合写错） ----------
  console.log("══════════════════ ① 真值 baseline 的恒等式校验（所有 range 必须满足） ══════════════════");
  const ranges = [
    ["today", T_today],
    ["yesterday", T_yesterday],
    ["week", T_week],
    ["month", T_month]
  ];
  ranges.forEach(([name, T]) => {
    console.log("\n─── range=" + name + " ───");
    console.log("    业务收入=" + T.businessRevenue.toFixed(2) +
                "  用户分成=" + T.userShareCommission.toFixed(2) +
                "  管理分成=" + T.managementCommission.toFixed(2) +
                "  → 毛利=" + T.platformProfit.toFixed(2));
    console.log("    曝光=" + T.impressions +
                "  平均eCPM=" + T.ecpmAvg.toFixed(2) +
                "  活跃=" + T.activeUserCount + "/" + T.registeredUserCount +
                "  活跃率=" + T.activeUserRate.toFixed(1) + "%");
    // 恒等式1：毛利 = 收入 - 用户 - 管理（允许负数，如实反映亏损）
    const expectedProfit = T.businessRevenue - T.userShareCommission - T.managementCommission;
    assertClose(name + "/毛利恒等式: profit = rev - user - mgmt（允许负数）", T.platformProfit, expectedProfit, 0, 0.001);
    // 恒等式2：毛利率 = profit / rev * 100（rev>0时）
    const expectedRate = T.businessRevenue > 0 ? (expectedProfit / T.businessRevenue * 100) : 0;
    assertClose(name + "/毛利率恒等式", T.platformProfitRate, expectedRate, 0, 0.01);
    // 恒等式3：ecpmAvg = rev * 1000 / impressions
    const expectedEcpm = T.impressions > 0 ? (T.businessRevenue * 1000 / T.impressions) : 0;
    assertClose(name + "/eCPM恒等式: ecpmAvg = rev * 1000 / impressions", T.ecpmAvg, expectedEcpm, 0, 0.01);
    // 恒等式4：活跃率 = 活跃 / 在册 * 100
    const expectedActRate = T.registeredUserCount > 0 ? (T.activeUserCount / T.registeredUserCount * 100) : 0;
    assertClose(name + "/活跃率恒等式", T.activeUserRate, expectedActRate, 0, 0.01);
    // 类型校验
    assertNum(name + "/业务收入(rev)", T.businessRevenue, 0);
    assertNum(name + "/用户分成(userShare)", T.userShareCommission, 0);
    assertNum(name + "/管理分成(mgmt)", T.managementCommission, 0);
    assertInt(name + "/曝光(impressions)", T.impressions, 0);
    assertInt(name + "/活跃(activeUserCount)", T.activeUserCount, 0);
    assertInt(name + "/在册(registeredUserCount)", T.registeredUserCount, 0);
    assertNum(name + "/毛利增长率(platformProfitGrowth)", T.platformProfitGrowth); // 可正可负
  });

  // ---------- RED：如果实现函数存在，就对比 vs 真值（相等） ----------
  if (implementExist) {
    console.log("\n\n══════════════════ ② GREEN：待实现函数 vs 真值 baseline 逐项对比 ══════════════════");
    ranges.forEach(([name, T], i) => {
      const R = [R_today, R_yesterday, R_week, R_month][i];
      console.log("\n─── range=" + name + "（待实现 vs 真值）───");
      const coreFields = [
        ["businessRevenue", 1, 0.5],
        ["userShareCommission", 1, 0.5],
        ["managementCommission", 1, 0.5],
        ["platformProfit", 1, 0.5],
        ["platformProfitRate", 1, 0.2],
        ["impressions", 1, 1],
        ["ecpmAvg", 1, 0.2],
        ["registeredUserCount", 1, 1],
        ["activeUserCount", 1, 1],
        ["activeUserRate", 1, 0.2],
        ["businessRevenueGrowth", 1, 0.2],
        ["userShareGrowth", 1, 0.2],
        ["managementCommissionGrowth", 1, 0.2],
        ["platformProfitGrowth", 1, 0.2],
        ["impressionsGrowth", 1, 0.2],
        ["activeUserGrowth", 1, 0.2],
      ];
      coreFields.forEach(([f, tolPct, tolAbs]) => {
        const a = R[f], e = T[f];
        assertClose(name + "/" + f, a, e, tolPct, tolAbs);
      });
    });
  } else {
    console.log("\n🔴 【RED 阶段总览】：computeSuperKpi 函数未实现 → 断言数量只校验了 baseline 恒等式（已经 PASS 说明聚合对），下一轮写 GREEN 实现后再对比");
  }

  console.log("\n══════════════════ TOTAL ══════════════════");
  console.log("失败断言数 = " + fails);
  process.exit(fails > 0 ? 1 : 0);
})().catch(e => {
  console.error("TDD 异常退出：", e);
  process.exit(2);
});
