// ============================================================
// 【RED 阶段】TDD：模型A（团队长总包18%里扣组长10% = 分层抵扣）
// 核心：产生 1 笔 100 元测试订单 → fanjie commission +10, cuiding commission +2, 总包 +12
// ============================================================
const BASE = 'http://127.0.0.1:3003';
const http = require('http');
const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');
const Employee = require('./models/Employee');
const Admin = require('./models/Admin');
const TeamGroup = require('./models/TeamGroup');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';
let pass = 0, fail = 0;
function a(name, cond, extra='') {
  if (cond) { pass++; console.log('OK ', name, extra?(' '+extra):''); }
  else      { fail++; console.log('❌ FAIL', name, extra?(' '+extra):''); }
}
function req(path, {token, method='GET', body=null}={}) {
  return new Promise((resolve) => {
    const u = new URL(BASE + path);
    const h = { 'Content-Type':'application/json', 'Host': u.host };
    if (token) h.Authorization = 'Bearer '+token;
    const payload = body? JSON.stringify(body): null;
    if (payload) h['Content-Length'] = Buffer.byteLength(payload);
    const r = http.request({ hostname: u.hostname, port: u.port || 80, path: u.pathname+u.search, method, headers:h }, (res) => {
      let t = '';
      res.on('data', c => t += c);
      res.on('end', () => {
        let d = null;
        try { d = JSON.parse(t); } catch (_) {}
        resolve({ status: res.statusCode, d, b:t });
      });
    });
    r.on('error', (e) => resolve({ status:0, d:null, b:String(e) }));
    if (payload) r.write(payload);
    r.end();
  });
}

