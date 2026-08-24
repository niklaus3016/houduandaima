// 【RED - 必失败】团队长业绩接口 TDD 测试
const http = require('http');
const mongoose = require('mongoose');
require('./models/Admin');
const BASE = 'http://127.0.0.1:3003';
const MONGO = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';
let fail = 0;
const L=(m,ok,ex='')=>{console.log((ok?'OK  ':'FAIL ')+m+(ex?'  '+ex:''));if(!ok)fail++};
const req=(p,o={})=>new Promise((res,rej)=>{const u=new URL(BASE+p);const h={'Content-Type':'application/json',...(o.token?{Authorization:'Bearer '+o.token}:{})};let s;const r=http.request({hostname:u.hostname,port:u.port,method:o.method||'GET',path:u.pathname+u.search,headers:h},resp=>{let b='';resp.on('data',c=>b+=c);resp.on('end',()=>{let d;try{d=JSON.parse(b)}catch(_){}res({status:resp.statusCode,d,b,ms:Date.now()-s})})});s=Date.now();r.on('error',rej);if(o.body)r.write(JSON.stringify(o.body));r.end()});

(async()=>{
  // === 前置：找一个真实 GROUP_LEADER 角色账号做「组长访问->失败」测试（fanjie现在是NORMAL_ADMIN不是组长，不能再用）===
  await mongoose.connect(MONGO);
  const Admin = mongoose.model('Admin');
  // 先在DB里创建一个独立的组长测试账号（避免污染fanjie/cuiding）
  const GL_USER = '__tdd_gl_perf__';
  const GL_PASS = 'gl123456';
  const bcrypt = require('bcryptjs');
  const hash = bcrypt.hashSync(GL_PASS, 8);
  await Admin.deleteOne({username:GL_USER}).exec();
  const glAdmin = await new Admin({
    username:GL_USER, password:hash, realName:'TDD组长',
    role:'GROUP_LEADER', status:'active',
    commission:0.06,
  }).save();
  console.log('  前置：新建组长测试账号',GL_USER,'_id=', glAdmin._id.toString());

  const [rc, rf, ra, rg] = await Promise.all([
    req('/api/admin/login',{method:'POST',body:{username:'cuiding',password:'66668888'}}),
    req('/api/admin/login',{method:'POST',body:{username:'fanjie',password:'11112222'}}),
    req('/api/admin/login',{method:'POST',body:{username:'admin',password:'admin123456'}}),
    req('/api/admin/login',{method:'POST',body:{username:GL_USER,password:GL_PASS}}),
  ]);
  const ct = rc.d?.data?.token || rc.d?.token;
  const ft = rf.d?.data?.token || rf.d?.token;
  const at = ra.d?.data?.token || ra.d?.token;
  const gt = rg.d?.data?.token || rg.d?.token;
  L('cuiding团队长登录', rc.status===200 && !!ct, rc.b.slice(0,120));
  L('fanjie登录', rf.status===200 && !!ft);
  L('超管admin登录', ra.status===200 && !!at);
  L('独立组长账号登录', rg.status===200 && !!gt, `s=${rg.status}`);

  console.log('\n--- 1. 鉴权 非团队长应失败 ---');
  const [a1,a2] = await Promise.all([
    req('/api/team-leader/performance',{token: at}),
    req('/api/team-leader/performance',{token: gt}),
  ]);
  L('超管自己访问自己(无userId)->失败(success=false或非200或无summary)', !a1.d?.data?.summary, `s=${a1.status}`);
  L('真GROUP_LEADER组长访问(自己未传userId->失败(success=false或非200或无summary)', !a2.d?.data?.summary, `s=${a2.status}`);

  console.log('\n--- 2. 顶层结构 6key ---');
  const good = await req('/api/team-leader/performance',{token: ct});
  L('cuiding访问200有data', good.status===200 && (good.d?.data || good.d?.summary), `s=${good.status}`);
  const d = good.d?.data ?? good.d;
  if (d && d.summary) {
    const need = ['summary','monthly','daily','currentMonth','level','levelConfig'];
    L(`6顶层key齐全`, need.every(k=>k in d), 'keys='+Object.keys(d).join(','));
    // 最新职级体系已上线：level/levelConfig 不再是 null
    L('level!==null 且有 currentLevel', d.level!==null && d.level!==undefined && !!d.level.currentLevel, 'typeof='+typeof d.level+' cur='+JSON.stringify(d.level?.currentLevel));
    // 最新职级：团队长7档 P2~P8（组长1档P1）
    L('levelConfig.list有7条(P2~P8)', Array.isArray(d.levelConfig?.list) && d.levelConfig.list.length===7,
      `typeof=${typeof d.levelConfig} list?.len=${d.levelConfig?.list?.length}`);
  }

  console.log('\n--- 3. summary total===direct+groups + 下属TL.subordinateTlRevenue（3层级）---');
  if (d?.summary) {
    const s=d.summary;
    const total = +s.totalRevenue||0;
    const dr = +s.directRevenue||0;
    const gr = +s.groupsRevenue||0;
    const sr = +s.subordinateTlRevenue||0;
    L('totalRevenue===direct+groups+subordinateTlRevenue（差<0.01）', Math.abs(total - (dr + gr + sr)) < 0.01,
      `t=${total} d=${dr} g=${gr} subTl=${sr}`);
    L('teamFoundedAt有效ISO', typeof s.teamFoundedAt==='string' && !isNaN(Date.parse(s.teamFoundedAt)), s.teamFoundedAt);
    L('operatingDays正整数', Number.isInteger(s.operatingDays) && s.operatingDays>0, String(s.operatingDays));
    L('teamName字符串', typeof s.teamName==='string', String(s.teamName));
    console.log('   summary=', JSON.stringify(s));
  }

  console.log('\n--- 4. monthly结构 ---');
  if (d?.monthly) {
    const ms = d.monthly;
    L('monthly数组>=1', Array.isArray(ms) && ms.length>=1, `len=${ms?.length}`);
    L('每项{month(YYYY-MM),revenue}', ms.every(x=>/^\d{4}-\d{2}$/.test(x.month)&&typeof x.revenue==='number'));
    const bj = new Date(Date.now()+8*3600*1000);
    const curYm = `${bj.getUTCFullYear()}-${String(bj.getUTCMonth()+1).padStart(2,'0')}`;
    L(`monthly含当月${curYm}`, ms.some(x=>x.month===curYm), `(${ms.length})=${ms.map(x=>x.month).join(',')}`);
  }

  console.log('\n--- 5. daily Σ===currentMonth.revenue ---');
  if (d?.daily && d?.currentMonth) {
    const ds = d.daily, cm=d.currentMonth;
    L(`daily年月=${cm.yearMonth}`, ds[0]?.date?.slice(0,7)===cm.yearMonth, `daily=${ds[0]?.date} cm=${cm.yearMonth}`);
    L(`daily条数=${cm.daysPassed}或${cm.daysInMonth}`, ds.length===cm.daysPassed||ds.length===cm.daysInMonth, `len=${ds.length}`);
    L('每条{date,weekday,revenue}', ds.every(x=>/^\d{4}-\d{2}-\d{2}$/.test(x.date)&&typeof x.weekday==='number'&&typeof x.revenue==='number'));
    const sum = ds.reduce((s,x)=>s+(+x.revenue||0),0);
    L('Σdaily===currentMonth.revenue（差<0.01）', Math.abs(sum - (+cm.revenue||0))<0.01,
      `dailySum=${sum.toFixed(3)} cm=${cm.revenue}`);
    console.log(`   cm=`, JSON.stringify(cm));
  }

  console.log('\n--- 6. 抽样对账 fanjie组（cuiding下属）组长端 vs cuiding团队长端 groupsRevenue ---');
  if (ct && ft) {
    const [pF,pC] = await Promise.all([
      req('/api/group-leader/performance',{token:ft}),
      req('/api/team-leader/performance',{token:ct}),
    ]);
    const fd = pF.d?.data||pF.d, cd = pC.d?.data||pC.d;
    const fTot = +(fd?.summary?.totalRevenue)||0;
    const cG = +(cd?.summary?.groupsRevenue)||0;
    L(`cuiding.groupsRevenue(${cG}) >= fanjie组长累计(${fTot})`, cG + 0.001 >= fTot, `diff=${(cG-fTot).toFixed(2)}`);
  }

  console.log('\n--- 7. 缓存热读 <100ms ---');
  const r1 = await req('/api/team-leader/performance',{token:ct});
  const r2 = await req('/api/team-leader/performance',{token:ct});
  const r3 = await req('/api/team-leader/performance',{token:ct});
  L(`m2=${r2.ms} m3=${r3.ms} 都<100ms`, r2.ms<100 && r3.ms<100, `${r1.ms}/${r2.ms}/${r3.ms}`);

  console.log('\n--- 8. 响应大小 raw<20KB ---');
  const last = await req('/api/team-leader/performance',{token:ct});
  const KB = Buffer.byteLength(last.b,'utf8')/1024;
  L(`raw=${KB.toFixed(2)}KB <20KB`, KB<20, `${KB.toFixed(2)}KB`);

  console.log(`\nFAIL=${fail} exit=${fail?1:0}`);
  // 清理脏数据：新建的GL账号
  try { await Admin.deleteOne({username:GL_USER}).exec(); console.log(`  清理：组长测试账号 ${GL_USER} 已删除`); } catch(_){}
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);try{require('mongoose').model('Admin').deleteOne({username:'__tdd_gl_perf__'}).exec();}catch(_){} process.exit(1)});
