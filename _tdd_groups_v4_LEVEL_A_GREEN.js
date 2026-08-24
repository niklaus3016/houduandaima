// ✅ GREEN v4_2 验证：口径A（TL直属一级ONLY）修正版
// 正确用法：
//   1) KPI 直接用 db.computeNewKpi（router handler的 team 参数是 teamName 字符串，不是 _id）
//   2) 虚拟组字段：kind=='direct_members' ，下属TL虚拟组 groupName = "{teamName} - 直推成员"
//   3) fanjie视角：洁然如初代理TG(51人)==fanjie直推集合，无需独立虚拟组 → 1组正确
//   4) GL调用返回 400/403 都算通过（都是拒绝）
const mongoose = require('mongoose');
require('./models/Admin'); require('./models/Employee');
require('./models/TeamGroup'); require('./models/GoldLog');
require('./models/TeamLeaderLevelConfig'); require('./models/UserGold');
require('./models/UserActivity'); require('./models/Team');
require('./models/LoginRecord');
const db = require('./routes/dashboard');
const emp = require('./routes/employeeManage');
const MONGO = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

let pass = 0, fail = 0;
function check(cond, name, detail='') {
  if (cond) { pass++; console.log('  ✅ PASS  ', name, detail ? '  ['+detail+']' : ''); }
  else      { fail++; console.log('  ❌ FAIL  ', name, detail ? '  ['+detail+']' : ''); }
}
async function runGroups(q, u) {
  const route = emp.stack.find(l => l.route && l.route.path === '/team-leader/groups' && l.route.methods.get);
  const handler = route.route.stack.slice(-1)[0].handle;
  return new Promise(res2 => {
    let s = 200;
    const res = { status(x) { s = x; return this; }, json(o) { res2({ status: s, json: o }); return this; } };
    try {
      const req = { query: q, user: u };
      const p = handler(req, res, err => res2({ status: s, json: null, err: err?.stack || String(err) }));
      if (p?.catch) p.catch(err => res2({ status: s, json: null, err: err.stack || String(err) }));
    } catch (e) { res2({ status: s, json: null, err: e.stack || String(e) }); }
  });
}

