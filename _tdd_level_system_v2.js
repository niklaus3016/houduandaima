/* eslint-disable no-console */
/**
 * TDD RED：职级体系 v2（统一8档 + 懒触发晋升 + 手动调档）
 * 预期：全部 FAIL（因为新体系代码还没改）
 */
const mongoose = require('mongoose');
require('./models/Admin');
require('./models/TeamGroup');
require('./models/Employee');
require('./models/GoldLog');

const MONGO = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';
const BASE = 'http://127.0.0.1:3003'; // HTTP 接口端口（登录/配置/调档）

const Admin = mongoose.model('Admin');
const TeamGroup = mongoose.model('TeamGroup');
const Employee = mongoose.model('Employee');
const GoldLog = mongoose.model('GoldLog');

// --- 统计 ---
const FAILS = [];
const T = (name, cond, extra = '') => {
  cond ? console.log('  ✅ ' + name) : console.log('  ❌ ' + name + ' → ' + extra);
  if (!cond) FAILS.push({ name, extra });
};
const req = (path, opt = {}) => fetch(BASE + path, {
  method: opt.method || 'GET',
  headers: { 'Content-Type': 'application/json', ...(opt.headers || {}) },
  ...(opt.body ? { body: JSON.stringify(opt.body) } : {})
}).then(async r => ({ status: r.status, data: await r.json().catch(() => null) }));
function approxEq(a, b, eps = 1e-4) { return Math.abs((+a || 0) - (+b || 0)) <= eps; }

// --- 北京时间工具（与生产一致）---
function getYesterdayTime() {
  const d = new Date(); d.setUTCHours(d.getUTCHours() + 8); d.setUTCDate(d.getUTCDate() - 1);
  d.setUTCHours(12, 30, 0, 0); return d.getTime();
}

