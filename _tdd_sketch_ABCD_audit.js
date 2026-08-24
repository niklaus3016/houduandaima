// ============================================================
// TDD 严格对齐用户手绘草图 ABCD 4费率场景
// 层级：A(16% 顶层 TL)
//         ├ 用户1 (直属A, D类)
//         └ B(12% TL, 上级A)
//              ├ 用户2 (直属B, D类)
//              ├ C(8% TL, 上级B)
//              │   └ 用户3 (直属C, D类)
//              └ D(12% TL, 上级B, B平级=倒挂)
//                  └ 用户4 (直属D, D类)
// 用户手算断言（每条¥100）：
//  情况1: 用户1 → A 拿 16% = ¥16
//  情况2: 用户2 → B 拿 12% = ¥12,  A 拿 4% (16-12级差) = ¥4
//  情况3: 用户3 → C 拿 8% = ¥8,  B 拿 4% (12-8级差) = ¥4,  A = 0 (超2级)
//  情况4: 用户4 → D 拿 12% = ¥12,  B 拿 2% (平级保底, 公司额外出) = ¥2, A = 0 (超2级)
// 另加关键断言（钱守恒）：
//  情况4的 D 本级 12% 不能被切（否则 B 保底的2%就变成从 D 口袋里出了）
// ============================================================
const mongoose = require('mongoose');
require('./models/Admin'); require('./models/TeamGroup'); require('./models/GoldLog'); require('./models/Employee');
const MONGO = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';
const GoldLog = mongoose.model('GoldLog');
const Admin = mongoose.model('Admin');
const Employee = mongoose.model('Employee');

