// 🔴 RED TDD：业绩按钮详情后端兼容改造 - 6个断言（先全fail再改）
//
// T1: cuiding看fanjie(NORMAL_ADMIN sub TL)走 /group-leader/performance?userId=fanId → 200 & 结构&数据 = team-leader接口同参数
// T2: cuiding看zhouhuan(GROUP_LEADER)走原接口 → 200 & 数据不变（零回归）
// T3: groups接口直推虚拟组 groupLeaderId 字段 → = cuiding._id（不是null）
// T4: zhouhuan GL 自看 /group-leader/performance 不传 userId → 200（零回归）
// T5: fanjie(NORMAL_ADMIN下属TL) 看 cuiding 详情 → 403（不是递归上级，权限拦）（兼容NORMAL_ADMIN后必须有新权限逻辑）
// T6: superadmin 看 fanjie(NORMAL_ADMIN) 详情 → 200 放行
const mongoose = require('mongoose');
require('./models/Admin'); require('./models/Employee'); require('./models/TeamGroup'); require('./models/GoldLog');
require('./models/TeamLeaderLevelConfig'); require('./models/UserGold'); require('./models/UserActivity');
require('./models/Team'); require('./models/LoginRecord'); require('./models/GroupLeaderLevelConfig');
const v = require('./routes/verification');
const emp = require('./routes/employeeManage');
const MONGO = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

let pass=0,fail=0;
function check(c,name,d=''){ if(c){pass++;console.log('  ✅ PASS  ',name,d?' ['+d+']':'');} else{fail++;console.log('  ❌ FAIL  ',name,d?' ['+d+']':'');} }

async function runGLP(q, u){
  const route = v.stack.find(l => l.route && l.route.path === '/group-leader/performance' && l.route.methods.get);
  const handler = route.route.stack.slice(-1)[0].handle;
  return await new Promise(res2 => {
    let s=200;
    const res = { status(x){s=x;return this;}, json(o){res2({status:s, body:o}); return this;} };
    try {
      const req = { query: q, user: u };
      const p = handler(req, res, err => res2({status:s, body:null, err:err?.stack||String(err)}));
      if (p?.catch) p.catch(err => res2({status:s, body:null, err:err.stack||String(err)}));
    } catch(e){ res2({status:s, body:null, err:e.stack||String(e)}); }
  });
}
async function runTLP(q,u){
  const route = v.stack.find(l => l.route && l.route.path === '/team-leader/performance' && l.route.methods.get);
  const handler = route.route.stack.slice(-1)[0].handle;
  return await new Promise(res2 => {
    let s=200;
    const res = { status(x){s=x;return this;}, json(o){res2({status:s, body:o}); return this;} };
    try {
      const req = { query: q, user: u };
      const p = handler(req, res, err => res2({status:s, body:null, err:err?.stack||String(err)}));
      if (p?.catch) p.catch(err => res2({status:s, body:null, err:err.stack||String(err)}));
    } catch(e){ res2({status:s, body:null, err:e.stack||String(e)}); }
  });
}
async function runGroups(q,u){
  const route = emp.stack.find(l => l.route && l.route.path === '/team-leader/groups' && l.route.methods.get);
  const handler = route.route.stack.slice(-1)[0].handle;
  return await new Promise(res2 => {
    let s=200;
    const res = { status(x){s=x;return this;}, json(o){res2({status:s, body:o}); return this;} };
    try {
      const req = { query: q, user: u };
      const p = handler(req, res, err => res2({status:s, body:null, err:err?.stack||String(err)}));
      if (p?.catch) p.catch(err => res2({status:s, body:null, err:err.stack||String(err)}));
    } catch(e){ res2({status:s, body:null, err:e.stack||String(e)}); }
  });
}

