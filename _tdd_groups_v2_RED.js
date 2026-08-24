// TDD RED：直接调 employeeManage 的 /team-leader/groups handler，验证返回组数
const mongoose = require('mongoose');
require('./models/Admin'); require('./models/Employee');
require('./models/TeamGroup'); require('./models/GoldLog');
require('./models/TeamLeaderLevelConfig'); require('./models/UserGold');
require('./models/UserActivity'); require('./models/Team');
const emp = require('./routes/employeeManage');
const MONGO = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';
async function runGroups(q, u) {
  const route = emp.stack.find(l => l.route && l.route.path === '/team-leader/groups' && l.route.methods.get);
  if (!route) { console.error('找不到 /team-leader/groups route'); process.exit(1); }
  const mids = route.route.stack;
  const handler = mids[mids.length - 1].handle;
  return new Promise(res2 => {
    let s = 200;
    const res = { status(x) { s = x; return this; }, json(o) { res2({ status: s, json: o }); return this; } };
    try {
      // 直接跳过 authMiddleware：用 req.user 传入
      const req = { query: q, user: u };
      const p = handler(req, res, err => res2({ status: s, json: null, err: err?.stack || String(err) }));
      if (p?.catch) p.catch(err => res2({ status: s, json: null, err: err.stack || String(err) }));
    } catch (e) { res2({ status: s, json: null, err: e.stack || String(e) }); }
  });
}
(async () => {
  await mongoose.connect(MONGO, {});
  const Admin = mongoose.model('Admin');
  const cui = await Admin.findOne({ username: 'cuiding' }).select('_id username role').lean();
  const fan = await Admin.findOne({ username: 'fanjie' }).select('_id username role parentTlId').lean();
  console.log('cuiding._id=', String(cui._id), 'role=', cui.role);
  console.log('fanjie._id=', String(fan._id), 'parentTlId=', fan.parentTlId ? String(fan.parentTlId) : null);

  // case A：cuiding 本人查看今天
  const rA = await runGroups({ teamId: String(cui._id), range: 'today' },
    { id: String(cui._id), role: 'NORMAL_ADMIN' });
  console.log('\n====== [A] cuiding 本人 range=today ======');
  console.log('status=', rA.status, 'msg=', rA.json?.message || rA.json?.success);
  if (rA.json?.data) {
    console.log('totalGroups=', rA.json.totalGroups, '| totalMembers=', rA.json.totalMembers, '| totalRevenue=', rA.json.totalRevenue);
    console.log('groups 列表:');
    for (const g of rA.json.data) {
      console.log('   ·', g.groupName, '| kind=', g.kind, '| teamLevel=', g.teamLevel, '| subTL=', g.subTeamName, '| mem=', g.memberCount, '| todayRev=', g.todayRevenue, '| TL=', g.teamLeaderName, '| isDirect=', g.isDirectGroup);
    }
    const hasVir = rA.json.data.some(g => g.kind === 'direct_members' || g.groupName === '直推成员');
    const hasFan = rA.json.data.some(g => g.teamLeaderUsername === 'fanjie' || (g.subTeamName && g.subTeamName.includes('洁然')));
    console.log('\n检查：含直推虚拟组？', hasVir ? '✅' : '❌ 缺！', '| 含fanjie的组？', hasFan ? '✅' : '❌ 缺！');
  } else {
    console.log('❌ 无 data，错误=', rA.json?.message || rA.err);
  }
  await mongoose.disconnect();
})();