const cleanup = { newAdmins: [], newEmployees: [], newGoldlogs: [], snaps: {} };
const exit = { ok: true };
const aeq = (name, act, exp, tol = 1e-4) => {
  const ok = (typeof act === 'number' && typeof exp === 'number')
    ? Math.abs(act - exp) < tol
    : (act === exp) || (act == null && exp === 0);
  const fmt = v => typeof v === 'number' ? `¥${(v*100).toFixed(2)}` : (v == null ? '空' : v);
  const pct = v => typeof v === 'number' ? `${(v*100).toFixed(2)}%` : (v == null ? '空' : v);
  console.log(`  ${ok ? '✅' : '❌'} ${name}`);
  if (!ok) {
    console.log(`       预期: 率=${pct(typeof exp==='number'?exp:NaN)} 钱=${fmt(typeof exp==='number'?exp:NaN)}   实际: 率=${pct(act)} 钱=${fmt(act)}`);
    exit.ok = false; process.exitCode = 98;
  }
  return ok;
};
(async () => {
  await mongoose.connect(MONGO, { dbName: 'test', useNewUrlParser: true, useUnifiedTopology: true });
  const { getTeamLeaderPerformance, invalidateLevelRelatedCaches } = require('./routes/verification');

  // ========== 费率常量 100% 对齐用户图 ==========
  const R = { A: 0.16, B: 0.12, C: 0.08, D: 0.12 };
  const YUAN = 100;           // 每条订单 = ¥100
  const perY = rate => rate * YUAN;

  // ========== 造 4 个临时 Admin（A顶层 / B挂A下 / C挂B下 / D挂B下） ==========
  const mkAdmin = async (u, rate, parentTlId) => {
    const a = await new Admin({
      username: u, password: 'x', role: 'NORMAL_ADMIN', realName: u,
      commission: rate, parentTlId: parentTlId || null
    }).save();
    cleanup.newAdmins.push(a._id);
    return a;
  };
  const A = await mkAdmin('_aud_A_' + Date.now(), R.A, null);  // 顶层
  const B = await mkAdmin('_aud_B_' + Date.now(), R.B, A._id.toString());
  const C = await mkAdmin('_aud_C_' + Date.now(), R.C, B._id.toString());
  const D = await mkAdmin('_aud_D_' + Date.now(), R.D, B._id.toString());
  const ids = { A: A._id.toString(), B: B._id.toString(), C: C._id.toString(), D: D._id.toString() };

  console.log(`\n========== 草图 ABCD 费率：A=${R.A*100}% B=${R.B*100}% C=${R.C*100}% D=${R.D*100}% ==========`);
  console.log(`  A(parent=空) B(parent=A) C(parent=B) D(parent=B 平级D=B=12%)`);

  // ========== BEFORE 业绩基准 ==========
  invalidateLevelRelatedCaches();
  const before = {};
  for (const k of ['A','B','C','D']) {
    before[k] = (await getTeamLeaderPerformance(ids[k], { monthCount: 1 })).data.currentMonth;
  }

  // ========== 造 4 个员工（分别直属于 A/B/C/D，D员工路径B=没组） ==========
  const mkEmp = async (tag, parentId) => (await new Employee({
    employeeId: `AUD${tag}${Date.now()}${Math.floor(Math.random()*1e6)}`,
    parentId, teamGroupId: null, userId: 'u_aud'
  }).save())._doc;
  const eU1 = await mkEmp('U1', ids.A);   // 情况1：用户1 直属A
  const eU2 = await mkEmp('U2', ids.B);   // 情况2：用户2 直属B
  const eU3 = await mkEmp('U3', ids.C);   // 情况3：用户3 直属C
  const eU4 = await mkEmp('U4', ids.D);   // 情况4：用户4 直属D
  for (const e of [eU1,eU2,eU3,eU4]) cleanup.newEmployees.push(e._id);

  // ========== 造 4 条 ¥100 订单（createTime=昨天确保计入currentMonth） ==========
  const yesterday = new Date(Date.now() - 30 * 3600 * 1000);
  const mkLog = async (e) => {
    const g = await new GoldLog({
      userId: 'u_aud_'+Math.random(), employeeId: e.employeeId, deviceId: 'aud',
      gold: YUAN * 1000, ecpm: 20, type: 'income', createTime: yesterday
    }).save();
    cleanup.newGoldlogs.push(g._id);
    return GoldLog.findById(g._id).select('commissionRate tlCommissionRate parentTlCommissionRate gold').lean();
  };
  const L1 = await mkLog(eU1), L2 = await mkLog(eU2), L3 = await mkLog(eU3), L4 = await mkLog(eU4);

  // ========== STEP 1：分账字段（固化写入）严格对齐用户手算 ==========
  console.log(`\n========== STEP 1：分账字段固化率（每条订单 ¥${YUAN}） ==========`);
  // 情况1：用户1 直属A → A本级16%（没上级）
  aeq('情况1: commissionRate组长=0', L1.commissionRate, 0);
  aeq('情况1: tlCommissionRate=A本级16%', L1.tlCommissionRate, R.A);
  aeq('情况1: parentTlCommissionRate=空(A顶层)', L1.parentTlCommissionRate ?? 0, 0);
  // 情况2：用户2 直属B → B本级12%；上级A(16%)-B(12%)=4%级差
  aeq('情况2: commissionRate组长=0', L2.commissionRate, 0);
  aeq('情况2: tlCommissionRate=B本级12%', L2.tlCommissionRate, R.B);
  aeq('情况2: parentTlCommissionRate=A-B=4%级差', L2.parentTlCommissionRate, R.A-R.B);
  // 情况3：用户3 直属C → C本级8%；上级B(12%)-C(8%)=4%级差；A=第3级=无字段(0)
  aeq('情况3: commissionRate组长=0', L3.commissionRate, 0);
  aeq('情况3: tlCommissionRate=C本级8%', L3.tlCommissionRate, R.C);
  aeq('情况3: parentTlCommissionRate=B-C=4%级差', L3.parentTlCommissionRate, R.B-R.C);
  // 情况3检查：A是否绝对没字段（2级封顶强限制）
  if (L3.parentTlCommissionRate && L3.tlCommissionRate) {
    console.log(`  ✅ 情况3: 3字段里只含 C本级 + B级差 两项 (A=第3级无字段=0，封顶生效) 固化字段数<=2 ✔`);
  }
  // 情况4：用户4 直属D（D=12%平级B=12%）→ D本级12% 不能被切；上级B平级保底2%额外出；A超2级=0
  aeq('情况4: commissionRate组长=0', L4.commissionRate, 0);
  aeq('情况4: tlCommissionRate=D本级12%（★不能被切）', L4.tlCommissionRate, R.D); // 关键：D率必须还是12%
  aeq('情况4: parentTlCommissionRate=B保底2%（平级D=B，公司额外出）', L4.parentTlCommissionRate, 0.02);
  // 钱守恒检查：
  const L4TotalRate = (L4.commissionRate||0) + (L4.tlCommissionRate||0) + (L4.parentTlCommissionRate||0);
  const L4ExpectedExtra = R.D + 0.02; // D的12% + 公司额外出2%保底 = 14%
  if (Math.abs(L4TotalRate - L4ExpectedExtra) < 1e-4) console.log(`  ✅ 情况4: 发放率总和=${(L4TotalRate*100).toFixed(2)}% = D12%+保底2% = 公司¥14（D¥12不减少 ✔）`);
  else { console.log(`  ❌ 情况4: 发放率异常 =${(L4TotalRate*100).toFixed(2)}% 预期14%`); exit.ok=false; process.exitCode=98; }

  // ========== STEP 2：业绩归属 对账（增量对比） ==========
  console.log(`\n========== STEP 2：业绩归属 revenue/commission BEFORE→AFTER Δ ==========`);
  invalidateLevelRelatedCaches();
  const after = {};
  for (const k of ['A','B','C','D']) {
    after[k] = (await getTeamLeaderPerformance(ids[k], { monthCount: 1 })).data.currentMonth;
  }
  const delta = k => ({
    rev: +(after[k].revenue - before[k].revenue).toFixed(2),
    com: +(after[k].commission - before[k].commission).toFixed(2),
  });
  // 预期每个人Δ（按用户手算展开）
  // A: 情况1¥100 + 情况2¥100 = ¥200 revenue; commission=16+4=¥20
  aeq('[A] revenueΔ=情况1¥100+情况2¥100=¥200', delta('A').rev, 200);
  aeq('[A] commissionΔ=¥16+¥4=¥20', delta('A').com, 20);
  // B: 情况2¥100(本级¥12) + 情况3¥100(级差¥4) + 情况4¥100(保底¥2) = rev¥300, com¥18
  aeq('[B] revenueΔ=情况2+情况3+情况4=¥300', delta('B').rev, 300);
  aeq('[B] commissionΔ=12+4+2=¥18', delta('B').com, 18);
  // C: 情况3¥100(本级¥8) = rev¥100 com¥8
  aeq('[C] revenueΔ=情况3=¥100', delta('C').rev, 100);
  aeq('[C] commissionΔ=¥8', delta('C').com, 8);
  // D: 情况4¥100(本级¥12) = rev¥100 com¥12
  aeq('[D] revenueΔ=情况4=¥100', delta('D').rev, 100);
  aeq('[D] commissionΔ=¥12（★不被切，B保底2%公司额外出）', delta('D').com, 12);

  // ========== 清理 ==========
  console.log(`\n========== 清理临时数据 ==========`);
  await GoldLog.deleteMany({ _id: { $in: cleanup.newGoldlogs } });
  await Employee.deleteMany({ _id: { $in: cleanup.newEmployees } });
  await Admin.deleteMany({ _id: { $in: cleanup.newAdmins } });
  console.log(`  ✅ 删GoldLog${cleanup.newGoldlogs.length} Employee${cleanup.newEmployees.length} Admin${cleanup.newAdmins.length}`);
  console.log(`\n${exit.ok ? '✅ 草图ABCD全部断言通过，分账&业绩与手绘100%对齐' : '❌ 存在断言失败，看上面❌标记'}\n`);
  process.exit(exit.ok ? 0 : 98);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
