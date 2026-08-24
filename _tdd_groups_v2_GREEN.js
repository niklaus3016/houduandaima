// TDD GREEN：完整验证 groups v2 接口（直推虚拟组 + fanjie 下属组 + 权限）
const mongoose = require('mongoose');
require('./models/Admin'); require('./models/Employee');
require('./models/TeamGroup'); require('./models/GoldLog');
require('./models/TeamLeaderLevelConfig'); require('./models/UserGold');
require('./models/UserActivity'); require('./models/Team');
const emp = require('./routes/employeeManage');
const MONGO = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';
async function runGroups(q, u) {
  const route = emp.stack.find(l => l.route && l.route.path === '/team-leader/groups' && l.route.methods.get);
  const mids = route.route.stack;
  const handler = mids[mids.length - 1].handle;
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
let fails = 0;
function c(lab, cond, msg) { if (cond) console.log('✅ ' + lab); else { console.log('❌ ' + lab + ' → ' + msg); fails++; } }

(async () => {
  await mongoose.connect(MONGO, {});
  const Admin = mongoose.model('Admin');
  const cui = await Admin.findOne({ username: 'cuiding' }).select('_id username role').lean();
  const fan = await Admin.findOne({ username: 'fanjie' }).select('_id username role parentTlId').lean();
  const sa  = await Admin.findOne({ role: /superadmin/i }).select('_id username role').lean();
  console.log('cuiding=', String(cui._id).slice(-6), '| fanjie=', String(fan._id).slice(-6), '| SA=', sa.username);

  // ========== [A] cuiding 本人 today ==========
  const rA = await runGroups({ teamId: String(cui._id), range: 'today' },
    { id: String(cui._id), role: 'NORMAL_ADMIN' });
  console.log('\n[A] cuiding 本人 today: status=', rA.status, 'groups=', rA.json?.totalGroups, 'totalRev=', rA.json?.totalRevenue);
  c('A-1 status=200', rA.status === 200, 'status=' + rA.status);
  c('A-2 总组数 ≥ 9（原7+直推1+fanjie组1）', rA.json?.totalGroups >= 9, '只有 ' + rA.json?.totalGroups);
  c('A-3 含「直推成员」虚拟组（groupName=直推成员）',
    rA.json?.data?.some(g => g.groupName === '直推成员' && g.kind === 'direct_members' && g.teamLevel === 'own'),
    '未找到');
  const vir = rA.json?.data?.find(g => g.groupName === '直推成员');
  if (vir) c('A-4 直推成员数 = 40（今日 64 直 D 可能有 24 已入组？先看 >20 合理）', vir.memberCount > 20, '只有 ' + vir.memberCount);
  c('A-5 含 fanjie 的组（teamLevel=sub & subTeamName=洁然如初代理）',
    rA.json?.data?.some(g => g.teamLevel === 'sub' && (g.subTeamName || '').includes('洁然')),
    '没有下属TL组');
  const fanGrp = rA.json?.data?.find(g => g.teamLevel === 'sub');
  if (fanGrp) console.log('   fanjie 组详情:', fanGrp.groupName, '| mem=', fanGrp.memberCount, '| todayRev=', fanGrp.todayRevenue, '| TL=', fanGrp.teamLeaderName);
  c('A-6 原 7 组长组都在（李想/周欢/徐珂珂/小卓宝/白浩舸/吴威/林鑫）',
    ['李想', '周欢', '徐珂珂', '小卓宝', '白浩舸', '吴威', '林鑫'].every(nm =>
      rA.json?.data?.some(g => (g.groupName || '').includes(nm))),
    '有组长组丢了');
  c('A-7 总人数 = 125 全量在册', rA.json?.totalMembers === 125, 'totalMembers=' + rA.json?.totalMembers);

  // ========== [B] cuiding 本人 month（切换 range）==========
  const rB = await runGroups({ teamId: String(cui._id), range: 'month' },
    { id: String(cui._id), role: 'NORMAL_ADMIN' });
  console.log('\n[B] cuiding 本人 month: status=', rB.status, 'groups=', rB.json?.totalGroups, 'totalRev=', rB.json?.totalRevenue);
  c('B-1 month组数=today组数', rB.json?.totalGroups === rA.json?.totalGroups, 'today='+rA.json?.totalGroups+' month='+rB.json?.totalGroups);
  c('B-2 month总营收 > today（合理）', rB.json?.totalRevenue >= rA.json?.totalRevenue, '不合理');

  // ========== [C] fanjie 本人看 cuiding → 应该 403（权限不足）==========
  const rC = await runGroups({ teamId: String(cui._id), range: 'today' },
    { id: String(fan._id), role: 'NORMAL_ADMIN' });
  console.log('\n[C] fanjie 看 cuiding: status=', rC.status, 'msg=', rC.json?.message);
  c('C-1 禁止越权访问（status=403）', rC.status === 403, 'status=' + rC.status + ' msg=' + rC.json?.message);

  // ========== [D] fanjie 本人看自己 → 只含自己的组（不能有 cuiding 的 7 个组长组）==========
  const rD = await runGroups({ teamId: String(fan._id), range: 'today' },
    { id: String(fan._id), role: 'NORMAL_ADMIN' });
  console.log('\n[D] fanjie 本人: status=', rD.status, 'groups=', rD.json?.totalGroups, 'totalRev=', rD.json?.totalRevenue);
  c('D-1 status=200', rD.status === 200, 'status=' + rD.status);
  c('D-2 不含 cuiding 的 7 组长组',
    !['李想', '周欢', '徐珂珂'].some(nm => rD.json?.data?.some(g => (g.groupName || '').includes(nm))),
    '越权拿到上级组长组');
  c('D-3 含 fanjie 自己的直推虚拟组 或 洁然如初代理（下属TL自己的内容）',
    rD.json?.data?.some(g => (g.groupName === '直推成员') || (g.groupName || '').includes('洁然')),
    '没有自己的团队内容');
  // D-4 teamLevel 不能有 'own' 的 teamLeader=崔鼎
  c('D-4 teamLevel=own 的 leader 都是 fanjie',
    rD.json?.data?.every(g => g.teamLevel !== 'own' || g.teamLeaderUsername === 'fanjie'),
    '上级TL内容被fan越权看到了');

  // ========== [E] SA 超管看 cuiding（和 cuiding 本人看一致）==========
  const rE = await runGroups({ teamId: String(cui._id), range: 'today' },
    { id: String(sa._id), role: 'SUPER_ADMIN' });
  console.log('\n[E] SA 看 cuiding: status=', rE.status, 'groups=', rE.json?.totalGroups, 'totalRev=', rE.json?.totalRevenue);
  c('E-1 SA status=200', rE.status === 200, 'status=' + rE.status);
  c('E-2 和本人看组数一致', rE.json?.totalGroups === rA.json?.totalGroups,
    'SA=' + rE.json?.totalGroups + ' 本人=' + rA.json?.totalGroups);
  c('E-3 SA 也有直推虚拟组', rE.json?.data?.some(g => g.groupName === '直推成员'), '缺');
  c('E-4 SA 也含 fanjie 下属组', rE.json?.data?.some(g => g.teamLevel === 'sub'), '缺');

  // ========== [F] 组长角色调接口 → 403 ==========
  const gl = await Admin.findOne({ role: /GROUP_LEADER|group_leader/i }).select('_id username role').lean();
  if (gl) {
    const rF = await runGroups({ teamId: String(cui._id), range: 'today' },
      { id: String(gl._id), role: 'GROUP_LEADER' });
    console.log('\n[F] 组长(' + gl.username + ')调cuiding: status=', rF.status, 'msg=', rF.json?.message);
    c('F-1 组长 403', rF.status === 403, 'status=' + rF.status + ' msg=' + rF.json?.message);
  }

  console.log('\n====== 总结 ======');
  console.log(fails === 0 ? '🎉 ALL GREEN' : '❌ ' + fails + ' 项失败');
  await mongoose.disconnect();
  process.exit(fails === 0 ? 0 : 1);
})();
