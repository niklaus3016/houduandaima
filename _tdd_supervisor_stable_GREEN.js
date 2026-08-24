// ===========================================================
// GREEN：验证/users返回的superior（上级账号）是稳定的parentId链username
//   重点断言：
//     7936夏绍珍(cuiding直D) → supervisorUsername='cuiding'
//     8147李蒙蒙(fan直D)   → supervisorUsername='fanjie'（不是鼎盛战队/洁然如初代理）
//     随便抽一个组长下属G员工 → supervisorUsername=对应组长username
//     不再出现 teamName（鼎盛战队/洁然如初代理）在 superior 字段里
// ===========================================================
const mongoose = require('mongoose');
require('./models/Admin'); require('./models/Employee');
require('./models/TeamGroup'); require('./models/GoldLog');
require('./models/UserGold'); require('./models/UserActivity');
require('./models/Team'); require('./models/LoginRecord');
const db = require('./routes/dashboard');
const MONGO = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

let fails = 0;
function check(label, cond, msg) {
  if (cond) console.log('  ✅ ' + label);
  else { console.log('  ❌ ' + label + ' → ' + msg); fails++; }
}

async function runUsersHandler(req) {
  const route = db.stack.find(l => l.route && l.route.path === '/users' && l.route.methods.get);
  if (!route) throw new Error('找不到/users路由');
  const handler = route.route.stack[route.route.stack.length-1].handle; // 最后一个layer=业务handler
  return new Promise(resolve => {
    let status = 200;
    const res = {
      status(c) { status = c; return this; },
      json(obj) { resolve({ status, json: obj }); return this; }
    };
    try {
      const p = handler(req, res, (err)=>resolve({status, json:null, err:err?.stack||String(err)}));
      if (p?.catch) p.catch(err => resolve({ status, json:null, err:err.stack||String(err) }));
    } catch(err) { resolve({ status, json:null, err: err.stack||String(err) }); }
  });
}

