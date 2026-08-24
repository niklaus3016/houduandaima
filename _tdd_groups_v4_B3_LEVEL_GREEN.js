// TDD GREEN：/team-leader/groups v4_B3 新增 groupLeaderLevel / groupLeaderLevelManual 字段
// 复用 employeeManage route handler 直接调用
const mongoose = require('mongoose');
require('./models/Admin'); require('./models/Employee');
require('./models/TeamGroup'); require('./models/GoldLog');
require('./models/TeamLeaderLevelConfig'); require('./models/UserGold');
require('./models/UserActivity'); require('./models/Team');
require('./models/GroupLeaderLevelConfig');
const empRoute = require('./routes/employeeManage');
const MONGO = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';
let fails=0;
function c(lab,cond,msg){ if(cond) console.log('✅ '+lab); else { console.log('❌ '+lab+' → '+msg); fails++; } }

// employeeManage.js exports an Express Router with authMiddleware on the route.
// We need to BYPASS authMiddleware. The easiest way: directly invoke the handler fn
// from the stack, which is at [1] (after authMiddleware).
function findRoute(router, path, method) {
  for (const l of router.stack) {
    if (!l.route) continue;
    if (l.route.path !== path) continue;
    if (!l.route.methods[method]) continue;
    return l.route.stack;
  }
  return null;
}
async function runGroups(q, u) {
  const stack = findRoute(empRoute, '/team-leader/groups', 'get');
  if (!stack) { console.log('⚠️  找不到 route，try 路径是 /team-leader/groups'); return { status: 500, json: null }; }
  // stack[0] = authMiddleware, stack[1] = real async handler. 因为有 authMiddleware 包一层，直接调用第二个。
  const handler = stack[stack.length - 1].handle; // 最后一个就是真实的 router.get('', auth, handler) 里的 handler
  return new Promise(res2 => {
    let s=200;
    const res={ status(x){ s=x; return this; }, json(o){ res2({ status:s, json:o }); return this; } };
    // next() 跳过 authMiddleware（我们已跳过）
    try {
      const p = handler({ query:q, user:u }, res, err=>res2({ status:s, json:null, err:err?.stack||String(err) }));
      if (p?.catch) p.catch(err=>res2({ status:s, json:null, err:err.stack||String(err) }));
    } catch(e) { res2({ status:s, json:null, err:e.stack||String(e) }); }
  });
}