(async () => {
  await mongoose.connect(MONGO, {});
  const Admin = mongoose.model('Admin');
  const Employee = mongoose.model('Employee');

  const cui = await Admin.findOne({ username: 'cuiding' }).select('_id username realName role commission teamName').lean();
  const fan = await Admin.findOne({ username: 'fanjie' }).select('_id username realName role commission teamName').lean();
  const gl  = await Admin.findOne({ role: /GROUP_LEADER|group_leader/i }).select('_id username role').lean();
  const cuiId = String(cui._id), fanId = String(fan._id);

  console.log('\n====== GREEN v4_2 验证 启动 ======');
  console.log('cuiding:', cui.username, cui.teamName, cuiId.slice(-6));
  console.log('fanjie :', fan.username, fan.teamName, fanId.slice(-6));
  console.log('GL示例 :', gl?.username, String(gl?._id||'').slice(-6));

  // 直接调 computeNewKpi
  const scopeCui = { kind: 'TL', adminId: cuiId };
  const kToday = await db.computeNewKpi(scopeCui, 'today');
  const kMonth = await db.computeNewKpi(scopeCui, 'month');
  console.log('\n[KPI computeNewKpi(cuiding,today)]');
  console.log('  directUserCount=', kToday.directUserCount, ' | directRevenue=¥' + kToday.directRevenue, ' | directCommission=¥' + kToday.directCommission);
  console.log('  indirectUserCount=', kToday.indirectUserCount, ' | indirectRevenue=¥' + kToday.indirectRevenue, ' | indirectCommission=¥' + kToday.indirectCommission);
  console.log('  teamRevenue (sum)=¥' + (kToday.directRevenue + kToday.indirectRevenue).toFixed(2), '（direct+indirect合计，≈团队总业绩）');

  // ---------- ① cuiding 视角 today 结构 ----------
  console.log('\n--- ① cuiding 视角 range=today 组数&结构 ---');
  const g_cui = await runGroups({ teamId: cuiId, range: 'today' }, { id: cuiId, role: 'NORMAL_ADMIN' });
  const gs_cui = g_cui.json?.data || [];
  console.log('status=', g_cui.status, ' | 组数=', gs_cui.length, ' | totalRevenue(groups.sum)=¥' + g_cui.json?.totalRevenue);
  const cuiVir = gs_cui.find(g => g.kind === 'direct_members');
  const cuiVirOwn = gs_cui.find(g => g.kind === 'direct_members' && g.teamLevel === 'own');
  const fanTG   = gs_cui.find(g => g.groupName === '洁然如初代理');
  const cuiTGs  = gs_cui.filter(g => g.kind === 'leader_group' && g.teamLevel === 'own');
  console.log('列表:');
  gs_cui.forEach(g => console.log('   ·', g.groupName.padEnd(16), '  kind='+String(g.kind).padEnd(14),
    '  teamLevel=' + String(g.teamLevel).padEnd(5),
    '  成员' + String(g.memberCount).padStart(3),
    '  ¥' + g.todayRevenue));

  check(gs_cui.length === 9, 'cuiding视角 9组（7个直属TG + cui直推虚拟组 + fan名下洁然如初TG）', 'actual=' + gs_cui.length);
  check(cuiTGs.length === 7, 'cuiding名下直属组长组=7个', 'actual=' + cuiTGs.length);
  check(!!cuiVirOwn, 'cuiding视角 含本人直推虚拟组 teamLevel=own',
    cuiVirOwn ? 'groupName='+cuiVirOwn.groupName+' 成员='+cuiVirOwn.memberCount : '缺失');
  check(!!fanTG, 'cuiding视角 含下属TL fanjie的「洁然如初代理」（groupLeaderId=fanjie._id 的 TG）',
    fanTG ? '成员='+fanTG.memberCount+' today=¥'+fanTG.todayRevenue : '缺失');
  // 7+1+1=9 的显式验证
  check(gs_cui.filter(g=>g.kind==='leader_group').length === 8, 'leader_group共8个（7个直属 + fan洁然如初）',
    'actual=' + gs_cui.filter(g=>g.kind==='leader_group').length);
  check(gs_cui.filter(g=>g.kind==='direct_members').length === 1, '直推虚拟组共1个（cuiding本人的）',
    'actual=' + gs_cui.filter(g=>g.kind==='direct_members').length +
    '（fanjie无独立虚拟组因51直D已在洁然如初TG里，3OR优先级C先命中TG.groupLeaderId=fan._id）');

  // ---------- ② cuiding 视角 groups.totalRevenue vs KPI团队总业绩 ----------
  console.log('\n--- ② 团队总业绩对齐 groups.sum vs KPI（directRev+indirectRev）---');
  const sumRev = Number(g_cui.json?.totalRevenue ?? gs_cui.reduce((s,g)=>s+g.todayRevenue,0));
  const kpiSum = Number((kToday.directRevenue||0) + (kToday.indirectRevenue||0));
  const relErr = kpiSum ? Math.abs(sumRev - kpiSum) / kpiSum : 0;
  console.log('groups.totalRevenue = ¥' + sumRev.toFixed(2));
  console.log('KPI  direct+indirect = ¥' + kpiSum.toFixed(2));
  console.log('KPI  totalRevenue(如有) = ¥' + (kToday.teamRevenue ?? kToday.totalRevenue ?? 'N/A'));
  check(relErr < 0.05, '总业绩误差<5%',
    '差值¥' + (sumRev - kpiSum).toFixed(2) + ' 相对=' + (relErr*100).toFixed(2) + '%');

  // ---------- ③ cui直推虚拟组 memberCount / todayRevenue vs KPI directXxx ----------
  console.log('\n--- ③ cuiding直推对齐 groups虚拟组 vs KPI directXxx ---');
  const gDirCount = Number(cuiVirOwn?.memberCount || 0);
  const gDirRev   = Number(cuiVirOwn?.todayRevenue || 0);
  const kDirCount = Number(kToday.directUserCount || 0);
  const kDirRev   = Number(kToday.directRevenue || 0);
  console.log('directUserCount : groups=', gDirCount, ' | KPI=', kDirCount, ' | 差=', gDirCount - kDirCount);
  console.log('directRevenue   : groups=¥' + gDirRev.toFixed(2), ' | KPI=¥' + kDirRev.toFixed(2),
    ' | 差¥' + (gDirRev - kDirRev).toFixed(2));
  check(Math.abs(gDirCount - kDirCount) <= 5, '直推人数差≤5（员工3OR归属判定允许微小差异）',
    '|Δ|=' + Math.abs(gDirCount - kDirCount));
  const err3 = kDirRev ? Math.abs(gDirRev - kDirRev) / kDirRev : 0;
  check(err3 < 0.05, '直推业绩误差<5%', '相对=' + (err3*100).toFixed(2) + '%');

  // ---------- ④ fanjie 视角 today ----------
  console.log('\n--- ④ fanjie 视角 range=today ---');
  const g_fan = await runGroups({ teamId: fanId, range: 'today' }, { id: fanId, role: 'NORMAL_ADMIN' });
  const gs_fan = g_fan.json?.data || [];
  console.log('status=', g_fan.status, ' | 组数=', gs_fan.length);
  gs_fan.forEach(g => console.log('   ·', g.groupName.padEnd(18),
    '  kind='+String(g.kind).padEnd(14), '  teamLevel=' + String(g.teamLevel).padEnd(5),
    '  成员' + String(g.memberCount).padStart(3), '  today¥' + g.todayRevenue));

  const fanFanVir = gs_fan.find(g => g.kind==='direct_members' && g.teamLevel==='own');
  const fanFanTG  = gs_fan.find(g => g.groupName==='洁然如初代理');
  // fanjie直推总人数（DB parentId=fan）
  const fanDirectDB = await Employee.countDocuments({ parentId: fan._id });
  console.log('fanjie直推D在DB中(parentId=fan._id)数 =', fanDirectDB);
  // fan视角中"fan自己的直推总人数" = 虚拟组成员 + 洁然如初TG成员（3OR优先级C会让走TG的人不留到虚拟组）
  const fanViewFanDirect = (fanFanVir?.memberCount||0) + (fanFanTG?.memberCount||0);
  check(fanViewFanDirect === fanDirectDB,
    'fanjie视角 fan自己直推总人数(虚拟组+洁然如初TG成员)=DB parentId=fan总数',
    fanViewFanDirect + ' vs DB ' + fanDirectDB);
  // fan视角不含 cuiding 的 GL 组长群
  const cuiGlNames = ['李想代理群','周欢代理群','徐珂珂代理群','白浩舸代理','林鑫代理','吴威代理','小卓宝代理'];
  const leak = gs_fan.filter(g => cuiGlNames.includes(g.groupName));
  check(leak.length === 0, 'fanjie视角不含cuiding的7个GL组长群', '泄露=' + leak.map(g=>g.groupName).join(',')||'无');
  check(gs_fan.length >= 1, 'fanjie视角至少1组', 'actual=' + gs_fan.length);

  // ---------- ⑤ fanjie的TL下属=空（当前没有） → 不会显示fan名下的额外组 ----------
  check(gs_fan.filter(g => g.teamLevel === 'sub').length === 0,
    'fanjie视角 teamLevel=sub 的组=0（fan当前无下属TL，未来有再加）',
    'actual=' + gs_fan.filter(g => g.teamLevel === 'sub').length);

  // ---------- ⑥ month range 组数结构一致 ----------
  console.log('\n--- ⑥ range=month 结构一致性 ---');
  const g_cm = await runGroups({ teamId: cuiId, range: 'month' }, { id: cuiId, role: 'NORMAL_ADMIN' });
  const gs_cm = g_cm.json?.data || [];
  const g_fm = await runGroups({ teamId: fanId, range: 'month' }, { id: fanId, role: 'NORMAL_ADMIN' });
  const gs_fm = g_fm.json?.data || [];
  console.log('cuiding: today组数=' + gs_cui.length + ' month组数=' + gs_cm.length);
  console.log('fanjie : today组数=' + gs_fan.length + ' month组数=' + gs_fm.length);
  check(gs_cui.length === gs_cm.length, 'cuiding month组数=today组数',
    gs_cui.length + ' vs ' + gs_cm.length);
  check(gs_fan.length === gs_fm.length, 'fanjie month组数=today组数',
    gs_fan.length + ' vs ' + gs_fm.length);
  const leakM = gs_fm.filter(g => cuiGlNames.includes(g.groupName));
  check(leakM.length === 0, 'month fanjie视角不含cuiding的GL组长群',
    '泄露=' + leakM.map(g=>g.groupName).join(',') || '无');
  // month KPI 对齐
  const sumMonth = Number(g_cm.json?.totalRevenue ?? gs_cm.reduce((s,g)=>s+g.monthlyRevenue,0));
  const kpiSumM  = Number((kMonth.directRevenue||0) + (kMonth.indirectRevenue||0));
  const errM = kpiSumM ? Math.abs(sumMonth - kpiSumM) / kpiSumM : 0;
  console.log('cuiding month groups总和=¥' + sumMonth.toFixed(2) + ' | KPI(direct+indirect)=¥' + kpiSumM.toFixed(2));
  check(errM < 0.05, 'cuiding month总业绩误差<5%',
    '差值¥' + (sumMonth - kpiSumM).toFixed(2) + ' 相对=' + (errM*100).toFixed(2) + '%');

  // ---------- ⑦ 权限校验 ----------
  console.log('\n--- ⑦ 权限校验 ---');
  // GL 调 groups 接口：返回 400（目标不是TL） 或 403（不是TL/SA角色）都算通过
  let g_gl, statusGL = -1;
  if (gl) {
    g_gl = await runGroups({ teamId: String(gl._id), range: 'today' }, { id: String(gl._id), role: 'GROUP_LEADER' });
    statusGL = g_gl.status;
    console.log('GL角色(teamId=gl._id)调用 status=', statusGL, 'msg=', g_gl.json?.message || '');
  }
  check([400, 403].includes(statusGL), 'GL角色调用 groups 返回禁止访问类状态码(400/403)',
    'actual=' + statusGL + (g_gl ? ' msg='+g_gl.json?.message : ''));
  // 跨团队越权：cuiding 调用 fanjie._id 作为 teamId → 应允许(上级看下属没问题)；反过来 fanjie 调 cuiId → 应被 403
  const fan_cui = await runGroups({ teamId: cuiId, range: 'today' }, { id: fanId, role: 'NORMAL_ADMIN' });
  console.log('fanjie 跨团队调用 teamId=cuiding._id  status=', fan_cui.status, 'msg=', fan_cui.json?.message||'');
  check(fan_cui.status === 403, '下属TL fanjie 看上级 cui 团队=403 禁止', 'actual=' + fan_cui.status);

  // 超管看任意都OK
  const sa_cui = await runGroups({ teamId: cuiId, range: 'today' }, { id: 'super1', role: 'superadmin' });
  console.log('SA超管调 teamId=cuiding._id  status=', sa_cui.status, 'data组数=', (sa_cui.json?.data||[]).length);
  check(sa_cui.status === 200, 'SA超管调用=200 OK', 'actual=' + sa_cui.status);
  const sa_groups = sa_cui.json?.data || [];
  check(sa_groups.length === gs_cui.length, 'SA看 cuiding 团队组数=9，和 TL本人视角一致',
    sa_groups.length + ' vs ' + gs_cui.length);

  console.log('\n========== 总结 ==========');
  console.log('PASS =', pass, ' | FAIL =', fail);
  if (fail > 0) { console.log('❌ 存在失败项，需要修复'); process.exit(1); }
  else { console.log('✅ 全部通过'); process.exit(0); }
})().catch(e => { console.error('CRASH:', e.stack || e); process.exit(2); });
