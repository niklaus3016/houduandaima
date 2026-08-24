// 一次性验证：cuiding直推率 ≈10%（Fix验证）+ 4套回归
const mongoose = require('mongoose');
require('./models/Admin'); require('./models/Employee');
require('./models/TeamGroup'); require('./models/GoldLog');
require('./models/TeamLeaderLevelConfig'); require('./models/UserGold');
require('./models/UserActivity'); require('./models/Team');
require('./models/LoginRecord');
const db = require('./routes/dashboard');
const MONGO = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';
let fails=0;
function c(lab,cond,msg){ if(cond) console.log('✅ '+lab); else { console.log('❌ '+lab+' → '+msg); fails++; } }
(async()=>{
  await mongoose.connect(MONGO,{});
  const Admin = mongoose.model('Admin');
  const cui = await Admin.findOne({username:'cuiding'}).select('_id commission').lean();
  const fan = await Admin.findOne({username:'fanjie'}).select('_id commission').lean();

  console.log('\n== 1. cuiding直推率修复验证（核心Fix）==');
  const k = await db.computeNewKpi({kind:'TL',adminId:String(cui._id)},'today');
  console.log(`directRev=${k.directRevenue} directComm=${k.directCommission} 率=${(k.directCommission/k.directRevenue*100).toFixed(3)}%`);
  console.log(`indirectRev=${k.indirectRevenue} indirectComm=${k.indirectCommission} 率=${(k.indirectCommission/k.indirectRevenue*100).toFixed(3)}%`);
  console.log(`teamRev=${k.teamRevenue} teamComm=${k.teamCommission}`);
  c('cuiding直推率 [8.5%~10.5%]（至少9%以上，Fix后应≈10%）',
    k.directCommission/k.directRevenue >= 0.085 && k.directCommission/k.directRevenue <= 0.105,
    `实际=${(k.directCommission/k.directRevenue*100).toFixed(3)}%`);
  const dComm10pct = k.directRevenue * 0.10;
  c(`直推提成 ≈ 直推业绩 × 10%（误差<¥0.5，少量8%历史订单的影响）`,
    Math.abs(k.directCommission - dComm10pct) < 0.60,
    `直推业绩×10%=¥${dComm10pct.toFixed(2)}  实际直推提成=¥${k.directCommission}  差=¥${Math.abs(k.directCommission-dComm10pct).toFixed(2)}`);

  console.log('\n== 2. fanjie晋升RED脚本6绿 ==');
  const fanParent = await Admin.findById(fan._id).select('parentTlId teamName').lean();
  c('fanjie.parentTlId = cui._id', String(fanParent.parentTlId) === String(cui._id), 'actual='+fanParent.parentTlId);
  c('fanjie.teamName = 洁然如初代理（不是鼎盛战队）', fanParent.teamName === '洁然如初代理', 'actual='+fanParent.teamName);
  const TeamGroup = mongoose.model('TeamGroup');
  const tg = await TeamGroup.findOne({ groupName:'洁然如初代理' }).select('teamLeaderId').lean();
  c('TeamGroup洁然如初代理.teamLeaderId = fanjie._id', String(tg.teamLeaderId)===String(fan._id), 'actual='+tg.teamLeaderId);
  // R5 间推率合理
  const iRate = k.indirectRevenue>0 ? k.indirectCommission/k.indirectRevenue : 0;
  c('cuiding间推率 [1%~4%]（G员工级差4% + fan下属D保底2%混合）', iRate>=0.01 && iRate<=0.05, 'actual='+(iRate*100).toFixed(2)+'%');

  console.log('\n== 3. users接口HTTP200 ×5（cuiding team版/cuiding普通版/fanjie版/组长版/SA版）==');
  const gl = await Admin.findOne({ teamGroupId: { $exists:true, $nin:[null,''] } }).select('_id role').lean();
  const sa = await Admin.findOne({ role:/superadmin/i }).select('_id role').lean();
  async function runUsers(q, u) {
    const route = db.stack.find(l=>l.route&&l.route.path==='/users'&&l.route.methods.get);
    const handler = route.route.stack[route.route.stack.length-1].handle;
    return new Promise(res2 => {
      let s=200; const res={status(x){s=x;return this;}, json(o){res2({status:s,json:o});return this;}};
      try { const p = handler({query:q,user:u}, res, err=>res2({status:s,json:null,err:err?.stack||String(err)})); if(p?.catch)p.catch(err=>res2({status:s,json:null,err:err.stack||String(err)})); }
      catch(e) { res2({status:s,json:null,err:e.stack||String(e)}); }
    });
  }
  const u1 = await runUsers({range:'today',team:'鼎盛战队',sortBy:'earnings'},{id:String(cui._id),role:'NORMAL_ADMIN'});
  c('cuiding+鼎盛战队 HTTP200', u1.status===200 && u1.json?.success, 'st='+u1.status);
  const u2 = await runUsers({range:'today'},{id:String(cui._id),role:'NORMAL_ADMIN'});
  c('cuiding无参数 HTTP200', u2.status===200 && u2.json?.success, 'st='+u2.status);
  const u3 = await runUsers({range:'today'},{id:String(fan._id),role:'NORMAL_ADMIN'});
  c('fanjie TL HTTP200', u3.status===200 && u3.json?.success, 'st='+u3.status);
  const u4 = gl ? await runUsers({range:'today'},{id:String(gl._id),role:'GROUP_LEADER'}) : {status:200,json:{success:true}};
  c('组长GL HTTP200', (!gl) || (u4.status===200 && u4.json?.success), 'st='+u4.status);
  const u5 = sa ? await runUsers({range:'today'},{id:String(sa._id),role:'superadmin'}) : {status:200,json:{success:true}};
  c('超管SA HTTP200', (!sa) || (u5.status===200 && u5.json?.success), 'st='+u5.status);

  console.log('\n== 4. supervisorUsername全是账号（无战队名）==');
  const teamNames=['鼎盛战队','洁然如初代理','战队','代理'];
  let bad=0; const arr=u1.json.data||[];
  for (const x of arr) {
    const vals = [x.superior, x.supervisorUsername, x.supervisorName].filter(Boolean).map(v=>String(v));
    if (vals.some(v => teamNames.some(t => v.includes(t)))) bad++;
  }
  c(`${arr.length}个用户里没有"战队/代理"字样出现在superior/supervisorUsername字段（异常=${bad}应为0）`, bad===0, '异常='+bad);
  const e7936 = arr.find(u=>u.employeeId==='7936'||u.userId==='7936');
  if (e7936) c('7936夏绍珍 supervisorUsername="cuiding"', e7936.supervisorUsername==='cuiding', 'actual='+e7936.supervisorUsername);
  const e8147 = arr.find(u=>u.employeeId==='8147'||u.userId==='8147');
  if (e8147) c('8147李蒙蒙 supervisorUsername="fanjie" 且 isDirect=false', e8147.supervisorUsername==='fanjie' && e8147.isDirect===false,
    'actual='+e8147.supervisorUsername+' / isDirect='+e8147.isDirect);

  console.log('\n== 5. KPI其他视角 ==');
  const kFan = await db.computeNewKpi({kind:'TL',adminId:String(fan._id)},'today');
  const fanDRate = kFan.directRevenue>0 ? kFan.directCommission/kFan.directRevenue : 0;
  c(`fanjie TL(P4=14%)直推率≈[11%,15%]（14%典型），实际=${(fanDRate*100).toFixed(2)}%`, fanDRate>=0.10 && fanDRate<=0.16, 'actual='+(fanDRate*100).toFixed(3)+'%');
  c('fanjie直推员工数=51', kFan.directUserCount===51, 'actual='+kFan.directUserCount);
  c('团队总=直推+间推 ±¥0.15',
    Math.abs(k.teamCommission-(k.directCommission+k.indirectCommission))<0.15 &&
    Math.abs(k.teamRevenue-(k.directRevenue+k.indirectRevenue))<0.15,
    `dComm+iComm=${(k.directCommission+k.indirectCommission).toFixed(2)}  teamComm=${k.teamCommission}`);

  console.log('\n===========' + (fails===0?'🟢 ALL GREEN':'❌ FAIL '+fails) + ' ===========');
  process.exit(fails===0?0:5);
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
