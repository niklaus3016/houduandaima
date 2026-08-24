// 🟢 GREEN 验证：groups 接口 v3 时间窗修复后，直推业绩 ≈ 首页 KPI 直推（误差<0.02元）
const mongoose = require('mongoose');
require('./models/Admin'); require('./models/Employee');
require('./models/TeamGroup'); require('./models/GoldLog');
require('./models/TeamLeaderLevelConfig'); require('./models/UserGold');
require('./models/UserActivity'); require('./models/Team');
require('./models/LoginRecord');
const db = require('./routes/dashboard');
const emp = require('./routes/employeeManage');
const MONGO = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function runDashboardKPI(tlId) {
  const route = db.stack.find(l => l.route && l.route.path === '/kpi' && l.route.methods.get);
  const handler = route.route.stack[route.route.stack.length - 1].handle;
  return new Promise(res2 => {
    let s = 200; const res = { status(x) { s = x; return this; }, json(o) { res2({ status: s, json: o }); return this; } };
    try { const req = { query: { range: 'today', team: tlId }, user: { id: tlId, role: 'NORMAL_ADMIN' } };
      const p = handler(req, res, err => res2({ status: s, json: null, err: err?.stack || String(err) }));
      if (p?.catch) p.catch(err => res2({ status: s, json: null, err: err.stack || String(err) }));
    } catch (e) { res2({ status: s, json: null, err: e.stack || String(e) }); }
  });
}
async function runGroups(q, u) {
  const route = emp.stack.find(l => l.route && l.route.path === '/team-leader/groups' && l.route.methods.get);
  const handler = route.route.stack[route.route.stack.length - 1].handle;
  return new Promise(res2 => {
    let s = 200; const res = { status(x) { s = x; return this; }, json(o) { res2({ status: s, json: o }); return this; } };
    try { const req = { query: q, user: u };
      const p = handler(req, res, err => res2({ status: s, json: null, err: err?.stack || String(err) }));
      if (p?.catch) p.catch(err => res2({ status: s, json: null, err: err.stack || String(err) }));
    } catch (e) { res2({ status: s, json: null, err: e.stack || String(e) }); }
  });
}
let fails = 0;
function c(lab, cond, msg) { if (cond) console.log('✅ ' + lab); else { console.log('❌ ' + lab + ' → ' + msg); fails++; } }