(async () => {
  await mongoose.connect(MONGO,{});
  const Admin = mongoose.model('Admin');
  const cui = await Admin.findOne({username:'cuiding'}).select('_id username role').lean();
  const fan = await Admin.findOne({username:'fanjie'}).select('_id username role').lean();
  const zh  = await Admin.findOne({username:'zhouhuan'}).select('_id username role').lean();
  const cuiId=String(cui._id), fanId=String(fan._id), zhId=String(zh._id);

  console.log('\n====== RED TDD 启动 ======');
  console.log('IDs: cui='+cuiId.slice(-6), 'fan='+fanId.slice(-6), 'zhouhuan='+zhId.slice(-6));

  // ======== T1: cuiding 看 fanjie 详情走 group-leader接口 ========
  console.log('\n--- T1: cuiding (NORMAL_ADMIN) 调 /group-leader/performance?userId=fanjieId(NORMAL_ADMIN sub TL) ---');
  const t1_glp = await runGLP({ userId: fanId }, { id: cuiId, role: 'NORMAL_ADMIN' });
  const t1_tlp = await runTLP({ userId: fanId }, { id: cuiId, role: 'NORMAL_ADMIN' });
  console.log('GLP status=', t1_glp.status, ' msg=', t1_glp.body?.message||t1_glp.body?.msg||'');
  console.log('TLP (基准) status=', t1_tlp.status, ' totalRevenue=', t1_tlp.body?.data?.totalRevenue ?? t1_tlp.body?.data?.summary?.totalRevenue);
  check(t1_glp.status === 200, 'T1-a GLP 200 OK', 'actual='+t1_glp.status);
  const t1_glpData = t1_glp.body?.data;
  const t1_tlpData = t1_tlp.body?.data;
  const hasT1Structure = t1_glpData && ['summary','monthly','daily','level','levelConfig'].every(k => k in t1_glpData);
  check(hasT1Structure, 'T1-b GLP返回 summary/monthly/daily/level/levelConfig 全字段', 'keys=' + Object.keys(t1_glpData||{}).join(','));
  const t1_glpRev = t1_glpData?.totalRevenue ?? t1_glpData?.summary?.totalRevenue;
  const t1_tlpRev = t1_tlpData?.totalRevenue ?? t1_tlpData?.summary?.totalRevenue;
  check(!!t1_glpRev && Math.abs(Number(t1_glpRev)-Number(t1_tlpRev))/Math.max(1,Number(t1_tlpRev)) < 0.01,
    'T1-c GLP 总业绩=team-leader接口同参数（1%误差内）',
    'GLP=¥'+t1_glpRev+' TLP=¥'+t1_tlpRev);

  // ======== T2: zhouhuan GL 详情零回归 ========
  console.log('\n--- T2: cuiding看zhouhuan(GL)走/group-leader/performance?userId=zhouhuanId（零回归）---');
  const t2a = await runGLP({ userId: zhId }, { id: cuiId, role: 'NORMAL_ADMIN' });
  console.log('status=',t2a.status,' level=',t2a.body?.data?.level?.currentLevel??t2a.body?.data?.level,' rev=',
    t2a.body?.data?.summary?.totalRevenue??t2a.body?.data?.totalRevenue);
  check(t2a.status===200,'T2-a 200 OK','actual='+t2a.status);
  check(
    (t2a.body?.data?.level?.currentLevel ?? t2a.body?.data?.level) === 'P1',
    'T2-b zhouhuan职级仍为P1（零回归，没被NORMAL_ADMIN逻辑误转）',
    'actual=' + (t2a.body?.data?.level?.currentLevel ?? t2a.body?.data?.level)
  );

  // ======== T3: groups 直推虚拟组 groupLeaderId = cuiId ========
  console.log('\n--- T3: groups接口cuiding直推虚拟组groupLeaderId字段 === cuiId（B2按钮跳转负责人详情）---');
  const t3g = await runGroups({ teamId: cuiId, range: 'today' }, { id: cuiId, role: 'NORMAL_ADMIN' });
  const t3list = t3g.body?.data || [];
  const cuiVir = t3list.find(g => g.kind === 'direct_members' && g.teamLevel === 'own');
  console.log('直推虚拟组groupLeaderId=', cuiVir?.groupLeaderId, ' 期望=', cuiId);
  console.log('列表中各组 groupLeaderId 一览:');
  t3list.forEach(g => console.log('  · '+(g.groupName||'').padEnd(14),
    'kind='+(g.kind||'').padEnd(14),
    'teamLevel='+(g.teamLevel||'').padEnd(5),
    'groupLeaderId=' + (g.groupLeaderId? String(g.groupLeaderId).slice(-6)+'…' : 'NULL')));
  check(!!cuiVir, 'T3-a 找到 cui直推虚拟组 (kind=direct_members teamLevel=own)', 'groups数='+t3list.length);
  check(cuiVir?.groupLeaderId && String(cuiVir.groupLeaderId) === cuiId,
    'T3-b 直推虚拟组 groupLeaderId = cuiId（前端传userId用）',
    'actual=' + (cuiVir?.groupLeaderId ? String(cuiVir.groupLeaderId) : 'null'));

  // ======== T4: GL zhouhuan 自看 /group-leader/performance 不传 userId ========
  console.log('\n--- T4: zhouhuan (GL) 自看 /group-leader/performance 不传userId（零回归）---');
  const t4 = await runGLP({}, { id: zhId, role: 'GROUP_LEADER' });
  console.log('status=', t4.status, ' msg=', t4.body?.message||t4.body?.msg||'');
  check(t4.status === 200, 'T4-a 自看200 OK','actual='+t4.status);
  check(t4.body?.data?.summary?.totalRevenue || t4.body?.data?.totalRevenue,
    'T4-b 自看返回业绩数据非空', 'rev=' + (t4.body?.data?.summary?.totalRevenue ?? t4.body?.data?.totalRevenue));

  // ======== T5: fanjie(NORMAL_ADMIN下属TL) 越权看 cuiding 详情 → 403 ========
  console.log('\n--- T5: fanjie(NORMAL_ADMIN sub TL) 调 /group-leader/performance?userId=cuiId → 403（非递归上级）---');
  const t5 = await runGLP({ userId: cuiId }, { id: fanId, role: 'NORMAL_ADMIN' });
  console.log('status=', t5.status, ' msg=', t5.body?.message||t5.body?.msg||'');
  check(t5.status === 403, 'T5 fanjie看cuiding=403（兼容NORMAL_ADMIN后必须新增权限判断，不能因为兼容就放行了）','actual='+t5.status);

  // ======== T6: SA 看 fanjie(NORMAL_ADMIN) → 200 ========
  console.log('\n--- T6: superadmin 调 /group-leader/performance?userId=fanjieId → 200 放行 ---');
  const t6 = await runGLP({ userId: fanId }, { id: 'superAdminId', role: 'superadmin' });
  console.log('status=', t6.status, ' msg=', t6.body?.message||t6.body?.msg||'');
  check(t6.status === 200, 'T6 SA看fanjie=200 OK','actual='+t6.status);
  check(t6.body?.data?.summary?.totalRevenue || t6.body?.data?.totalRevenue,
    'T6-b 返回fanjie真实业绩数据（非空）','rev='+(t6.body?.data?.summary?.totalRevenue ?? t6.body?.data?.totalRevenue));

  console.log('\n========== 总结 RED ==========');
  console.log('PASS=', pass, ' FAIL=', fail);
  await mongoose.disconnect();
  if (fail>0){ console.log('🔴 RED阶段：全部预期应fail的T1/T3/T5/T6需fail（缺功能），T2/T4保持OK（零回归）'); process.exit(0); }
  else { console.log('⚠️ 全绿=TDD未触发fail：要么已实现要么测试写错'); process.exit(2); }
})().catch(e=>{console.error('CRASH:',e.stack||e);process.exit(3)});
