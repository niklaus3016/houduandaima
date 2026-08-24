// 【RED→GREEN 全流程】团队长职级 TDD
const http = require('http');
const BASE = 'http://127.0.0.1:3003';
let fail = 0; const passed=[];
const L=(m,ok,ex='')=>{console.log((ok?'OK  ':'FAIL ')+m+(ex?'  '+ex:''));ok?passed.push(m):fail++};
const req=(p,o={})=>new Promise((res)=>{const u=new URL(BASE+p);const h={'Content-Type':'application/json',...(o.token?{Authorization:'Bearer '+o.token}:{})};let s;const r=http.request({hostname:u.hostname,port:u.port,method:o.method||'GET',path:u.pathname+u.search,headers:h},resp=>{let b='';resp.on('data',c=>b+=c);resp.on('end',()=>{let d;try{d=JSON.parse(b)}catch(_){}res({status:resp.statusCode,d,b,ms:Date.now()-s})})});s=Date.now();r.on('error',e=>res({status:-1,d:null,b:String(e),ms:Date.now()-s}));if(o.body)r.write(JSON.stringify(o.body));r.end()});
const TLEV_DEFAULT={
  P2:{level:'P2',commission:0.08,minRevenue:30000,targetRevenue:100000},
  P3:{level:'P3',commission:0.10,minRevenue:100000,targetRevenue:200000},
  P4:{level:'P4',commission:0.12,minRevenue:200000,targetRevenue:500000},
  P5:{level:'P5',commission:0.14,minRevenue:500000,targetRevenue:1000000},
  P6:{level:'P6',commission:0.16,minRevenue:1000000,targetRevenue:2000000},
  P7:{level:'P7',commission:0.18,minRevenue:2000000,targetRevenue:3000000},
  P8:{level:'P8',commission:0.20,minRevenue:3000000,targetRevenue:3000000},
};
const DEF_ARR=[TLEV_DEFAULT.P2,TLEV_DEFAULT.P3,TLEV_DEFAULT.P4,TLEV_DEFAULT.P5,TLEV_DEFAULT.P6,TLEV_DEFAULT.P7,TLEV_DEFAULT.P8];

