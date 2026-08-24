// TDD RED 脚本：改组长 commission 后，展示层不追溯 + CommissionHistory 写入
// RED 阶段预期：FAIL 3 条（lastMonth/custom上月 被追溯 + 没写 CommissionHistory）
const http = require('http');
const BASE = 'http://127.0.0.1:3003';
const mongoose = require('mongoose');
const CommissionHistory = require('./models/CommissionHistory');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

let PASS = 0, FAIL = 0;
function a(name, ok, extra='') {
  if (ok) { console.log('OK ', name, extra); PASS++; }
  else    { console.log('❌ FAIL', name, extra); FAIL++; }
}
function close(x) { return +(Math.round(x*100)/100).toFixed(2); }
function req(path, opts={}) {
  return new Promise((res, rej) => {
    const u = new URL(BASE + path);
    const h = {'Content-Type':'application/json', ...(opts.token?{Authorization:'Bearer '+opts.token}:{})};
    let s; const r = http.request({hostname:u.hostname,port:u.port,method:opts.method||'GET',path:u.pathname+u.search,headers:h},resp=>{
      let b='';resp.on('data',c=>b+=c);resp.on('end',()=>{let d;try{d=JSON.parse(b)}catch(_){}
      res({status:resp.statusCode,d,b,ms:Date.now()-s});});});
    s=Date.now();r.on('error',rej);if(opts.body)r.write(JSON.stringify(opts.body));r.end();
  });
}
// 通过调「超管 RESET 组长档表」触发 invalidateLevelRelatedCaches() → 清 commission-stats/stats/performance 前缀缓存
async function clearCaches(AT) {
  const r = await req('/api/admin/group-leader/level-config/reset', { method: 'POST', token: AT });
  if (r.status!==200) console.warn('清缓存 RESET status=', r.status, r.b.slice(0,200));
}