(async () => {
  console.log('========= 【RED】职级 v2 新体系 TDD（应全部 FAIL） =========\n');
  await mongoose.connect(MONGO);

  // ===== P0 登录 + 超管 token =====
  console.log('--- P0 登录 ---');
  const rootLogin = await req('/api/admin/login', { method: 'POST', body: { username: 'admin', password: 'admin123456' } });
  const rt = rootLogin.data?.data?.token || rootLogin.data?.token;
  T('P0-1 超管token', !!rt, 'token=' + rt?.slice?.(0, 6));
  // 把 CuiDing 升级到 TL role，否则晋升接口因上级不是NORMAL_ADMIN被拒（CuiDing 是老体系 GROUP_LEADER）
  let cui = await Admin.findOne({ username: 'CuiDing' }).select('_id username role commission').lean();
  if (!cui) cui = await Admin.findOne({ username: 'cuiding' }).select('_id username role commission').lean();
  if (cui && String(cui.role || '').toUpperCase() !== 'NORMAL_ADMIN') {
    await Admin.findByIdAndUpdate(cui._id, { $set: { role: 'NORMAL_ADMIN', commission: 0.08 } }); // P2 档即可作为上级TL
    cui = await Admin.findById(cui._id).select('_id username role commission').lean();
    console.log('    (已将 CuiDing 调整为 TL role)');
  }

  // ===== P1 新职级配置表：8档（不走HTTP，直接本地调函数，避免 3003 老进程未重启导致 404）=====
  console.log('\n--- P1 新8档配置保存/回读 ---');
  const NEW_CFG = {
    levels: [
      { level: 'P1', minRevenue: 0,     commission: 0.06, role: 'GROUP_LEADER' },
      { level: 'P2', minRevenue: 30000,   commission: 0.08, role: 'NORMAL_ADMIN' },
      { level: 'P3', minRevenue: 100000,  commission: 0.10, role: 'NORMAL_ADMIN' },
      { level: 'P4', minRevenue: 200000,  commission: 0.12, role: 'NORMAL_ADMIN' },
      { level: 'P5', minRevenue: 500000,  commission: 0.14, role: 'NORMAL_ADMIN' },
      { level: 'P6', minRevenue: 1000000, commission: 0.16, role: 'NORMAL_ADMIN' },
      { level: 'P7', minRevenue: 2000000, commission: 0.18, role: 'NORMAL_ADMIN' },
      { level: 'P8', minRevenue: 3000000, commission: 0.20, role: 'NORMAL_ADMIN' },
    ]
  };
  const { saveLevelConfigV2, getLevelConfigV2, setAdminManualLevelLocal, computeLevel } = require('./routes/verification');
  let cfgSaved = null;
  try {
    cfgSaved = await saveLevelConfigV2(NEW_CFG.levels, 'tdd_superadmin');
  } catch (e) { console.log('  save err:', e.message); }
  T('P1-1 保存新8档配置（本地函数成功）', !!cfgSaved && Array.isArray(cfgSaved.list) && cfgSaved.list.length === 8,
    'saved=' + JSON.stringify(cfgSaved?.list?.length));
  const cfgGot = await getLevelConfigV2();
  T('P1-2 读取配置 P1 commission≈6%', approxEq(cfgGot.list?.[0]?.commission, 0.06),
    'P1 actual=' + cfgGot.list?.[0]?.commission);
  T('P1-3 读取配置 P8 commission≈20%', approxEq(cfgGot.list?.[7]?.commission, 0.20),
    'P8 actual=' + cfgGot.list?.[7]?.commission);
  T('P1-4 读取配置 P8 minRevenue=300万', (+cfgGot.list?.[7]?.minRevenue) === 3000000,
    'actual=' + cfgGot.list?.[7]?.minRevenue);
  // 顺便也调一次 HTTP，测接口可用（3003 老进程未重启可能 404，只记录不报错）
  try {
    const cfgSaveHTTP = await req('/api/admin/level-config/v2', {
      method: 'PUT', headers: { Authorization: 'Bearer ' + rt }, body: NEW_CFG
    });
    console.log('    （仅记录）HTTP PUT /level-config/v2 status=' + cfgSaveHTTP.status);
  } catch (_) {}

  // ===== P2 累计营收自动匹配档位（调用本地 computeLevel） =====
  console.log('\n--- P2 自动匹配档位（营收→档位） ---');
  // computeLevel 已在 P1 require 里解构到了
  const gl0 = await computeLevel(null, 0);
  T('P2-1 营收0 → P1 GROUP_LEADER', gl0?.level === 'P1' && gl0?.role === 'GROUP_LEADER',
    'actual=' + JSON.stringify(gl0));
  const tl5w = await computeLevel(null, 50000); // 5万→P2
  T('P2-2 营收5万 → P2 NORMAL_ADMIN', tl5w?.level === 'P2' && tl5w?.role === 'NORMAL_ADMIN',
    'actual=' + JSON.stringify(tl5w));
  const tl12w = await computeLevel(null, 120000); // 12万→P3
  T('P2-3 营收12万 → P3 TL 10%', approxEq(tl12w?.commission, 0.10) && tl12w?.level === 'P3',
    'actual=' + JSON.stringify(tl12w));
  const tl350w = await computeLevel(null, 3500000); // 350万→P8
  T('P2-4 营收350万 → P8 TL 20%', approxEq(tl350w?.commission, 0.20) && tl350w?.level === 'P8',
    'actual=' + JSON.stringify(tl350w));

  // ===== P3 懒触发晋升：查业绩自动升TL =====
  console.log('\n--- P3 懒触发晋升（营收达标→查业绩→自动变TL+迁员工）---');
  // （P0 已把 CuiDing 升级到 TL role，复用 cui 变量）
  // 造一个达标组长：老组+老G员工，累计营收15万（≥10万，应匹配P3 TL）
  const [lazyGl] = await Admin.create([{
    username: 'lazygl_' + Date.now(), nickname: '达标组长懒晋升', password: 'x',
    role: 'GROUP_LEADER', parentTlId: null, commission: 0.06
  }]);
  const [lazyGroup] = await TeamGroup.create([{
    groupName: '懒晋升测试组_' + Date.now(), teamName: '懒晋升战队_v2',
    groupLeaderId: lazyGl._id.toString(),
    teamLeaderId: cui?._id?.toString(), commission: 0.1, status: 'active'
  }]);
  await Admin.findByIdAndUpdate(lazyGl._id, { $set: { teamGroupId: lazyGroup._id.toString() } });
  const [lazyEmp] = await Employee.create([{
    employeeId: 'lazyG_' + Date.now(), teamGroupId: lazyGroup._id.toString(),
    parentId: lazyGl._id.toString(), nickname: '懒G员工'
  }]);
  // 触发懒晋升：调 computeLevel（totalRevenue=15万≥3万→P2 TL，role=GROUP_LEADER→懒触发晋升事务）
  try {
    const matched = await computeLevel(lazyGl._id.toString(), 150000);
    console.log('    P3 computeLevel result:', matched ? (matched.level + '/' + matched.role) : 'null');
  } catch (e) { console.log('    P3 computeLevel err:', e.message); }
  // 验证懒晋升生效
  const lazyAfter = await Admin.findById(lazyGl._id).select('role parentTlId commission teamGroupId').lean();
  T('P3-1 懒晋升→role=NORMAL_ADMIN', lazyAfter.role === 'NORMAL_ADMIN',
    'actual role=' + lazyAfter.role);
  T('P3-2 懒晋升→parentTlId = cui._id（上级TL）', lazyAfter.parentTlId === cui?._id?.toString(),
    'actual parentTlId=' + lazyAfter.parentTlId);
  const lazyEmpAfter = await Employee.findById(lazyEmp._id).select('teamGroupId parentId').lean();
  T('P3-3 懒晋升→老员工迁为D（teamGroupId=null）', !lazyEmpAfter.teamGroupId,
    'actual teamGroupId=' + lazyEmpAfter.teamGroupId);
  const lazyGroupAfter = await TeamGroup.findById(lazyGroup._id).select('status dissolvedAt').lean();
  T('P3-4 懒晋升→老组 disbanded', lazyGroupAfter.status === 'disbanded',
    'actual status=' + lazyGroupAfter.status);

  // ===== P4 手动调档（本地函数 setAdminManualLevelLocal 为主，HTTP 为辅）=====
  console.log('\n--- P4 手动调档：PUT /api/admin/:id/manual-level（本地函数为主） ---');
  // 先造一个普通 P1 组长
  const [mGl] = await Admin.create([{
    username: 'mgl_' + Date.now(), nickname: '手动调P1', password: 'x',
    role: 'GROUP_LEADER', commission: 0.06, parentTlId: null
  }]);
  // P4-1 手动调到 P7（跨级→应自动晋升TL，manualLevel=P7，commission=18%）
  let toP7 = null, toP7HTTP = null;
  try { toP7 = await setAdminManualLevelLocal(mGl._id.toString(), 'P7', 'tdd_super'); } catch (e) { toP7 = { err: e.message, code: e.code }; }
  T('P4-1 手动调 P1→P7（本地函数成功）', toP7 && !toP7.err && approxEq(toP7.newCommission, 0.18),
    'actual=' + JSON.stringify(toP7));
  // 顺带试一下 HTTP（3003 若未重启可能404，只记录）
  try {
    toP7HTTP = await req('/api/admin/' + mGl._id + '/manual-level', {
      method: 'PUT', headers: { Authorization: 'Bearer ' + rt }, body: { level: 'P7' }
    });
    console.log('    （仅记录）HTTP PUT manual-level status=' + (toP7HTTP?.status || 'X'));
  } catch (_) {}
  const mP7 = await Admin.findById(mGl._id).select('role manualLevel commission').lean();
  T('P4-2 role → NORMAL_ADMIN', mP7.role === 'NORMAL_ADMIN', 'actual role=' + mP7.role);
  T('P4-3 manualLevel = P7', mP7.manualLevel === 'P7', 'actual=' + mP7.manualLevel);
  T('P4-4 commission = 18%', approxEq(mP7.commission, 0.18), 'actual=' + mP7.commission);

  // P4-5 禁止TL降回组长P1（本地函数抛错 code=400）
  let toP1Fail = null;
  try {
    await setAdminManualLevelLocal(mGl._id.toString(), 'P1', 'tdd_super');
    toP1Fail = { code: 200 };
  } catch (e) { toP1Fail = { code: e.code, message: e.message }; }
  T('P4-5 TL 调P1被拒（code 400）', toP1Fail.code === 400, 'actual code=' + toP1Fail.code);
  const mp1After = await Admin.findById(mGl._id).select('role manualLevel').lean();
  T('P4-6 拒后 role 不变 TL', mp1After.role === 'NORMAL_ADMIN', 'actual role=' + mp1After.role);
  T('P4-7 拒后 manualLevel 仍为 P7', mp1After.manualLevel === 'P7', 'actual=' + mp1After.manualLevel);
  // P4-8 TL 最低调 P2 → 成功
  let toP2 = null;
  try { toP2 = await setAdminManualLevelLocal(mGl._id.toString(), 'P2', 'tdd_super'); } catch (e) { toP2 = { err: e.message }; }
  T('P4-8 TL 调P2 成功', toP2 && !toP2.err, 'actual=' + JSON.stringify(toP2));
  const mP2 = await Admin.findById(mGl._id).select('manualLevel commission').lean();
  T('P4-9 TL调P2后 commission=8%', approxEq(mP2.commission, 0.08), 'actual=' + mP2.commission);

  // ===== P5 历史不追溯：调档前后订单比例不变 =====
  console.log('\n--- P5 历史不追溯（调档前后订单比例固化）---');
  // 先造 P1 组长员工
  const [hGl] = await Admin.create([{
    username: 'hgl_' + Date.now(), nickname: '历史追溯组长', password: 'x',
    role: 'GROUP_LEADER', commission: 0.06, manualLevel: null
  }]);
  const [hGroup] = await TeamGroup.create([{
    groupName: '历史追溯组_' + Date.now(), teamName: '历史追溯战队_v2',
    groupLeaderId: hGl._id.toString(),
    teamLeaderId: cui?._id?.toString(), commission: 0.1, status: 'active'
  }]);
  await Admin.findByIdAndUpdate(hGl._id, { $set: { teamGroupId: hGroup._id.toString() } });
  const [hEmp] = await Employee.create([{
    employeeId: 'hG_' + Date.now(), teamGroupId: hGroup._id.toString(),
    parentId: hGl._id.toString(), nickname: '历史G员工'
  }]);
  // P5-1 调档前订单：commissionRate=6%（组长P1）
  const yt2 = getYesterdayTime();
  const g1 = await new GoldLog({ userId: 'tdd_hist1_' + Date.now(), employeeId: hEmp.employeeId,
    gold: 100 * 1000, createTime: yt2, title: '调档前订单（P1）' }).save();
  T('P5-1 调档前 commissionRate ≈ 6%', approxEq(g1.commissionRate, 0.06),
    'actual=' + g1.commissionRate);
  // P5-2 手动调为 P3 → 10%（注意：P3 是 TL 档，所以 hGl 会被晋升为 TL，老组解散，hEmp 变成 D员工，
  //   那么之后的 G员工路径走不到了？因为 hEmp.teamGroupId 变成 null。我们需要在 P3 调档后重新建组和员工，
  //   作为新 TL hGl 下面的组长旗下 G员工？简化：断言调档后新订单 commissionRate 已变化（或直接断言 hGl.role=NORMAL_ADMIN，G员工无组了则 fallback））
  //   或者，我们用另一个组（不跨角色晋升）：hGl 调到 P1（仍为组长），但 P1 是 6%，没法变到 10%。换一个方式：
  //   直接把 hGl.manualLevel 设 P1 但手动改 commission 到 0.10（直接 Admin.findByIdAndUpdate），模拟「手动调 P1 但调比例」不现实，P1 只有 6%。
  //   简化版：P5-2 不用 PUT HTTP，用本地 setAdminManualLevelLocal；晋升后 hEmp 变 D 员工，D 员工 commissionRate=0。
  //   我们要断言调档前的订单 g1.commissionRate=6%，调档后的新订单（哪怕是 D 员工模式）g2.tlCommissionRate = 对应档位值，
  //   且旧订单 g1.commissionRate 固化不变。
  try {
    await setAdminManualLevelLocal(hGl._id.toString(), 'P3', 'tdd_super'); // 调 P3=TL，晋升事务触发
  } catch (e) { console.log('  P5-2 调P3（本地函数）err:', e.message); }
  // P5-3 调档后新订单：hEmp 已迁为 D员工（teamGroupId=null，parentId=hGl._id，hGl.role=NORMAL_ADMIN），
  //   所以 D 员工路径 commissionRate=0，tlCommissionRate=hGl.commission（P3=10%）
  const g2 = await new GoldLog({ userId: 'tdd_hist2_' + Date.now(), employeeId: hEmp.employeeId,
    gold: 100 * 1000, createTime: yt2 + 1000, title: '调档后订单（P3 D员工）' }).save();
  T('P5-3 调档后 D员工 tlCommissionRate = 10%（P3 TL）', approxEq(g2.tlCommissionRate, 0.10),
    'actual tlCommissionRate=' + g2.tlCommissionRate + ', role=' + hGl.role);
  // P5-4 查回旧订单比例 仍=6%（G员工老订单 commissionRate 固化为 6%，不追溯）
  const g1Back = await GoldLog.findById(g1._id).select('commissionRate tlCommissionRate').lean();
  T('P5-4 旧订单 commissionRate 仍=6%（不追溯）', approxEq(g1Back.commissionRate, 0.06),
    'actual=' + g1Back.commissionRate);

  // ===== 汇总 =====
  console.log('\n================= TDD 汇总 =================');
  console.log('FAIL 数：' + FAILS.length);
  if (FAILS.length) FAILS.forEach(f => console.log('  ❌ ' + f.name + ' | ' + f.extra));
  await mongoose.disconnect();
  process.exit(FAILS.length ? 1 : 0);
})().catch(e => { console.error('CRASH:', e); process.exit(2); });