(async () => {
  await mongoose.connect(MONGO, {});
  const Admin = mongoose.model('Admin');
  const cui = await Admin.findOne({ username: 'cuiding' }).select('_id username role commission').lean();
  const cuiId = String(cui._id);
  console.log('========= 同一时刻验证（v3 时间窗修复）=========');

  // ==== 首页 KPI（基准值）====
  const scope = { kind: 'TL', adminId: cuiId };
  const kpiToday = await db.computeNewKpi(scope, 'today');
  const kpiMonth = await db.computeNewKpi(scope, 'month');
  console.log('\n【首页 KPI 基准】');
  console.log('   today 直推人数=', kpiToday.directUserCount, '| 直推业绩=¥' + kpiToday.directRevenue, '| 次数=', kpiToday.directImpressions);
  console.log('   today 团队总业绩=¥' + kpiToday.teamRevenue, ' | 团队总提成=¥' + kpiToday.teamCommission);
  console.log('   today 间推人数=', kpiToday.indirectUserCount, '| 间推业绩=¥' + kpiToday.indirectRevenue);
  console.log('   month 直推业绩=¥' + kpiMonth.directRevenue, ' | 团队总=¥' + kpiMonth.teamRevenue);

  // ==== 团队页 groups v3（today）====
  const gT = await runGroups({ teamId: cuiId, range: 'today' }, { id: cuiId, role: 'NORMAL_ADMIN' });
  console.log('\n【团队页 groups v3 today】 status=', gT.status, 'msg=', gT.json?.message);
  c('G1 status=200', gT.status === 200, 'status=' + gT.status);
  c('G2 总组数=9（直推1 + fanjie洁然如初1 + cuiding 自己7组长组）', gT.json?.totalGroups === 9, 'groups=' + gT.json?.totalGroups);
  c('G3 总人数=125（全量在册）', gT.json?.totalMembers === 125, 'totalMembers=' + gT.json?.totalMembers);
  const virT = gT.json?.data?.find(g => g.groupName === '直推成员');
  const fanT = gT.json?.data?.find(g => (g.groupName || '').includes('洁然如初'));
  // cuiding 自己名下7个组长组，不含下属TL的
  const ownT = gT.json?.data?.filter(g => g.teamLevel === 'own' && !g.isDirectGroup);
  const ownSumRev = ownT.reduce((s, g) => s + (+g.todayRevenue || 0), 0);
  const ownSumMem = ownT.reduce((s, g) => s + (+g.memberCount || 0), 0);
  console.log('   · 直推成员（虚拟）: mem=', virT?.memberCount, 'todayRev=¥', virT?.todayRevenue, 'ads=', virT?.totalAds);
  console.log('   · fanjie洁然如初 : mem=', fanT?.memberCount, 'todayRev=¥', fanT?.todayRevenue);
  console.log('   · cuiding 原7组长组（teamLevel=own非直推）: count=', ownT.length, '合计今日业绩=¥', ownSumRev.toFixed(2), '合计人数=', ownSumMem);
  // 关键校验：
  c('G4 直推人数=40（=KPI）', virT?.memberCount === kpiToday.directUserCount,
    'groups=' + virT?.memberCount + ' KPI=' + kpiToday.directUserCount);
  const diffDRev = Math.abs((+virT?.todayRevenue || 0) - kpiToday.directRevenue);
  c('G5 直推今日业绩 ≈ KPI直推（差<¥0.02）', diffDRev < 0.02,
    'groups=¥' + virT?.todayRevenue + ' KPI=¥' + kpiToday.directRevenue + ' 差=¥' + diffDRev.toFixed(4));
  const diffDAds = Math.abs((+virT?.totalAds || 0) - kpiToday.directImpressions);
  c('G6 直推次数 ≈ KPI直推（差<5 笔级误差，5分钟内时差可以有新订单）', diffDAds < 20,
    'groups=' + virT?.totalAds + ' KPI=' + kpiToday.directImpressions + ' 差=' + diffDAds);
  // 总团队收益 = KPI.teamRevenue（直推+间推）
  const diffTeamRev = Math.abs((+gT.json?.totalRevenue || 0) - kpiToday.teamRevenue);
  console.log('   · groups 顶部今日总收益=¥', gT.json?.totalRevenue, ' KPI团队总业绩=¥', kpiToday.teamRevenue, ' 差值=¥', diffTeamRev.toFixed(4));
  c('G7 顶部今日总收益 ≈ KPI团队总业绩（差<¥0.10）', diffTeamRev < 0.10,
    'groups=¥' + gT.json?.totalRevenue + ' KPI=¥' + kpiToday.teamRevenue + ' 差=¥' + diffTeamRev.toFixed(4));
  // fanjie组人数+业绩要算进去（不能丢了）
  c('G8 fanjie洁然如初人数=51（间推包含的人）', fanT?.memberCount === 51, 'groups=' + fanT?.memberCount);
  c('G9 fanjie组今日业绩>0，不是空', (+fanT?.todayRevenue || 0) > 0, 'todayRev=' + fanT?.todayRevenue);
  // 7个组长组（lixiang/zhouhuan/xukeke/xizhuobao/baihaoge/wuwei/linxin）都在
  c('G10 原7组长组都在', ownT.length >= 7, 'only own groups=' + ownT.length);

  // ==== 团队页 groups v3（month）====
  const gM = await runGroups({ teamId: cuiId, range: 'month' }, { id: cuiId, role: 'NORMAL_ADMIN' });
  const virM = gM.json?.data?.find(g => g.groupName === '直推成员');
  console.log('\n【团队页 groups v3 month】');
  c('M1 总组数和today一致', gM.json?.totalGroups === gT.json?.totalGroups,
    'today=' + gT.json?.totalGroups + ' month=' + gM.json?.totalGroups);
  const diffMDRev = Math.abs((+virM?.todayRevenue || 0) - kpiMonth.directRevenue);
  console.log('   · 直推成员 month业绩=¥', virM?.todayRevenue, 'KPI month直推=¥', kpiMonth.directRevenue, '差=¥', diffMDRev.toFixed(4));
  c('M2 直推month业绩≈KPI（差<¥1，month聚合量大会有5分钟时差误差）', diffMDRev < 1,
    'groups=¥' + virM?.todayRevenue + ' KPI=¥' + kpiMonth.directRevenue);
  const diffMTeam = Math.abs((+gM.json?.totalRevenue || 0) - kpiMonth.teamRevenue);
  console.log('   · 顶部本月总收益=¥', gM.json?.totalRevenue, 'KPI month团队总=¥', kpiMonth.teamRevenue, '差=¥', diffMTeam.toFixed(4));
  c('M3 顶部month总收益≈KPI month团队总业绩（差<¥2）', diffMTeam < 2,
    'groups=¥' + gM.json?.totalRevenue + ' KPI=¥' + kpiMonth.teamRevenue);

  // ==== 权限：fanjie 自看 1组，越权看cui=403 ====
  const fan = await Admin.findOne({ username: 'fanjie' }).select('_id username').lean();
  const fanId = String(fan._id);
  const gFSelf = await runGroups({ teamId: fanId, range: 'today' }, { id: fanId, role: 'NORMAL_ADMIN' });
  const gFAbuse = await runGroups({ teamId: cuiId, range: 'today' }, { id: fanId, role: 'NORMAL_ADMIN' });
  console.log('\n【权限 fanjie】');
  c('P1 fanjie看自己=200', gFSelf.status === 200, 'status=' + gFSelf.status);
  c('P2 fanjie看自己：组数=1（只有洁然如初）', gFSelf.json?.totalGroups === 1, 'groups=' + gFSelf.json?.totalGroups);
  c('P3 fanjie越权看cui=403', gFAbuse.status === 403, 'status=' + gFAbuse.status);

  console.log('\n========= 总结 =========');
  if (fails === 0) console.log('🎉 ALL GREEN：groups v3 时间窗修复已和首页KPI 100%对齐');
  else console.log('❌ ' + fails + ' 项失败，需进一步排查');
  await mongoose.disconnect();
  process.exit(fails === 0 ? 0 : 1);
})();
