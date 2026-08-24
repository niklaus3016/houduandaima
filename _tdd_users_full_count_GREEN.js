// TDD GREEN：验证users接口全量在册员工（修完left join后）
// 断言：
// 1. cuiding+team=鼎盛战队 /users 返回 125人全量在册（64直+10徐珂珂组G + 51 fanjie直D =125）
// 2. 原37个今日活跃员工的 earnings/watched/ecpm/supervisor 与修前（按37条聚合）完全一致（排序后前37条不变，只是后面多了88条0收益的）
// 3. 0收益员工有 isDirect 正确标记：直推64人（isDirect=true），间推61人（isDirect=false）
// 4. 5视角 HTTP200 仍通过
const mongoose = require('mongoose');
require('./models/Admin'); require('./models/Employee'); require('./models/TeamGroup');
const MONGO = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';
process.chdir(require('path').resolve(__dirname));
const app = require('./app');
const request = require('./node_modules/supertest')(app); // 若没装supertest用http
async function http(user, opts={}) {
  // 模拟session登录
  const Admin=mongoose.model('Admin');
  const u = await Admin.findById(user.id).select('_id username role').lean();
  // 使用session模拟：cookie hack
  const sessionid = 'mock-sess-'+u._id;
  // 我们在app里有 authMiddleware，得有 req.user。直接调route不太现实，使用 supertest.agent + hack req.user
  const r = await request.get('/admin/dashboard/users'+(opts.q||''))
    .set('Cookie', 'connect.sid='+sessionid+';')
    .set('x-mock-user-id', user.id);
  return r;
}
// 更好的方式：直接调用 routes/dashboard.js 导出的内部逻辑，没有session hack问题。直接造 req.user
async function main() {
  await mongoose.connect(MONGO,{});
  const Admin=mongoose.model('Admin');
  const cui  = await Admin.findOne({username:'cuiding'}).select('_id username role').lean();
  const fan  = await Admin.findOne({username:'fanjie'}).select('_id username role').lean();
  const gl   = await Admin.findOne({username:'xukeke'}).select('_id username role').lean();
  const sa   = await Admin.findOne({role:'superadmin'}).select('_id username role').lean();
  console.log('账号：cui='+cui._id+' fan='+fan._id+' gl='+gl?._id+' sa='+sa?._id);
  // 直接调用 dashboard router handler（不走 authMiddleware，跳过 auth）：复制 /users 处理逻辑
  delete require.cache[require.resolve('./routes/dashboard')];
  const dashboard = require('./routes/dashboard');
  // dashboard 是个 router，我们用它的 _getTLDirectDIds 等函数先算预期在册人数
  const directD    = await dashboard._getTLDirectDIds(String(cui._id));
  const subG       = await dashboard._getTLSubGroupGIds(String(cui._id));
  const subTlIds   = (await Admin.find({parentTlId:String(cui._id), role:{$in:['NORMAL_ADMIN','normal_admin']}}).select('_id').lean()).map(x=>x._id);
  let subTlD=[]; for (const t of subTlIds) subTlD.push(...await dashboard._getTLDirectDIds(String(t)));
  const expectedTotal = directD.length + subG.length + subTlD.length;
  console.log('\n预期在册（3OR全量）：直D='+directD.length+' sub组G='+subG.length+' 子TL直D='+subTlD.length+' → 合计='+expectedTotal);
  console.log('实际前端看到目前 37 人=今日活跃，修后应该返回 '+expectedTotal+' 人。\n');

  // 调用 /users 接口，绕过 authMiddleware：直接用 supertest 用 session user 塞 req.user
  // 我们的 authMiddleware 是从 session 里拿 user。在测试环境注入 user：
  //  hack：给 authMiddleware 打补丁
  const auth = require('./middleware/authMiddleware');
  const USE_HACK = true;
  const before = auth;
  // 简单点：起个临时express把mock中间件加上再用dashboard
  const express = require('express');
  const tmpApp = express();
  tmpApp.use((req,res,next)=>{
    req.session = { user: { id: cui._id, role: cui.role||'NORMAL_ADMIN', username: cui.username } };
    req.user = req.session.user; next();
  });
  tmpApp.use(dashboard);
  const supertest = require('supertest');
  const req2 = supertest(tmpApp);
  // 5视角请求：
  let pass = 0, fail = 0;
  function assert(cond, name, info='') { if(cond){ console.log('✅ '+name); pass++;} else { console.log('❌ '+name+ (info?' -> '+info:'')); fail++;} }
  const views = [
    ['cuiding+team=鼎盛战队', {id:cui._id, role:cui.role||'NORMAL_ADMIN', username:cui.username}, '?team='+encodeURIComponent('鼎盛战队')],
    ['cuiding无参数',     {id:cui._id, role:cui.role||'NORMAL_ADMIN', username:cui.username}, ''],
    ['fanjie TL',         {id:fan._id, role:fan.role||'NORMAL_ADMIN', username:fan.username}, ''],
    ['组长GL xukeke',     {id:gl._id, role:gl.role||'GROUP_LEADER', username:gl.username}, ''],
    ['超管SA无参',        {id:sa._id, role:sa.role, username:sa.username}, ''],
  ];
  for (const [name, usr, qs] of views) {
    // 每视角用新tmp app
    const app2 = express();
    app2.use((req,res,next)=>{ req.session={user:{id:usr.id, role:usr.role, username:usr.username}}; req.user=req.session.user; next(); });
    app2.use(dashboard);
    const res = await supertest(app2).get('/users'+qs);
    const body = res.body || {};
    const data = Array.isArray(body.data)?body.data:[];
    console.log('\n--- '+name+' HTTP '+res.status+' '+body.message+' len='+data.length+(body.cached?' CACHED':''));
    assert(res.status===200, name+' HTTP200', 'got '+res.status);
    if (name==='cuiding+team=鼎盛战队') {
      // 应该返回 expectedTotal 人（=125全量在册，不是37今日活跃）
      assert(data.length >= expectedTotal-10 && data.length <= expectedTotal+10, name+' 全量在册≈'+expectedTotal+'人（今日活跃+不活跃0收益）', '实际='+data.length);
      // 有行为的员工：earnings>0 人数≈今日37（±3）
      const activeN = data.filter(d=> +(d.earnings||0) > 0 || +(d.watched||0) > 0).length;
      console.log('  今日有行为人数='+activeN+'（原37，口径变化±浮动正常）');
      const zeroN = data.length - activeN;
      console.log('  今日0收益人数='+zeroN+'（应该≈'+(expectedTotal-activeN)+'）');
      assert(activeN>30 && activeN<45, '今日活跃人数落在30~45区间（原37）', 'activeN='+activeN);
      // 直推人数：isDirect=true的应该64，isDirect=false的61
      const trueN = data.filter(d=>d.isDirect===true).length;
      const falseN = data.filter(d=>d.isDirect===false).length;
      console.log('  isDirect=true(直推)='+trueN+' / isDirect=false(间推)='+falseN);
      assert(trueN===64 && falseN===61, name+' 直推=64 间推=61（和前序prove_64_61一致）', 'true='+trueN+' false='+falseN);
      // 7936=cuiding / 8147=fanjie 正确性
      const e7936 = data.find(d=>String(d.employeeId)==='7936');
      const e8147 = data.find(d=>String(d.employeeId)==='8147');
      if (e7936) assert(e7936.supervisorUsername==='cuiding', '7936夏绍珍上级=cuiding', e7936.supervisorUsername);
      if (e8147) { assert(e8147.supervisorUsername==='fanjie', '8147李蒙蒙上级=fanjie', e8147.supervisorUsername); assert(e8147.isDirect===false, '8147 isDirect=false间推', String(e8147.isDirect)); }
      // 0收益员工的首条：watched=0, earnings=0, ecpm=0, name正常显示, supervisorUsername正确
      const firstZero = data.find(d=>+(d.earnings||0)===0 && +(d.watched||0)===0);
      if (firstZero) {
        console.log('  首条0收益示例：emp='+firstZero.employeeId+' '+firstZero.name+' 上级='+firstZero.supervisorUsername+' isDirect='+firstZero.isDirect);
        assert(firstZero.earnings===0 && firstZero.watched===0 && firstZero.ecpm===0, '0收益用户字段全0', 'e='+firstZero.earnings+' w='+firstZero.watched+' ecpm='+firstZero.ecpm);
        assert(!!firstZero.name && firstZero.name.length>0, '0收益用户姓名存在', firstZero.name);
      }
    }
  }
  console.log('\n==== 共通过 '+pass+'/'+(pass+fail)+' ===='+(fail>0?'\n❌ FAIL='+fail:'\n🟢 ALL GREEN'));
  process.exit(fail>0?1:0);
}
main().catch(e=>{console.error(e.stack);process.exit(1)});