(async () => {
  // 1. 登录三账号
  const [at, ct, ft] = await Promise.all([
    req('/api/admin/login', { method:'POST', body:{ username:'admin', password:'admin123456' } }),
    req('/api/admin/login', { method:'POST', body:{ username:'cuiding', password:'66668888' } }),
    req('/api/admin/login', { method:'POST', body:{ username:'fanjie', password:'11112222' } }),
  ]);
  const AT = at.d?.data?.token, CT = ct.d?.data?.token, FT = ft.d?.data?.token;
  a('3 账号登录成功', !!AT && !!CT && !!FT, `AT=${AT?AT.length:0} CT=${CT?CT.length:0} FT=${FT?FT.length:0}`);

  await mongoose.connect(MONGODB_URI);
  // 2. 找 fanjie 组信息 → 找任意一个真实员工
  const fjAdmin = await Admin.findOne({ username:'fanjie' }).select('_id teamGroupId').lean();
  const tg = await TeamGroup.findOne({
    $or: [{ groupLeaderId: fjAdmin._id }, { groupLeaderId: fjAdmin._id.toString() }]
  }).select('_id groupName commission teamLeaderId').lean();
  a(`fanjie 所在组 id=${tg?._id} commission=${tg?.commission}`, !!tg, 'groupName='+tg?.groupName);

  // 找该组下一个真实员工
  const tgIdStr = String(tg._id);
  const tgIdObj = tg._id;
  const sampleEmp = await Employee.findOne({
    $or: [
      { teamGroupId: tgIdStr }, { teamGroupId: tgIdObj },
      { teamGroupId: fjAdmin._id.toString() }, { teamGroupId: fjAdmin._id }
    ]
  }).select('employeeId userId teamGroupId parentId').lean();
  a('找到 fanjie 组下员工 employeeId='+(sampleEmp?.employeeId||'(空)'), !!sampleEmp, 'emp='+JSON.stringify(sampleEmp));

  // 3. 清缓存（reset level-config + 强制组长比例变一下再变回来 → commissionChanged=true → 真触发 clear）
  await req('/api/admin/team-leader/level-config/reset', { method:'POST', token: AT });
  await req('/api/admin/group-leader/level-config/reset', { method:'POST', token: AT });
  const origCOMM = +tg.commission;
  const tempCOMM = Math.abs(origCOMM - 0.11) > 1e-6 ? 0.11 : 0.09;  // 选个和原值不同的
  await req(`/api/admin/employee/group-leader/${tgIdStr}`, { method:'PUT', token: CT, body:{ groupName: tg.groupName, commission: tempCOMM, remark: 'TDD ModelA: force clear BEFORE (temp)' } });
  await req(`/api/admin/employee/group-leader/${tgIdStr}`, { method:'PUT', token: CT, body:{ groupName: tg.groupName, commission: origCOMM, remark: 'TDD ModelA: restore, force clear BEFORE' } });
  await new Promise(r=>setTimeout(r, 500));

  // 4. BEFORE 快照：fanjie currentMonth.commission + cuiding summary.totalCommission
  const fjPfBefore = await req('/api/group-leader/performance', { token: FT });
  a('fanjie perf HTTP 200', fjPfBefore.status===200 && fjPfBefore.d?.data, `s=${fjPfBefore.status}`);
  const fjBeforeCm = +(fjPfBefore.d?.data?.currentMonth?.commission || 0);

  const cdPfBefore = await req('/api/team-leader/performance', { token: CT });
  a('cuiding perf HTTP 200', cdPfBefore.status===200 && cdPfBefore.d?.data?.summary, `s=${cdPfBefore.status}`);
  const cdBeforeTotalCm = +(cdPfBefore.d?.data?.summary?.totalCommission || 0);
  const cdBeforeDirectRev = +(cdPfBefore.d?.data?.summary?.directRevenue || 0);
  const cdBeforeGroupsRev = +(cdPfBefore.d?.data?.summary?.groupsRevenue || 0);
  console.log(`  BEFORE: fanjie.currentMonth.commission=${fjBeforeCm.toFixed(2)}`);
  console.log(`  BEFORE: cuiding.summary.totalCommission=${cdBeforeTotalCm.toFixed(2)}  D=${cdBeforeDirectRev}  G=${cdBeforeGroupsRev}`);

  // 5. 产生 1 笔测试 GoldLog（100 元 revenue = 100,000 金币）→ 走 pre save 固化
  //    createTime 必须是昨日（而非今日），这样才会进入 currentMonth/summary 累计统计（都截至昨日23:59:59）
  const yesterdayBJ = new Date(Date.now() + 8*3600*1000); yesterdayBJ.setUTCDate(yesterdayBJ.getUTCDate() - 1); yesterdayBJ.setUTCHours(18,0,0,0);
  const createTimeYesterday = new Date(yesterdayBJ.getTime() - 8*3600*1000); // 转 UTC（MongoDB存UTC）
  const GOLD = 100 * 1000;
  const NEW_LOG = new GoldLog({
    userId: sampleEmp.userId || '__test_user_modelA__',
    employeeId: sampleEmp.employeeId,
    deviceId: '__modelA_test__',
    gold: GOLD,
    ecpm: 0,
    slotId: '__tdd__',
    type: 'income',
    createTime: createTimeYesterday
  });
  NEW_LOG.commissionRate = undefined; // 强制让 pre save 走路径
  NEW_LOG.tlCommissionRate = undefined;
  await NEW_LOG.save();
  const NEW_ID = NEW_LOG._id;
  const savedRate = +NEW_LOG.commissionRate || 0;
  const savedTlRate = +NEW_LOG.tlCommissionRate;
  console.log(`  [产生测试订单 OK] _id=${NEW_ID}  revenue=100元  固化commissionRate=${savedRate}  tlCommissionRate=${savedTlRate}`);
  a(`新订单 save 后 commissionRate=组长比例(${tg.commission})`, Math.abs(savedRate - (+tg.commission||0)) < 1e-6, `actual=${savedRate}`);
  a(`新订单 save 后 tlCommissionRate=模型A spread(TL_rate12%−GL_rate10%=2%)`, 
    isNaN(savedTlRate) ? false : Math.abs(savedTlRate - 0.02) < 1e-6,
    `actual=${savedTlRate} (NaN=pre-save未触发)`);

  await new Promise(r=>setTimeout(r, 300));
  // 再清缓存（强制变→变回触发 commissionChanged=true clear）
  await req(`/api/admin/employee/group-leader/${tgIdStr}`, { method:'PUT', token: CT, body:{ groupName: tg.groupName, commission: tempCOMM, remark: 'TDD ModelA: 2nd force clear (temp)' } });
  await req(`/api/admin/employee/group-leader/${tgIdStr}`, { method:'PUT', token: CT, body:{ groupName: tg.groupName, commission: origCOMM, remark: 'TDD ModelA: 2nd restore' } });
  await new Promise(r=>setTimeout(r, 500));

  // 6. AFTER 快照
  const fjPfAfter = await req('/api/group-leader/performance', { token: FT });
  const cdPfAfter = await req('/api/team-leader/performance', { token: CT });
  const fjAfterCm = +(fjPfAfter.d?.data?.currentMonth?.commission || 0);
  const cdAfterTotalCm = +(cdPfAfter.d?.data?.summary?.totalCommission || 0);
  const deltaF = +(fjAfterCm - fjBeforeCm).toFixed(2);
  const deltaC = +(cdAfterTotalCm - cdBeforeTotalCm).toFixed(2);
  const sumBoth = +(deltaF + deltaC).toFixed(2);
  console.log(`  AFTER:  fanjie ΔF=${deltaF.toFixed(2)}`);
  console.log(`  AFTER:  cuiding ΔC=${deltaC.toFixed(2)}`);
  console.log(`  ΔF + ΔC = ${sumBoth.toFixed(2)}`);

  const TL_RATE = 0.12; // P5 默认档
  const GL_RATE = +tg.commission || 0;
  const EXP_F = +(GOLD/1000 * GL_RATE).toFixed(2);
  const EXP_C_A = +(GOLD/1000 * Math.max(0, TL_RATE - GL_RATE)).toFixed(2); // 模型A = 2 元
  const EXP_C_C = EXP_F; // 现状模型C（复用组长那份）= 10 元
  const EXP_SUM_A = +(EXP_F + EXP_C_A).toFixed(2);
  console.log(`  【模型A 正确预期】 ΔF=${EXP_F}  ΔC=${EXP_C_A}  总包sum=${EXP_SUM_A} (=TL_rate 12%封顶)`);
  console.log(`  【现状 模型C(错误)】 ΔF=${EXP_F}  ΔC=${EXP_C_C}  总包sum=${(EXP_F+EXP_C_C).toFixed(2)} (公司双重付 fanjie 的 10%两次)`);

  const diffA = Math.abs(deltaC - EXP_C_A);
  const diffCurrent = Math.abs(deltaC - EXP_C_C);
  console.log(`  实测ΔC: 距模型A=${diffA.toFixed(2)} 距现状=${diffCurrent.toFixed(2)}`);

  a('组长 fanjie ΔF ≈ 10 元（100 × 组长比例）', Math.abs(deltaF - EXP_F) < 1.0, `ΔF=${deltaF} expect=${EXP_F}`);
  a('团队长 cuiding ΔC 接近模型A的 2 元（而不是现状复用的 10 元）', diffA < diffCurrent,
    `实测ΔC=${deltaC}; 模型A差=${diffA.toFixed(2)} vs 现状差=${diffCurrent.toFixed(2)}`);
  a('公司总包 ΔF+ΔC ≈ TL_rate 封顶 12 元（不超过 15 元）', sumBoth >= 10 && sumBoth <= 16, `实测sum=${sumBoth} 预期≈12`);

  // 7. 回滚：删除测试 GoldLog
  const del = await GoldLog.deleteOne({ _id: NEW_ID });
  console.log(`  [回滚] 删除测试订单 deletedCount=${del.deletedCount}`);
  a('回滚测试数据成功', del.deletedCount===1);

  // 最后清缓存恢复（已经是 origCOMM，所以变再变回来清一次）
  await req(`/api/admin/employee/group-leader/${tgIdStr}`, { method:'PUT', token: CT, body:{ groupName: tg.groupName, commission: tempCOMM, remark: 'TDD ModelA: final force clear (temp)' } });
  await req(`/api/admin/employee/group-leader/${tgIdStr}`, { method:'PUT', token: CT, body:{ groupName: tg.groupName, commission: origCOMM, remark: 'TDD ModelA: final restore' } });

  await mongoose.disconnect();
  console.log(`\n========== TDD 结束：PASS=${pass} FAIL=${fail} ==========`);
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
