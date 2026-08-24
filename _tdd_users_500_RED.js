// ===========================================================
// RED: 复现 GET /admin/dashboard/users HTTP 500
//   不启服务器，直接调用 dashboard router 的 handler，注入假的 req/res
//   这样能拿到完整 error stack，定位 ReferenceError / TypeError
// ===========================================================
const mongoose = require('mongoose');
require('./models/Admin');
require('./models/Employee');
require('./models/TeamGroup');
require('./models/GoldLog');
require('./models/TeamLeaderLevelConfig');
require('./models/UserGold');
require('./models/UserActivity');
require('./models/Team');
require('./models/LoginRecord');
const MONGO = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

(async () => {
  await mongoose.connect(MONGO, {});
  // 把 dashboard router 当作纯函数调用：构造 req/res
  const dashboard = require('./routes/dashboard');
  // 找第一个路由（/users），router.stack 里找 layer.route.get('/users')
  const route = dashboard.stack.find(l => l.route && l.route.path === '/users' && l.route.methods.get);
  // router.get('/users', authMiddleware, async (req, res) => { ... })
  // 路由链上有2个handler：[0]=authMiddleware  [1]=业务逻辑
  if (!route) { console.log('找不到/users路由'); process.exit(2); }
  console.log('路由链上的 handlers 数=' + route.route.stack.length);
  route.route.stack.forEach((ly,i) => { console.log('  layer['+i+'].name='+ly.handle.name); });
  const bizLayer = route.route.stack.find(l => l.handle.name === '');  // async匿名函数
  const handler = bizLayer ? bizLayer.handle : route.route.stack[route.route.stack.length-1].handle;
  console.log('选中handler.name=' + handler.name)

  const cui = await mongoose.model('Admin').findOne({ username:'cuiding' }).select('_id username role').lean();
  console.log('cuiding._id=' + cui._id + '  role=' + cui.role);

  // 请求1：team=鼎盛战队 & range=today（线上cuiding真实请求）
  const req1 = {
    query: { range:'today', team:'鼎盛战队', sortBy:'earnings' },
    user:  { id: String(cui._id), role: cui.role === 'superadmin' ? 'superadmin' : 'NORMAL_ADMIN' }
  };
  console.log('\n======== 请求1：cuiding + team=鼎盛战队 + range=today ========');
  const res1 = await runHandler(handler, req1);
  console.log(res1.status + ' ' + (res1.json && res1.json.success ? '✅ success=true ' + (res1.json.cached?'(cached)':'') : '❌ ' + JSON.stringify(res1.json).slice(0,200)));
  if (res1.errorStack) console.log('错误栈:\n' + res1.errorStack);
  if (res1.json && res1.json.success) {
    const arr = res1.json.data||[];
    console.log('返回 users 数量=' + arr.length);
    if (arr[0]) {
      const u = arr[0];
      console.log('首条字段检查 isDirect='+u.isDirect+' sourceKind='+u.sourceKind+' earnings='+u.earnings+' name='+u.name);
    }
  }

  // 请求2：无team参数（cuiding默认TL视角）
  const req2 = { query:{ range:'today' }, user:{ id:String(cui._id), role:'NORMAL_ADMIN' } };
  console.log('\n======== 请求2：cuiding 无team参数 ========');
  const res2 = await runHandler(handler, req2);
  console.log(res2.status + ' ' + (res2.json && res2.json.success ? '✅ success=true len='+(res2.json.data||[]).length : '❌ ' + JSON.stringify(res2.json).slice(0,200)));
  if (res2.errorStack) console.log('错误栈:\n' + res2.errorStack);

  // 请求3：GL视角（找一位组长）
  const gl = await mongoose.model('Admin').findOne({ teamGroupId: { $exists:true, $nin:[null,''] } }).select('_id teamGroupId role').lean();
  if (gl) {
    console.log('\n======== 请求3：组长 GL(teamGroupId='+gl.teamGroupId+') 无参数 ========');
    const req3 = { query:{ range:'today' }, user:{ id:String(gl._id), role:'GROUP_LEADER' } };
    const res3 = await runHandler(handler, req3);
    console.log(res3.status + ' ' + (res3.json && res3.json.success ? '✅ len='+(res3.json.data||[]).length : '❌ ' + JSON.stringify(res3.json).slice(0,200)));
    if (res3.errorStack) console.log('错误栈:\n' + res3.errorStack);

    console.log('\n======== 请求4：组长 + group=teamGroupId 参数 ========');
    const req4 = { query:{ range:'today', group:String(gl.teamGroupId) }, user:{ id:String(gl._id), role:'GROUP_LEADER' } };
    const res4 = await runHandler(handler, req4);
    console.log(res4.status + ' ' + (res4.json && res4.json.success ? '✅ len='+(res4.json.data||[]).length : '❌ ' + JSON.stringify(res4.json).slice(0,200)));
    if (res4.errorStack) console.log('错误栈:\n' + res4.errorStack);
  }

  // 请求5：超管 SA 全局
  const sa = await mongoose.model('Admin').findOne({ role:/superadmin/i }).select('_id username role').lean();
  if (sa) {
    console.log('\n======== 请求5：超管 SA 全局 无参数 ========');
    const req5 = { query:{ range:'today' }, user:{ id:String(sa._id), role:'superadmin' } };
    const res5 = await runHandler(handler, req5);
    console.log(res5.status + ' ' + (res5.json && res5.json.success ? '✅ len='+(res5.json.data||[]).length : '❌ ' + JSON.stringify(res5.json).slice(0,200)));
    if (res5.errorStack) console.log('错误栈:\n' + res5.errorStack);
  }

  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

function runHandler(handler, req) {
  return new Promise(resolve => {
    let status = 200;
    let jsonOut = null;
    const res = {
      status(code) { status = code; return this; },
      json(obj) { jsonOut = obj; resolve({ status, json: jsonOut }); return this; },
    };
    try {
      const p = handler(req, res, (nextErr) => {
        resolve({ status, json: jsonOut, errorStack: nextErr ? (nextErr.stack||String(nextErr)) : undefined });
      });
      if (p && p.catch) p.catch(err => resolve({ status, json: jsonOut, errorStack: err.stack || String(err) }));
    } catch (err) {
      resolve({ status, json: jsonOut, errorStack: err.stack || String(err) });
    }
  });
}