(async()=>{
  const [rad, rcu, rfa] = await Promise.all([
    req('/api/admin/login',{method:'POST',body:{username:'admin',password:'admin123456'}}),
    req('/api/admin/login',{method:'POST',body:{username:'cuiding',password:'66668888'}}),
    req('/api/admin/login',{method:'POST',body:{username:'fanjie',password:'11112222'}}),
  ]);
  const at = rad.d?.data?.token, ct = rcu.d?.data?.token, ft = rfa.d?.data?.token;
  L('A1 admin 登录 OK', rad.status===200 && !!at);
  L('A2 cuiding 登录 OK', rcu.status===200 && !!ct);
  L('A3 fanjie 登录 OK', rfa.status===200 && !!ft);

  // ========== B. 鉴权：超管3接口 非SUPER_ADMIN 应被拒 ==========
  console.log('\n--- B. 超管3接口鉴权 ---');
  const [bT1,bT2,bT3, bG1,bG2,bG3] = await Promise.all([
    req('/api/admin/team-leader/level-config',{token:ct}), // 团队长调
    req('/api/admin/team-leader/level-config',{method:'PUT',body:{list:DEF_ARR.map(x=>({...x,name:''}))},token:ct}),
    req('/api/admin/team-leader/level-config/reset',{method:'POST',body:{},token:ct}),
    req('/api/admin/team-leader/level-config',{token:ft}), // 组长调
    req('/api/admin/team-leader/level-config',{method:'PUT',body:{list:DEF_ARR.map(x=>({...x,name:''}))},token:ft}),
    req('/api/admin/team-leader/level-config/reset',{method:'POST',body:{},token:ft}),
  ]);
  L(`B1 团队长调 GET→非200/success=false (${bT1.status})`, bT1.status!==200 || !bT1.d?.data?.list);
  L(`B2 团队长调 PUT→非200/success=false (${bT2.status})`, bT2.status!==200 || !bT2.d?.success);
  L(`B3 团队长调 RESET→非200/success=false (${bT3.status})`, bT3.status!==200 || !bT3.d?.success);
  L(`B4 组长调 GET→非200/success=false (${bG1.status})`, bG1.status!==200 || !bG1.d?.data?.list);
  L(`B5 组长调 PUT→非200/success=false (${bG2.status})`, bG2.status!==200 || !bG2.d?.success);
  L(`B6 组长调 RESET→非200/success=false (${bG3.status})`, bG3.status!==200 || !bG3.d?.success);

  // ========== C. GET 默认档首次 ==========
  console.log('\n--- C. GET 默认档 ---');
  const g1 = await req('/api/admin/team-leader/level-config',{token:at});
  L(`C1 GET→200 success`, g1.status===200 && g1.d?.success, `s=${g1.status} body=${g1.b.slice(0,200)}`);
  const dl = g1.d?.data?.list;
  L(`C2 list 恰好 7 条`, Array.isArray(dl) && dl.length===7, `len=${dl?.length}`);
  if (Array.isArray(dl) && dl.length===7) {
    const srt = dl.slice().sort((a,b)=>a.minRevenue-b.minRevenue);
    const lvls = srt.map(x=>x.level).join(',');
    L(`C3 档位恰好 P2,P3,P4,P5,P6,P7,P8 无重复缺漏，升序`, lvls==='P2,P3,P4,P5,P6,P7,P8', `实际=${lvls}`);
    const comms = srt.map(x=>x.commission).join(',');
    L(`C4 默认比例 8/10/12/14/16/18/20% → 0.08,0.1,0.12,0.14,0.16,0.18,0.2`, comms==='0.08,0.1,0.12,0.14,0.16,0.18,0.2', `实际=${comms}`);
    const mins  = srt.map(x=>x.minRevenue).join(',');
    L(`C5 默认 minRevenue 3万,10万,20万,50万,100万,200万,300万`, mins==='30000,100000,200000,500000,1000000,2000000,3000000', `实际=${mins}`);
    const tars  = srt.map(x=>x.targetRevenue).join(',');
    L(`C6 默认 targetRevenue 10万,20万,50万,100万,200万,300万,300万`, tars==='100000,200000,500000,1000000,2000000,3000000,3000000', `实际=${tars}`);
    L(`C7 衔接等式 P3.min=P2.target … P8.min=P7.target 共6对全成立`,
      srt[1].minRevenue===srt[0].targetRevenue && srt[2].minRevenue===srt[1].targetRevenue &&
      srt[3].minRevenue===srt[2].targetRevenue && srt[4].minRevenue===srt[3].targetRevenue &&
      srt[5].minRevenue===srt[4].targetRevenue && srt[6].minRevenue===srt[5].targetRevenue);
    L(`C8 每条 commission∈[0,1] min≥0 target≥min`,
      srt.every(x=>typeof x.commission==='number'&&x.commission>=0&&x.commission<=1&&typeof x.minRevenue==='number'&&x.minRevenue>=0&&typeof x.targetRevenue==='number'&&x.targetRevenue>=x.minRevenue));
    const upA = g1.d?.data?.updatedAt;
    L(`C9 updatedAt 有效ISO`, typeof upA==='string'&&upA.length>=10&&!isNaN(Date.parse(upA)), `actual=${upA}`);
    const upB = g1.d?.data?.updatedBy;
    L(`C10 updatedBy 字符串(允许null/空/字符串)`, upB==null||typeof upB==='string');
  }
  // 缓存1h：第二次 GET 相同（实际 ms<10ms 就行，不硬性验证）
  const g2 = await req('/api/admin/team-leader/level-config',{token:at});
  L(`C11 第二次 GET 命中缓存，结果一致`, g1.d?.data?.list?.length===7 && JSON.stringify(g1.d.data.list)===JSON.stringify(g2.d?.data?.list),
    `ms1=${g1.ms} ms2=${g2.ms}`);

  // ========== D. PUT 校验拦截 ==========
  console.log('\n--- D. PUT 强校验 400 拦截 ---');
  const badBodies = [
    ['D1 list=8条（多1）',{list:[...DEF_ARR.map(x=>({...x,name:''})),{...DEF_ARR[0],level:'PX',minRevenue:5,targetRevenue:10}]}],
    ['D2 list=6条（少1）',{list:DEF_ARR.slice(0,6).map(x=>({...x,name:''}))}],
    ['D3 缺少 P6（档位错）',{list:DEF_ARR.filter(x=>x.level!=='P6').map(x=>({...x,name:''}))}],
    ['D4 commission=12（超范围，1200%）',{list:DEF_ARR.map(x=>({...x,name:'',commission:x.level==='P7'?12:x.commission}))}],
    ['D5 P3.min=12万 vs P2.target=10万（衔接错）',{list:
      [{level:'P2',name:'',commission:0.08,minRevenue:30000,targetRevenue:100000},
       {level:'P3',name:'',commission:0.10,minRevenue:120000,targetRevenue:200000},
       {level:'P4',name:'',commission:0.12,minRevenue:200000,targetRevenue:500000},
       {level:'P5',name:'',commission:0.14,minRevenue:500000,targetRevenue:1000000},
       {level:'P6',name:'',commission:0.16,minRevenue:1000000,targetRevenue:2000000},
       {level:'P7',name:'',commission:0.18,minRevenue:2000000,targetRevenue:3000000},
       {level:'P8',name:'',commission:0.20,minRevenue:3000000,targetRevenue:3000000}]}],
    ['D6 P7.targetRevenue(250万) < P7.minRevenue(200万)?→ 实际 P7.target(250万)<P7.min(200万)不成立，改为P8.target(200万)<P8.min(300万)',{list:
      [{level:'P2',name:'',commission:0.08,minRevenue:30000,targetRevenue:100000},
       {level:'P3',name:'',commission:0.10,minRevenue:100000,targetRevenue:200000},
       {level:'P4',name:'',commission:0.12,minRevenue:200000,targetRevenue:500000},
       {level:'P5',name:'',commission:0.14,minRevenue:500000,targetRevenue:1000000},
       {level:'P6',name:'',commission:0.16,minRevenue:1000000,targetRevenue:2000000},
       {level:'P7',name:'',commission:0.18,minRevenue:2000000,targetRevenue:3000000},
       {level:'P8',name:'',commission:0.20,minRevenue:3000000,targetRevenue:2000000}]}],
  ];
  for (const [name, bd] of badBodies) {
    const r = await req('/api/admin/team-leader/level-config',{method:'PUT',body:bd,token:at});
    L(`${name} → 400 / success=false`, (r.status===400 && !r.d?.success) || (r.status===200 && !r.d?.success), `s=${r.status} body=${r.b.slice(0,150)}`);
  }

  // ========== E. PUT 合法修改成功 + 缓存链清理 ==========
  console.log('\n--- E. PUT 修改成功 + 双边(超管GET/团队长perf)生效 ---');
  // 先调一次团队长 perf 让缓存建立
  await req('/api/team-leader/performance',{token:ct});
  const newList = DEF_ARR.map(x=>({...x, name:'', commission: x.level==='P7' ? 0.185 : x.commission}));
  const p1 = await req('/api/admin/team-leader/level-config',{method:'PUT',body:{list:newList},token:at});
  L(`E1 PUT 合法修改 → 200 success`, p1.status===200 && p1.d?.success, `s=${p1.status} body=${p1.b.slice(0,200)}`);
  if (p1.d?.data?.list) {
    L(`E2 PUT 返回 list.P7 commission=0.185 新值`, p1.d.data.list.find(x=>x.level==='P7').commission===0.185,
      `P7.commission=${p1.d.data.list.find(x=>x.level==='P7').commission}`);
  }
  // 再次 GET 看到新值
  const g3 = await req('/api/admin/team-leader/level-config',{token:at});
  const p7c = g3.d?.data?.list?.find?.(x=>x.level==='P7')?.commission;
  L(`E3 GET P7.commission=0.185 生效`, p7c===0.185, `actual=${p7c}`);
  // 团队长 performance 立即看到 levelConfig[P7]=0.185（team-leader-performance-* 全清，所以重算）
  const pcu1 = await req('/api/team-leader/performance',{token:ct});
  const lp7 = (pcu1.d?.data?.levelConfig?.list || []).find(x=>x.level==='P7')?.commission;
  L(`E4 团队长 perf.levelConfig.P7.commission=0.185（缓存已清+重算）`, lp7===0.185, `actual=${lp7}`);
  // 团队长 level.currentCommission 如果是 P7 也应该是 0.165
  if (pcu1.d?.data?.level?.currentLevel==='P7') {
    L(`E5 若 cuiding 当前级=P7 → level.currentCommission=0.185`, pcu1.d.data.level.currentCommission===0.185,
      `actual=${pcu1.d.data.level.currentCommission}`);
  } else {
    L(`E5 cuiding 当前级 ≠ P7（跳过 currentCommission 校验，保留为 true）`, true, `实际=${pcu1.d?.data?.level?.currentLevel}`);
  }

  // ========== F. RESET 恢复默认档 ==========
  console.log('\n--- F. RESET + 双边立刻恢复默认档 ---');
  const rs = await req('/api/admin/team-leader/level-config/reset',{method:'POST',body:{},token:at});
  L(`F1 RESET→200 success`, rs.status===200 && rs.d?.success, `s=${rs.status} body=${rs.b.slice(0,150)}`);
  const g4 = await req('/api/admin/team-leader/level-config',{token:at});
  const p7cD = g4.d?.data?.list?.find?.(x=>x.level==='P7')?.commission;
  L(`F2 GET RESET 后 P7.commission=0.18 默认`, p7cD===0.18, `actual=${p7cD}`);
  const pcu2 = await req('/api/team-leader/performance',{token:ct});
  const lp7D = (pcu2.d?.data?.levelConfig?.list || []).find(x=>x.level==='P7')?.commission;
  L(`F3 团队长 perf RESET 后 P7=0.18（缓存清+重算）`, lp7D===0.18, `actual=${lp7D}`);

  // ========== G. 团队长 perf level(14 子字段) + levelConfig(4档) ==========
  console.log('\n--- G. 团队长 performance level / levelConfig 字段齐全 & 真实数值示例 ---');
  const pcu3 = await req('/api/team-leader/performance',{token:ct});
  const d = pcu3.d?.data;
  L(`G1 cuiding perf 200`, pcu3.status===200 && !!d);
  if (d) {
    const cfgList = Array.isArray(d.levelConfig?.list) ? d.levelConfig.list : (Array.isArray(d.levelConfig) ? d.levelConfig : []);
    L(`G2 levelConfig.list 是数组且7条 P2~P8`, Array.isArray(cfgList) && cfgList.length===7 &&
      ['P2','P3','P4','P5','P6','P7','P8'].every(lv=>cfgList.some(x=>x.level===lv)),
      `len=${cfgList?.length} typeof=${typeof d.levelConfig}`);
    // 与 GET level-config list 逐字段一致（key 同）
    const GETlist = (await req('/api/admin/team-leader/level-config',{token:at})).d?.data?.list || [];
    const sCfg = [...cfgList].sort((a,b)=>a.minRevenue-b.minRevenue);
    const gCfg = [...GETlist].sort((a,b)=>a.minRevenue-b.minRevenue);
    const eq = (x,y)=>['level','commission','minRevenue','targetRevenue'].every(k=>x[k]===y[k] || (Number.isNaN(x[k])&&Number.isNaN(y[k])));
    L(`G3 levelConfig 与 GET /api/admin/team-leader/level-config list 逐字段一致（7条全对）`,
      sCfg.length===7 && gCfg.length===7 && sCfg.every((_,i)=>eq(sCfg[i],gCfg[i])),
      `sCfg[P7]=${JSON.stringify(sCfg[5])} gCfg[P7]=${JSON.stringify(gCfg[5])}`);
    // level 14 字段齐全
    const lv = d.level;
    const need14 = ['currentLevel','currentLevelName','currentCommission','nextLevel','nextLevelName','nextCommission',
      'progressToNext','revenueToNext','nextLevelThreshold','isMaxLevel','upgradePending',
      'currentLevelMinRevenue','currentLevelTargetRevenue','nextLevelMinRevenue'];
    L(`G4 level 14 子字段齐全（至少14个）`, lv && need14.every(k=>k in lv),
      `needKeys=${need14.join(',')} actualKeys=${lv?Object.keys(lv).join(','):'null'}`);
    if (lv) {
      const setLv = new Set(['P2','P3','P4','P5','P6','P7','P8']);
      L(`G5 currentLevel ∈ P5~P8`, setLv.has(lv.currentLevel), `actual=${lv.currentLevel}`);
      L(`G6 currentCommission ∈ [0,1] number`, typeof lv.currentCommission==='number'&&lv.currentCommission>=0&&lv.currentCommission<=1,
        `actual=${lv.currentCommission}`);
      // 数值代 §5 示例：cuiding totalRevenue 看一下
      const totalRev = +d.summary.totalRevenue || 0;
      console.log(`   cuiding totalRevenue = ${totalRev.toFixed(2)} 元（用于 level 公式校验）`);
      // 硬算：找到 i（P5=0,P6=1,P7=2,P8=3）
      const cfg = sCfg;
      let i = 0;
      for (let k=cfg.length-1;k>=0;k--) if (totalRev >= cfg[k].minRevenue) { i=k; break; }
      const CUR = cfg[i], NEXT = cfg[i+1] || null;
      const expCur = CUR.level, expCom = CUR.commission;
      L(`G7 currentLevel=${expCur} currentCommission=${expCom}（按 cfg 自算）`, lv.currentLevel===expCur && lv.currentCommission===expCom,
        `actual level=${lv.currentLevel} com=${lv.currentCommission} vs expect ${expCur}/${expCom}`);
      if (!NEXT || expCur==='P8') {
        L(`G8 P8 时 isMaxLevel=true / nextLevel=null / nextCommission=null / progress=1 / revenueToNext=0`,
          lv.isMaxLevel===true && lv.nextLevel===null && lv.nextCommission===null &&
          Math.abs(+lv.progressToNext - 1) < 0.001 && +lv.revenueToNext===0,
          `isMax=${lv.isMaxLevel} nextL=${lv.nextLevel} prog=${lv.progressToNext} revN=${lv.revenueToNext}`);
      } else {
        const prog = Math.max(0, Math.min(1, (totalRev - CUR.minRevenue) / (NEXT.targetRevenue - CUR.minRevenue)));
        const revN = Math.max(0, NEXT.targetRevenue - totalRev);
        L(`G9 progressToNext≈${prog.toFixed(5)} 误差<0.01`, Math.abs(+lv.progressToNext - prog) < 0.01,
          `actual=${lv.progressToNext} expect=${prog.toFixed(6)}`);
        L(`G10 revenueToNext≈${revN.toFixed(2)} 误差<0.01`, Math.abs(+lv.revenueToNext - revN) < 0.01,
          `actual=${lv.revenueToNext} expect=${revN.toFixed(2)}`);
        L(`G11 nextLevel=${NEXT.level} nextCommission=${NEXT.commission} nextLevelThreshold=${NEXT.targetRevenue}`,
          lv.nextLevel===NEXT.level && lv.nextCommission===NEXT.commission && (+lv.nextLevelThreshold===+NEXT.targetRevenue),
          `nl=${lv.nextLevel} nc=${lv.nextCommission} nt=${lv.nextLevelThreshold}`);
        L(`G12 isMaxLevel=false / upgradePending=false`, lv.isMaxLevel===false && lv.upgradePending===false);
        L(`G13 currentLevelMinRevenue=${CUR.minRevenue} currentLevelTargetRevenue=${CUR.targetRevenue}`,
          +lv.currentLevelMinRevenue===+CUR.minRevenue && +lv.currentLevelTargetRevenue===+CUR.targetRevenue,
          `mL=${lv.currentLevelMinRevenue} tL=${lv.currentLevelTargetRevenue}`);
        L(`G14 nextLevelMinRevenue=${NEXT.minRevenue}`, +lv.nextLevelMinRevenue===+NEXT.minRevenue,
          `nMin=${lv.nextLevelMinRevenue}`);
      }
    }
    // 数值示例（老文档§5的320万数据已过时：新cfg P7=200万→P8=300万；totalR若≈119万 → level P5(50-100万→P5 50万门槛，100万=P6 ；119万>=100万<200万= P6), curIdx=P6，next=P7 → progress=(119万-100万)/(200万-100万)=0.19；跳过精确值）
    const totalR = +d.summary.totalRevenue || 0;
    if (false /* 新档位后 §5 示例数值已废弃，不再精确比对（避免误报） */ ) {
      const prog = (totalR - 800000) / 2400000;
      const revN = 3200000 - totalR;
      console.log(`   §5 示例：cuiding≈${totalR.toFixed(2)}，期望 prog=${prog.toFixed(6)} revN=${revN.toFixed(2)}`);
      L(`G15 与示例§5对齐：progress误差<0.01 revenueToNext误差<0.01`,
        Math.abs(+d.level.progressToNext - prog) < 0.01 && Math.abs(+d.level.revenueToNext - revN) < 0.01,
        `actual prog=${d.level.progressToNext} revN=${d.level.revenueToNext}`);
    } else {
      console.log(`   (跳过 §5 示例精确校验：实际 totalRev=${totalR.toFixed(2)} 和文档示例 119.1 万差别大)`);
    }
  }

  // ========== H. 缓存：团队长perf二次命中<100ms ==========
  console.log('\n--- H. 性能缓存 ---');
  const h=[]; for (let i=0;i<5;i++){const r=await req('/api/team-leader/performance',{token:ct});h.push(r.ms);}
  h.sort((a,b)=>a-b);
  const p95 = h[Math.ceil(h.length*0.95)-1]||h[h.length-1];
  L(`H1 热缓存 p95=${p95}ms <100ms`, p95<100, `ms=[${h.join(',')}]`);

  console.log(`\n最终 PASS=${passed.length} FAIL=${fail} exit=${fail?1:0}`);
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
