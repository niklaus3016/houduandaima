// ================================================================
// 回归验证脚本：方式B引入后，验证 0 回归风险
// 1) 关键 TL/GL 的 computeNewKpi 仍返回正确结构（直推+间推=团队 恒等式）
// 2) _fastSumTeamCommissions 单窗口结果 == 逐个 computeNewKpi.teamCommission 加总（口径等价）
// 3) computeSuperKpi 不抛错，且 毛利恒等式成立
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

const db = require("./routes/dashboard");

let fails = 0;
function assert(label, cond, msg) {
  if (cond) console.log("✅ " + label);
  else { console.log("❌ " + label + " → " + (msg || "断言失败")); fails++; }
}
function assertClose(label, a, e, tolAbs, tolPct) {
  a = +a||0; e = +e||0;
  const diff = Math.abs(a-e);
  const rel = e ? diff/Math.abs(e)*100 : Infinity;
  const ok = diff <= (tolAbs ?? 0.02) || (e && rel <= (tolPct ?? 0.5)) || diff < 0.01;
  assert(label + " (a=" + a.toFixed(4) + " e=" + e.toFixed(4) + " d=" + diff.toFixed(4) + ")", ok, "超容差 abs="+(tolAbs??0.02)+" rel="+(tolPct??0.5)+"%");
}