(async()=>{
  await mongoose.connect(MONGO,{});
  const Admin = mongoose.model('Admin');
  const cui = await Admin.findOne({ username:'cuiding' }).select('_id username realName role commission manualLevel manualLevelSetAt').lean();
  const fan = await Admin.findOne({ username:'fanjie' }).select('_id username realName role commission manualLevel manualLevelSetAt').lean();
  const sa  = await Admin.findOne({ role:/superadmin/i }).select('_id username role').lean();
  console.log('cuiding:', { id:String(cui._id).slice(-6), role:cui.role, comm:cui.commission, manual:cui.manualLevel });
  console.log('fanjie :', { id:String(fan._id).slice(-6), role:fan.role, comm:fan.commission, manual:fan.manualLevel });
  console.log('sa     :', { id:String(sa._id).slice(-6), role:sa.role });

  const TL_COMM = { '0.08':'P2','0.10':'P3','0.12':'P4','0.14':'P5','0.16':'P6','0.18':'P7','0.20':'P8' };
  function tlLevelByComm(comm) {
    const k = (+comm).toFixed(2);
    if (TL_COMM[k]) return TL_COMM[k];
    const v = +comm;
    if (v>=0.195) return 'P8'; if (v>=0.175) return 'P7'; if (v>=0.155) return 'P6'; if (v>=0.135) return 'P5';
    if (v>=0.115) return 'P4'; if (v>=0.095) return 'P3'; if (v>=0.075) return 'P2';
    return null;
  }
  const cuiLevelExp = tlLevelByComm(cui.commission);
  const fanLevelExp = tlLevelByComm(fan.commission);
  // 有手动档则用手动档
  function effectiveLevel(admin, auto) {
    if (admin.manualLevel) {
      const m = String(admin.manualLevel).trim().toUpperCase();
      if (['P2','P3','P4','P5','P6','P7','P8'].includes(m)) return m;
    }
    return auto;
  }
  const cuiManualExp = !!(cui.manualLevel && ['P2','P3','P4','P5','P6','P7','P8'].includes(String(cui.manualLevel).trim().toUpperCase()));
  const fanManualExp = !!(fan.manualLevel && ['P2','P3','P4','P5','P6','P7','P8'].includes(String(fan.manualLevel).trim().toUpperCase()));
  const cuiEffExp = effectiveLevel(cui, cuiLevelExp);
  const fanEffExp = effectiveLevel(fan, fanLevelExp);
  console.log(`期望 cuiding: level=${cuiEffExp} manual=${cuiManualExp}`);
  console.log(`期望 fanjie : level=${fanEffExp} manual=${fanManualExp}`);

  // 1. cuiding 视角 today
  console.log('\n========== 1. cuiding 视角 /team-leader/groups?teamId=cui&range=today ==========');
  const r1 = await runGroups({ teamId:String(cui._id), range:'today' }, { id:String(cui._id), role:'NORMAL_ADMIN' });
  c('HTTP 200 & success', r1.status===200 && r1.json?.success, 'st='+r1.status+' msg='+r1.json?.message);
  const arr = r1.json?.data || [];
  console.log(`共 ${arr.length} 个组`);
  c('组数≥2（至少cuiding直推 + fanjie直推）', arr.length >= 2, 'actual='+arr.length);

  // 先查所有 groupLeader 的 role 映射，避免 fanjie(TL)名下的「洁然如初代理」被误判为 GL组
  const allLeaderIds = [...new Set([...arr.map(g=>g.groupLeaderId).filter(Boolean)])];
  const roleMap = new Map(); // id -> role
  const allAdmins = await Admin.find({ _id: { $in: allLeaderIds.map(id=>mongoose.Types.ObjectId.isValid(id)?new mongoose.Types.ObjectId(id):id) } })
    .select('_id role').lean();
  for (const a of allAdmins) roleMap.set(String(a._id), (a.role||'').toUpperCase());

  // 逐个检查组字段
  for (const g of arr) {
    const name = g.groupName;
    const hasL = 'groupLeaderLevel' in g;
    const hasM = 'groupLeaderLevelManual' in g;
    console.log(`\n  📦 [${name}] leader=${g.groupLeaderName||'(空)'} kind=${g.kind}`);
    c(`  字段存在 groupLeaderLevel`, hasL, '缺字段');
    c(`  字段存在 groupLeaderLevelManual`, hasM, '缺字段');
    if (!hasL || !hasM) continue;
    console.log(`     Level=${g.groupLeaderLevel}  Manual=${g.groupLeaderLevelManual}`);
    // cuiding 直推虚拟组
    if (name === '直推成员' && g.kind==='direct_members' && (g.groupLeaderName===cui.realName || g.groupLeaderName===cui.username)) {
      c(`  cuiding虚拟组 level=${cuiEffExp}`, g.groupLeaderLevel===cuiEffExp, 'actual='+g.groupLeaderLevel+' 期望='+cuiEffExp);
      c(`  cuiding虚拟组 manual=${cuiManualExp}`, g.groupLeaderLevelManual===cuiManualExp, 'actual='+g.groupLeaderLevelManual);
    }
    // fanjie 虚拟组（下属 TL 直推）
    if ((name.includes(fan.teamName) || name.includes(fan.realName) || name.includes(fan.username)) &&
        g.kind==='direct_members' && (g.groupLeaderName===fan.realName || g.groupLeaderName===fan.username)) {
      c(`  fanjie虚拟组 level=${fanEffExp}`, g.groupLeaderLevel===fanEffExp, 'actual='+g.groupLeaderLevel+' 期望='+fanEffExp);
      c(`  fanjie虚拟组 manual=${fanManualExp}`, g.groupLeaderLevelManual===fanManualExp, 'actual='+g.groupLeaderLevelManual);
    }
    // GL 组长组：根据 groupLeaderId 的 Admin.role 判断是否为 GROUP_LEADER，而不是名字里含"代理"
    const leaderRole = g.groupLeaderId ? roleMap.get(String(g.groupLeaderId)) : '';
    if (/GROUP_LEADER/.test(leaderRole) && g.groupLeaderLevel !== null) {
      c(`  GL组[${g.groupName}] 职级=P1 (role=${leaderRole})`, g.groupLeaderLevel==='P1', 'actual='+g.groupLeaderLevel);
      c(`  GL组[${g.groupName}] manual 是布尔`, typeof g.groupLeaderLevelManual === 'boolean', 'actual type='+typeof g.groupLeaderLevelManual);
    }
    // NORMAL_ADMIN 角色的 TL 组（如 fanjie 的洁然如初代理）：应该是 TL 职级 P2/P3 等
    if (/NORMAL_ADMIN|NORMAL/.test(leaderRole) && g.groupLeaderLevel !== null) {
      const valid = ['P2','P3','P4','P5','P6','P7','P8'].includes(g.groupLeaderLevel);
      c(`  TL组[${g.groupName}] 职级∈P2~P8 (实际=${g.groupLeaderLevel} role=${leaderRole})`, valid, '');
    }
  }

  // 2. month range 也测试
  console.log('\n========== 2. cuiding 视角 /team-leader/groups?range=month 字段一致 ==========');
  const r2 = await runGroups({ teamId:String(cui._id), range:'month' }, { id:String(cui._id), role:'NORMAL_ADMIN' });
  c('HTTP 200', r2.status===200 && r2.json?.success, 'st='+r2.status);
  const arr2 = r2.json?.data || [];
  for (const g of arr2) {
    if (!('groupLeaderLevel' in g)) { c(`  month组[${g.groupName}] 缺 level`, false, '缺字段'); }
    if (!('groupLeaderLevelManual' in g)) { c(`  month组[${g.groupName}] 缺 manual`, false, '缺字段'); }
  }
  console.log('  month所有组均含新字段 ✅ '+(arr2.every(g=>'groupLeaderLevel' in g && 'groupLeaderLevelManual' in g)?'YES':'NO → '+arr2.filter(g=>!('groupLeaderLevel' in g)).map(x=>x.groupName).join(',')));

  // 3. 超管视角
  console.log('\n========== 3. 超管代理查看 cui 团队 ==========');
  const r3 = await runGroups({ teamId:String(cui._id), range:'today' }, { id:String(sa._id), role:'SUPER_ADMIN' });
  c('SA 视角 HTTP200', r3.status===200 && r3.json?.success, 'st='+r3.status);
  const arr3 = r3.json?.data || [];
  c('SA 视角组数和 TL 视角相同', arr3.length === arr.length, 'SA='+arr3.length+' TL='+arr.length);

  console.log('\n===== TOTAL FAILURES: '+fails+' =====');
  if (fails > 0) process.exit(1);
  console.log('✅ ALL GREEN');
  process.exit(0);
})().catch(e => { console.error('💥 CRASH:', e.stack||String(e)); process.exit(1); });