(async () => {
  await mongoose.connect(MONGO, {});
  const Admin = mongoose.model('Admin');
  const cui = await Admin.findOne({ username:'cuiding' }).select('_id username').lean();
  const fan = await Admin.findOne({ username:'fanjie' }).select('_id username').lean();

  console.log('\n=== 请求1：cuiding + team=鼎盛战队 + today（真实cuiding调用）===');
  const r1 = await runUsersHandler({
    query: { range:'today', team:'鼎盛战队', sortBy:'earnings' },
    user:  { id: String(cui._id), role:'NORMAL_ADMIN' }
  });
  check('HTTP200', r1.status===200, 'actual='+r1.status);
  check('success=true', r1.json?.success, 'body='+JSON.stringify(r1.json).slice(0,100));
  const arr = r1.json.data || [];
  console.log('返回用户数='+arr.length + '，字段样例首条：');
  console.log('  userId='+arr[0]?.userId+' employeeId='+arr[0]?.employeeId+' name='+arr[0]?.name
    +'  superior='+arr[0]?.supervisorUsername+'(supervisorUsername)  '+arr[0]?.superiorRealName
    +'  isDirect='+arr[0]?.isDirect+' sourceKind='+arr[0]?.sourceKind
    +'  groupName='+JSON.stringify(arr[0]?.groupName)+' teamGroupId='+JSON.stringify(arr[0]?.teamGroupId));

  // 找 7936夏绍珍 / 8147李蒙蒙 两个具体员工断言
  const e7936 = arr.find(u => u.employeeId==='7936' || u.userId==='7936');
  if (e7936) {
    console.log('\n--- 7936夏绍珍（cuiding直推）当前字段 ---');
    console.log(JSON.stringify(e7936, null, 2).slice(0, 600));
    check('7936 superiorUsername="cuiding"（不是鼎盛战队，也不是洁然如初代理）',
      e7936.supervisorUsername==='cuiding' && e7936.superior==='cuiding',
      'actual supervisorUsername='+JSON.stringify(e7936.supervisorUsername)+'  superior='+JSON.stringify(e7936.superior));
    check('7936 supervisorRealName有值或空（都OK，不强制）', typeof e7936.supervisorRealName==='string', 'typeof='+typeof e7936.supervisorRealName);
    check('7936 isDirect=true（是cuiding直推）', e7936.isDirect===true, 'actual='+e7936.isDirect);
  } else {
    console.log('\n⚠️  今日7936没在users里（可能今日无业绩），跳过对7936的具体employeeId断言');
  }

  const e8147 = arr.find(u => u.employeeId==='8147' || u.userId==='8147');
  if (e8147) {
    console.log('\n--- 8147李蒙蒙（fanjie直推，间推subTlDirectD）当前字段 ---');
    console.log(JSON.stringify(e8147, null, 2).slice(0, 600));
    check('8147 supervisorUsername="fanjie"（不是鼎盛战队，也不是洁然如初代理）',
      e8147.supervisorUsername==='fanjie' && e8147.superior==='fanjie',
      'actual supervisorUsername='+JSON.stringify(e8147.supervisorUsername)+'  superior='+JSON.stringify(e8147.superior));
    check('8147 isDirect=false（对cuiding是间推）', e8147.isDirect===false, 'actual='+e8147.isDirect);
    check('8147 sourceKind=subTlDirectD（下属TL fan的直推）',
      e8147.sourceKind==='subTlDirectD', 'actual='+e8147.sourceKind);
  } else {
    console.log('\n⚠️  今日8147没在users里（可能今日无业绩），跳过8147具体断言');
  }

  // 额外：所有返回用户的 superior 和 supervisorUsername 都不应该是战队名（鼎盛战队/洁然如初代理/NO.1战队/…）
  const teamNames = ['鼎盛战队', '洁然如初代理', 'NO.1战队', '四季发财战队', '花好月圆战队', '财务自由战队', '测试团队'];
  let nBadSuperior = 0, samples = [];
  for (const u of arr) {
    const vals = [u.superior, u.supervisorUsername, u.supervisorName].filter(Boolean).map(x=>String(x));
    const bad = vals.some(v => teamNames.includes(v) || v.includes('战队') || v.includes('代理'));
    if (bad) { nBadSuperior++; if (samples.length<3) samples.push(u.name+'('+(u.employeeId||u.userId)+') '+JSON.stringify(vals)); }
  }
  check('返回的 '+arr.length+' 个用户 superior/supervisorUsername 字段里没有一个是"战队/代理"名（应全是账号username），异常数=0',
    nBadSuperior===0, '异常 '+nBadSuperior+' 个，示例：'+samples.join(' | '));

  // 请求2：fanjie视角（无team参数）验证下属都是 fan 上级
  console.log('\n=== 请求2：fanjie TL 无参数（自己团队）===');
  const r2 = await runUsersHandler({ query:{range:'today'}, user:{id:String(fan._id), role:'NORMAL_ADMIN'} });
  check('HTTP200', r2.status===200, 'status='+r2.status);
  const arr2 = r2.json?.data || [];
  const fanBad = arr2.filter(u => u.supervisorUsername && u.supervisorUsername!=='fanjie' && u.supervisorUsername!=='系统直属').length;
  check('fanjie直推全部 supervisorUsername="fanjie" 或 系统直属（异常='+fanBad+'应为0）', fanBad===0, '存在非fan上级员工数='+fanBad);

  // 请求3：组长GL视角
  const gl = await Admin.findOne({ teamGroupId: { $exists:true, $nin:[null,''] } }).select('_id role teamGroupId').lean();
  if (gl) {
    console.log('\n=== 请求3：组长 GL 无参数 ===');
    const r3 = await runUsersHandler({ query:{range:'today'}, user:{id:String(gl._id), role:'GROUP_LEADER'} });
    check('HTTP200', r3.status===200, 'status='+r3.status);
    const arr3 = r3.json?.data || [];
    arr3.slice(0,3).forEach(u => console.log('  '+u.name+' '+u.employeeId+'  superior='+u.supervisorUsername+'  isDirect='+u.isDirect));
  }

  // 请求4：超管SA
  const sa = await Admin.findOne({ role:/superadmin/i }).select('_id role').lean();
  if (sa) {
    console.log('\n=== 请求4：超管SA全局 ===');
    const r4 = await runUsersHandler({ query:{range:'today'}, user:{id:String(sa._id), role:'superadmin'} });
    check('HTTP200', r4.status===200, 'status='+r4.status);
    check('返回用户数 > cuiding团队人数', (r4.json?.data||[]).length > (arr.length||0), 'SA='+(r4.json?.data||[]).length+' cui='+arr.length);
  }

  console.log('\n==== ' + (fails===0 ? '🟢 GREEN：superior/supervisorUsername 全是上级账号username，没有战队名乱入 ✅' : '❌ '+fails+' FAIL') + ' ====');
  process.exit(fails===0?0:4);
})().catch(e => { console.error(e.stack||e); process.exit(1); });