(async () => {
  console.log("[1/4] 连接 Mongo …");
  await mongoose.connect(MONGO, {});
  console.log("✅ Mongo 连接成功\n");

  const range = "today";

  // ====== 1) 关键用户 computeNewKpi 结构 + 恒等式 ======
  console.log("[2/4] 关键 TL/GL computeNewKpi 回归检查（直推+间推=团队）…");
  const Admin = mongoose.model("Admin");
  // 取 cuiding（TL+团队长）、fanjie（TL子团队长）、周欢类型（GL组长）各1名
  const keyUsers = await Admin.find({ status: "enabled" }).select("_id role realName teamGroupId commission").lean();
  const cuiTL   = keyUsers.find(u => (u.realName||"").includes("崔") && !/GROUP_LEADER/.test(u.role||""));
  const fanTL   = keyUsers.find(u => (u.realName||"").includes("范") && !/GROUP_LEADER/.test(u.role||""));
  const oneGL   = keyUsers.find(u => /GROUP_LEADER/.test(u.role||"") && u.teamGroupId);
  const targets = [
    { tag: "cuiding(TL)",   scope: cuiTL ? { kind: "TL", adminId: String(cuiTL._id) } : null },
    { tag: "fanjie(TL)",    scope: fanTL ? { kind: "TL", adminId: String(fanTL._id) } : null },
    { tag: oneGL ? (oneGL.realName||"GL") + "(GL)" : "sample(GL)",
      scope: oneGL ? { kind: "GL", adminId: String(oneGL._id), teamGroupId: oneGL.teamGroupId } : null }
  ].filter(t => t.scope);

  for (const t of targets) {
    const k = await db.computeNewKpi(t.scope, range);
    assert(t.tag + " 返回字段 teamRevenue/teamCommission 存在",
      typeof k.teamRevenue === "number" && typeof k.teamCommission === "number");
    // 恒等式：teamRevenue = directRevenue + indirectRevenue
    const expRev = (+k.directRevenue||0) + (+k.indirectRevenue||0);
    assertClose(t.tag + "/teamRevenue = direct+indirect", k.teamRevenue, expRev, 0.01);
    // 恒等式：teamCommission = directCommission + indirectCommission
    const expComm = (+k.directCommission||0) + (+k.indirectCommission||0);
    assertClose(t.tag + "/teamCommission = direct+indirect", k.teamCommission, expComm, 0.01);
  }
  console.log("");

  // ====== 2) _fastSumTeamCommissions ≡ 逐个 computeNewKpi.teamCommission 加总 ======
  console.log("[3/4] 方式B口径等价性校验：_fastSumTeamCommissions vs Σ computeNewKpi.teamCommission …");
  const { start: s, end: e } = db._getKpiTimeRange(range);
  // 抽 N 个 scope 验证（全量太慢，取前20个样本+所有关键TL）
  const allAdmins = await Admin.find({ status: "enabled" }).select("_id role teamGroupId").lean();
  const sampleScopes = [];
  for (const a of allAdmins) {
    const role = (a.role||"").toUpperCase().trim();
    if (/GROUP_LEADER/.test(role) && a.teamGroupId) {
      sampleScopes.push({ tag: "GL", scope: { kind: "GL", adminId: String(a._id), teamGroupId: a.teamGroupId } });
    } else if (/NORMAL_ADMIN|NORMAL|TEAM_LEADER|SUPER_ADMIN/i.test(role)) {
      sampleScopes.push({ tag: "TL", scope: { kind: "TL", adminId: String(a._id) } });
    }
    if (sampleScopes.length >= 25) break;
  }
  const scopesOnly = sampleScopes.map(x => x.scope);
  const fastTotal = await db._fastSumTeamCommissions(scopesOnly, s, e);
  let indivTotal = 0;
  for (const sp of sampleScopes) {
    const k = await db.computeNewKpi(sp.scope, range);
    indivTotal += (+k.teamCommission || 0);
  }
  assertClose(`样本量=${sampleScopes.length}  _fastSumTeamCommissions ≡ Σ computeNewKpi.teamCommission`,
    fastTotal, indivTotal, 0.05, 0.3);
  console.log(`    fast=${fastTotal.toFixed(4)}  indiv=${indivTotal.toFixed(4)}  diff=${(fastTotal-indivTotal).toFixed(4)}\n`);

  // ====== 3) computeSuperKpi 不抛错 + 毛利恒等式 + 环比字段完整 ======
  console.log("[4/4] computeSuperKpi today/yesterday/week/month 4 range 冒烟 + 毛利恒等式 …");
  for (const rng of ["today", "yesterday", "week", "month"]) {
    const d = await db.computeSuperKpi(rng);
    const mgmtOk = typeof d.managementCommission === "number" && d.managementCommission >= 0;
    // 主字段：分红总计/新增用户 必须存在且数值
    const newKpiFields = ["dividendTotal", "newUserCount"];
    const kpiOk = newKpiFields.every(f => typeof d[f] === "number" && isFinite(d[f]));
    // 环比：6 旧 + 4 新（利润率环比/ECPM环比/分红环比/新增环比） 必须齐全
    const growthFields = [
      "businessRevenueGrowth","userShareGrowth","managementCommissionGrowth",
      "dividendTotalGrowth",
      "platformProfitGrowth","platformProfitRateGrowth",
      "impressionsGrowth","ecpmAvgGrowth",
      "activeUserGrowth","newUserCountGrowth"
    ];
    const growthOk = growthFields.every(f => typeof d[f] === "number" && isFinite(d[f]));
    assert(rng + "/管理分成非负 & 2个新主字段齐全 & 10个环比字段齐全", mgmtOk && kpiOk && growthOk,
      `mgmt=${d.managementCommission} kpi=${newKpiFields.map(f=>f+"="+d[f]).join(",")} growths=${growthFields.map(f=>f+"="+d[f]).join(",")}`);
    // 分红金额总计恒等式：dividendTotal = userShareCommission * 25% - managementCommission
    const expDiv = +(((+d.userShareCommission||0) * 0.25 - (+d.managementCommission||0)).toFixed(2));
    assertClose(rng + "/分红恒等式 dividendTotal ≡ userShare*25% - mgmt", d.dividendTotal, expDiv, 0.001, 0.01);
    // 毛利恒等式（新公式：再减分红总计；允许负数如实反映）
    const expProfit = (+d.businessRevenue||0) - (+d.userShareCommission||0) - (+d.managementCommission||0) - (+d.dividendTotal||0);
    assertClose(rng + "/新毛利恒等式 profit=rev-user-mgmt-dividend（允许负数）", d.platformProfit, +expProfit.toFixed(2), 0.001, 0.01);
    // 毛利率恒等式
    const expRate = (+d.businessRevenue||0) > 0 ? (+expProfit.toFixed(2) / (+d.businessRevenue) * 100) : 0;
    assertClose(rng + "/新毛利率恒等式", d.platformProfitRate, +expRate.toFixed(2), 0.001, 0.02);
    // 方法标记
    assert(rng + "/_method 标记为B", d._method === "B", d._method);
    console.log(`    ${rng}: rev=${(+d.businessRevenue||0).toFixed(2)} user=${(+d.userShareCommission||0).toFixed(2)} mgmt=${(+d.managementCommission||0).toFixed(2)} div=${(+d.dividendTotal||0).toFixed(2)} profit=${(+d.platformProfit||0).toFixed(2)} newUsers=${d.newUserCount}`);
  }

  console.log("\n══════════════════ TOTAL ══════════════════");
  console.log("失败断言数 = " + fails);
  process.exit(fails > 0 ? 1 : 0);
})().catch(e => { console.error("回归脚本异常：", e); process.exit(2); });