(async () => {
  try {
    // === 0. 登录 ===
    const [ad, cd, fj] = await Promise.all([
      req('/api/admin/login',{method:'POST',body:{username:'admin',password:'admin123456'}}),
      req('/api/admin/login',{method:'POST',body:{username:'cuiding',password:'66668888'}}),
      req('/api/admin/login',{method:'POST',body:{username:'fanjie',password:'11112222'}}),
    ]);
    a('3账号登录成功', ad.status===200 && cd.status===200 && fj.status===200);
    const AT = ad.d.data.token, CT = cd.d.data.token, FT = fj.d.data.token;
    const fjTgid = fj.d.data.admin.teamGroupId;
    const fjAdminId = fj.d.data.admin.id;
    console.log('fanjie group(teamGroupId)=', fjTgid);

    // 先删本测试产生的 CommissionHistory，保证计数准确（测试环境用）
    await mongoose.connect(MONGODB_URI);
    await CommissionHistory.deleteMany({ teamGroupId: fjTgid, remark: { $regex: /^TDD:/ } });

    // === 0a. 强制把 fanjie 组比例先回到 OLD_RATE=0.10（之前可能有手动调成 0.17/0.18 的脏数据）——保证 PUT 变更 oldCommission=OLD_RATE 断言成立 ===
    const NEW_RATE = 0.15, OLD_RATE = 0.10;
    {
      const r0 = await req(`/api/admin/employee/group-leader/${fjTgid}`, {
        method: 'PUT', token: CT, body: { commission: OLD_RATE, remark: 'TDD: reset 2 OLD_RATE before benchmark' }
      });
      if (r0.status!==200 || !r0.d?.success) {
        console.warn('[WARN] 基准重置到 OLD_RATE=0.10 失败：', r0.status, r0.b.slice(0,300));
      } else {
        console.log('[0a] 已把 fanjie 组比例重置为基准 OLD_RATE=', OLD_RATE, '当前=', r0.d?.data?.commission);
      }
      await clearCaches(AT);
    }

    // 重置后再统计 CommissionHistory 基准（排除 TDD: 前缀）
    await CommissionHistory.deleteMany({ teamGroupId: fjTgid, remark: /^TDD:/ });
    const baseCHCount = await CommissionHistory.countDocuments({ teamGroupId: fjTgid });
    console.log('CommissionHistory 基准计数(非TDD)=', baseCHCount);

    // === 1. 清缓存 → 查基准值 BEFORE ===
    await clearCaches(AT);
    // commission-stats 三桶
    const csBefore = await req('/api/group-leader/commission-stats', { token: FT });
    a('基准 commission-stats HTTP 200', csBefore.status === 200 && csBefore.d?.success);
    const BASE = {};
    for (const b of ['today','month','lastMonth']) {
      BASE[`cs_${b}_comm`] = +csBefore.d.data[b].totalCommission;
      BASE[`cs_${b}_earn`] = +csBefore.d.data[b].totalEarnings;
      BASE[`cs_${b}_earnXrate`] = +(csBefore.d.data[b].totalEarnings * csBefore.d.data.commissionRate);
      // 注意：新逻辑 commission = sum(gold*日志固化 commissionRate)，不等于 earn × 当前组 displayRate（历史数据回填过比例）
      // 这里只打印 INFO，不再做 PASS/FAIL 旧链路验证：
      console.log(`  BEFORE cs_${b} earn=${close(BASE[`cs_${b}_earn`])} commission=${close(BASE[`cs_${b}_comm`])} earn×curDisplayRate=${close(BASE[`cs_${b}_earnXrate`])} (displayRate是当前组展示比例，不等于历史固化值正常)`);
    }
    // stats 4 种 range + custom上月
    for (const rng of ['today','yesterday','week','month']) {
      const s = await req(`/api/group-leader/stats?range=${rng}`, { token: FT });
      BASE[`stats_${rng}_comm`] = +s.d.data.totalCommission;
      BASE[`stats_${rng}_earn`] = +s.d.data.totalEarnings;
      console.log(`  BEFORE stats_${rng} earn=${close(BASE[`stats_${rng}_earn`])} commission=${close(BASE[`stats_${rng}_comm`])}`);
    }
    const now = new Date(); const lastM = new Date(now.getFullYear(), now.getMonth()-1, 1);
    const lastY = lastM.getFullYear(), lastMm = lastM.getMonth();
    const startStr = `${lastY}-${String(lastMm+1).padStart(2,'0')}-01`;
    const lastDay = new Date(lastY, lastMm+1, 0).getDate();
    const endStr = `${lastY}-${String(lastMm+1).padStart(2,'0')}-${lastDay}`;
    const sc = await req(`/api/group-leader/stats?range=custom&startDate=${startStr}&endDate=${endStr}`, { token: FT });
    BASE.stats_LASTM_comm = +sc.d.data.totalCommission;
    BASE.stats_LASTM_earn = +sc.d.data.totalEarnings;
    console.log(`  BEFORE stats_LASTM(custom上月) earn=${close(BASE.stats_LASTM_earn)} commission=${close(BASE.stats_LASTM_comm)}`);

    // === 2. PUT 改 commission 10% → 15%（通过 cuiding 改自己战队组长）===
    const groupNameBefore = csBefore.d.data.groupName;
    const put = await req(`/api/admin/employee/group-leader/${fjTgid}`, {
      method: 'PUT', token: CT, body: { groupName: groupNameBefore, commission: NEW_RATE, remark: 'TDD: change commission 10%→15% for test' }
    });
    a('PUT /admin/employee/group-leader 200/OK', put.status===200 && put.d?.success, `s=${put.status} body=${put.b.slice(0,300)}`);
    a('PUT 返回新 commission=0.15', +put.d?.data?.commission === NEW_RATE, `actual=${put.d?.data?.commission}`);
    // 清缓存再查
    await clearCaches(AT);

    // === 3. 关键 RED 断言：lastMonth 和上月 custom 的 commission 应该和 BEFORE 完全相同（不追溯） ===
    //    当前代码下应该 FAIL（因为 lastMonth 变成 earn * 最新15% = 1.5倍 old）
    const csAfter = await req('/api/group-leader/commission-stats', { token: FT });
    const csLastMonthAfter = +csAfter.d.data.lastMonth.totalCommission;
    const csLastMonthExpected = BASE.cs_lastMonth_comm;  // 不追溯 = 相同
    const csLastMonthOldWRONG = +(BASE.cs_lastMonth_earn * NEW_RATE);  // 追溯 = earn*15%
    const traceAbsMax_LM = Math.max(0.20, Math.abs(csLastMonthOldWRONG - csLastMonthExpected) / 10);  // 追溯差的 1/10 作为容差（避免新真实订单误判）
    console.log(`  AFTER cs_lastMonth commission=${close(csLastMonthAfter)}  不追溯预期=${close(csLastMonthExpected)}  追溯(当前bug)值=${close(csLastMonthOldWRONG)}  traceAbsMax=${close(traceAbsMax_LM)}`);
    a('【核心不追溯】commission-stats.lastMonth = BEFORE基准（改 commission 不影响上月）',
      Math.abs(csLastMonthAfter - csLastMonthExpected) < traceAbsMax_LM,
      `差=${close(csLastMonthAfter - csLastMonthExpected)}  若差≈${close(csLastMonthOldWRONG-csLastMonthExpected)} 说明被追溯`);
    // stats custom上月
    const scAfter = await req(`/api/group-leader/stats?range=custom&startDate=${startStr}&endDate=${endStr}`, { token: FT });
    const scLastMCommAfter = +scAfter.d.data.totalCommission;
    const scExpected = BASE.stats_LASTM_comm;
    const scWRONG = +(BASE.stats_LASTM_earn * NEW_RATE);
    const traceAbsMax_SC = Math.max(0.50, Math.abs(scWRONG - scExpected) / 10);
    console.log(`  AFTER stats_LASTM commission=${close(scLastMCommAfter)}  不追溯预期=${close(scExpected)}  追溯(bug)值=${close(scWRONG)}  traceAbsMax=${close(traceAbsMax_SC)}`);
    a('【核心不追溯】stats.custom(上月) = BEFORE基准',
      Math.abs(scLastMCommAfter - scExpected) < traceAbsMax_SC,
      `差=${close(scLastMCommAfter - scExpected)}  若差≈${close(scWRONG-scExpected)} 说明被追溯`);
    // 本月 today：新产生的业绩应该按新比例，但今天的业绩全是 10% 产生的老 GoldLog，所以 today commission 也应该 ≈ 基准（new 只有等未来产生的新 GoldLog commissionRate=0.15 才变）
    const csTodayAfter = +csAfter.d.data.today.totalCommission;
    const csTodayExpected = BASE.cs_today_comm;
    const csTodayWRONG = +(BASE.cs_today_earn * NEW_RATE);  // 追溯 = earn*15%
    const traceAbsMax_TD = Math.max(1.0, Math.abs(csTodayWRONG - csTodayExpected) / 10);
    console.log(`  AFTER cs_today commission=${close(csTodayAfter)}  不追溯预期=${close(csTodayExpected)}  追溯(bug)值=${close(csTodayWRONG)}  traceAbsMax=${close(traceAbsMax_TD)}`);
    a('【核心不追溯】commission-stats.today = BEFORE基准（今日业绩全是改之前产生的，commissionRate 都是0.10固化了）',
      Math.abs(csTodayAfter - csTodayExpected) < traceAbsMax_TD,
      `实际=${close(csTodayAfter)} 预期=${close(csTodayExpected)}  若差≈${close(csTodayWRONG-csTodayExpected)} 说明被追溯`);

    // === 4. 断言 CommissionHistory 写了一条 ===
    //    当前代码没写，RED 应该 FAIL
    const newCHCount = await CommissionHistory.countDocuments({ teamGroupId: fjTgid });
    const added = newCHCount - baseCHCount;
    a('PUT 改 commission 后 CommissionHistory 新增 1 条', added === 1,
      `新增条数=${added}  old=${baseCHCount} new=${newCHCount}`);
    if (added >= 1) {
      const latest = await CommissionHistory.findOne({ teamGroupId: fjTgid }).sort({ changeTime: -1 }).lean();
      a('CommissionHistory 字段正确 old=0.10 new=0.15', latest?.oldCommission===OLD_RATE && latest?.newCommission===NEW_RATE,
        JSON.stringify({oldC:latest?.oldCommission,newC:latest?.newCommission,by:latest?.operatorName}));
    }

    // === 5. 清理：PUT 回 10% + 清缓存 + 回滚基准值 ===
    await clearCaches(AT);
    const putRb = await req(`/api/admin/employee/group-leader/${fjTgid}`, {
      method: 'PUT', token: CT, body: { groupName: groupNameBefore, commission: OLD_RATE, remark: 'TDD: 回滚至10%' }
    });
    console.log('回滚PUT status=', putRb.status, 'data=', JSON.stringify(putRb.d?.data||{}).slice(0,250));
    a('回滚 PUT 成功', putRb.status===200 && putRb.d?.success && +putRb.d?.data?.commission===OLD_RATE);
    // 删除 TDD 产生的 CommissionHistory
    const del = await CommissionHistory.deleteMany({ teamGroupId: fjTgid, remark: /^TDD:/ });
    console.log('TDD 产生 CommissionHistory 清理条数=', del.deletedCount);
    await mongoose.disconnect();

    console.log(`\n========== TDD 结束：PASS=${PASS} FAIL=${FAIL} ==========`);
    process.exit(FAIL > 0 ? 1 : 0);
  } catch (e) {
    console.error('TDD CRASH:', e);
    process.exit(2);
  }
})();
