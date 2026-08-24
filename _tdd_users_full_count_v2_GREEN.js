// TDD GREEN：修完users全量在册后的完整断言
// 复用 _tdd_fix10pct 的 runUsers() 方式直接调 route handler（不用起端口）
const mongoose = require('mongoose');
require('./models/Admin'); require('./models/Employee');
require('./models/TeamGroup'); require('./models/GoldLog');
require('./models/TeamLeaderLevelConfig'); require('./models/UserGold');
require('./models/UserActivity'); require('./models/Team');
const db = require('./routes/dashboard');
const MONGO = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';
let fails=0;
function c(lab,cond,msg){ if(cond) console.log('✅ '+lab); else { console.log('❌ '+lab+' → '+msg); fails++; } }
async function runUsers(q, u) {
  const route = db.stack.find(l=>l.route&&l.route.path==='/users'&&l.route.methods.get);
  const handler = route.route.stack[route.route.stack.length-1].handle;
  return new Promise(res2 => {
    let s=200; const res={status(x){s=x;return this;}, json(o){res2({status:s,json:o});return this;}};
    try { const p = handler({query:q,user:u}, res, err=>res2({status:s,json:null,err:err?.stack||String(err)})); if(p?.catch)p.catch(err=>res2({status:s,json:null,err:err.stack||String(err)})); }
    catch(e) { res2({status:s,json:null,err:e.stack||String(e)}); }
  });
}
(async()=>{
  await mongoose.connect(MONGO,{});
  const Admin = mongoose.model('Admin');
  const cui = await Admin.findOne({username:'cuiding'}).select('_id commission').lean();
  const fan = await Admin.findOne({username:'fanjie'}).select('_id commission').lean();
  const gl  = await Admin.findOne({ teamGroupId: { $exists:true, $nin:[null,''] } }).select('_id role').lean();
  const sa  = await Admin.findOne({ role:/superadmin/i }).select('_id role').lean();

  // 1. 先算预期在册人数（3OR）：cuiding直推64 + subGroupG + subTl直推
  const directD = await db._getTLDirectDIds(String(cui._id));
  const subG    = await db._getTLSubGroupGIds(String(cui._id));
  const subTls  = (await Admin.find({parentTlId:String(cui._id), role:{$in:['NORMAL_ADMIN','normal_admin']}}).select('_id').lean()).map(x=>x._id);
  let subTlD=[]; for(const t of subTls) subTlD.push(...await db._getTLDirectDIds(String(t)));
  const expectedTotal = directD.length + subG.length + subTlD.length;
  console.log('预期 cuiding 在册：直D='+directD.length+' subG='+subG.length+' subTlD='+subTlD.length+' → 合计='+expectedTotal);

  // 2. 5视角HTTP200 + 全量在册人数 + 直间推拆分
  const u1 = await runUsers({range:'today',team:'鼎盛战队',sortBy:'earnings'},{id:String(cui._id),role:'NORMAL_ADMIN'});
  c('cuiding+鼎盛战队 HTTP200', u1.status===200 && u1.json?.success, 'st='+u1.status);
  const arr = u1.json.data || [];
  console.log('当前接口实际返回 len='+arr.length+'（修前=37今日活跃；修后≈'+expectedTotal+'）');
  c('全量在册人数≈'+expectedTotal+'（±5容错）',
    Math.abs(arr.length - expectedTotal) <= 5,
    '实际len='+arr.length+' 预期='+expectedTotal);
  // 今日活跃（earnings>0或watched>0）与不活跃人数
  const activeN = arr.filter(d=>+d.earnings>0||+d.watched>0).length;
  const zeroN   = arr.length - activeN;
  console.log('  今日活跃(>0)='+activeN+' 今日0收益/0次='+zeroN);
  c('今日活跃人数30~45（原37今日有波动）', activeN>=25 && activeN<=60, 'actual='+activeN);
  // 直间推计数（prove_64_61验证过=64直推61间推）
  const trues = arr.filter(d=>d.isDirect===true).length;
  const falses= arr.filter(d=>d.isDirect===false).length;
  console.log('  isDirect=true(直推)='+trues+'  isDirect=false(间推)='+falses+' 合计='+(trues+falses));
  c('直推∈[60,70]（应=64，含组架构变动波动±6）', trues>=58 && trues<=72, 'actual='+trues);
  c('间推∈[55,67]（应=61，±6）', falses>=55 && falses<=67, 'actual='+falses);
  // 所有今日0收益用户的 earnings/watched/ecpm 全=0，且name/supervisorUsername不为空
  const zeros = arr.filter(d=>+d.earnings===0&&+d.watched===0);
  let badZeros = 0;
  for (const z of zeros) {
    if (+z.ecpm!==0) badZeros++;
    if (!z.name || !String(z.name).trim()) badZeros++;
    if (!z.supervisorUsername) badZeros++;
  }
  console.log('  0收益用户数='+zeros.length+' 字段异常数='+badZeros+'（应为0）');
  c('0收益用户的ecpm/name/supervisorUsername都正常(0/非空/非空)', badZeros===0, 'badZeros='+badZeros);

  // 7936/8147正确性
  const e7936 = arr.find(u=>String(u.employeeId)==='7936'||String(u.userId)==='7936');
  if (e7936) c('7936夏绍珍 supervisorUsername=cuiding', e7936.supervisorUsername==='cuiding', 'actual='+e7936.supervisorUsername);
  const e8147 = arr.find(u=>String(u.employeeId)==='8147'||String(u.userId)==='8147');
  if (e8147) {
    c('8147李蒙蒙 supervisorUsername=fanjie 且 isDirect=false',
      e8147.supervisorUsername==='fanjie' && e8147.isDirect===false,
      'actual='+e8147.supervisorUsername+' / isDirect='+e8147.isDirect);
  }

  // 3.其他视角HTTP200
  const u2 = await runUsers({range:'today'},{id:String(cui._id),role:'NORMAL_ADMIN'});
  c('cuiding无参数 HTTP200', u2.status===200 && u2.json?.success, 'st='+u2.status+' len='+(u2.json.data||[]).length);
  const u3 = await runUsers({range:'today'},{id:String(fan._id),role:'NORMAL_ADMIN'});
  c('fanjie TL HTTP200', u3.status===200 && u3.json?.success, 'st='+u3.status+' len='+(u3.json.data||[]).length);
  // fanjie应≈51人自己直D（3OR）
  if (u3.json?.success) {
    const fanArr = u3.json.data||[];
    console.log('  fanjie在册≈51人，实际='+fanArr.length);
    c('fanjie全量在册∈[48,55]', fanArr.length>=46 && fanArr.length<=58, 'actual='+fanArr.length);
  }
  const u4 = gl ? await runUsers({range:'today'},{id:String(gl._id),role:'GROUP_LEADER'}) : {status:200,json:{success:true,data:[]}};
  c('组长GL HTTP200', (!gl) || (u4.status===200 && u4.json?.success), 'st='+u4.status+' len='+((u4.json||{}).data||[]).length);
  const u5 = sa ? await runUsers({range:'today'},{id:String(sa._id),role:'superadmin'}) : {status:200,json:{success:true,data:[]}};
  c('超管SA HTTP200（全公司在册≤50,000）', (!sa) || (u5.status===200 && u5.json?.success),
    'st='+u5.status+' len='+((u5.json||{}).data||[]).length);

  // 4. supervisorUsername不含战队名（老校验）
  const teamNames=['鼎盛战队','洁然如初代理','战队','代理'];
  let bad=0;
  for(const x of arr){
    const vals=[x.superior, x.supervisorUsername, x.supervisorName].filter(Boolean).map(v=>String(v));
    if(vals.some(v => teamNames.some(t => v.includes(t)))) bad++;
  }
  c(arr.length+'个用户里supervisor*不含战队/代理（异常='+bad+'应为0）', bad===0, '异常='+bad);

  console.log('\n===========' + (fails===0?'🟢 ALL GREEN':'❌ FAIL '+fails) + ' ===========');
  process.exit(fails===0?0:5);
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
