// RED: 组长业绩接口 levelConfig 必须 8 条(P1~P8) + level 字段补全(nextLevel/nextCommission 等)
const mongoose = require('mongoose');
require('./models/Admin'); require('./models/Employee');
require('./models/TeamGroup'); require('./models/GoldLog');
require('./models/TeamLeaderLevelConfig'); require('./models/UserGold');
require('./models/UserActivity'); require('./models/Team');
const verification = require('./routes/verification');
const Admin = mongoose.model('Admin');
const MONGO = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';
let fails = 0;
function c(lab, cond, msg) { if(cond) console.log('✅ '+lab); else { console.log('❌ '+lab+' → '+msg); fails++; } }

(async () => {
  await mongoose.connect(MONGO,{});
  // 找真实组长（role=GROUP_LEADER 且 teamGroupId 存在）
  const gls = await Admin.find({ teamGroupId: { $exists: true, $nin: [null,''] } })
    .select('_id username role manualLevel manualLevelSetAt commission status').lean().limit(20);
  console.log(`找到 ${gls.length} 个真实组长（teamGroupId 存在）：${gls.map(g => g.username + '[' + (g.role || '?') + ']').join(', ')}`);
  const samples = gls.slice(0, 3);
  for (const gl of samples) {
    try {
      const perf = await verification.getGroupLeaderPerformance(String(gl._id));
      const D = perf.data;
      console.log(`\n========== 📌 组长 ${gl.username} (_id=${String(gl._id).slice(-6)}) level=${gl.manualLevel||'(auto)'} ==========`);
      console.log(`  summary.totalRevenue=¥${D.summary.totalRevenue} direct=¥${D.summary.directRevenue||'(无)'} indirect=¥${D.summary.indirectRevenue||'(无)'}`);

      // ============== 断言 1：levelConfig 结构 = {list, updatedAt, updatedBy} ==============
      console.log('\n  ---- 断言 1：levelConfig 结构 ----');
      c('levelConfig 是对象（不是数组）', D.levelConfig && typeof D.levelConfig === 'object' && !Array.isArray(D.levelConfig),
        `type=${typeof D.levelConfig} isArray=${Array.isArray(D.levelConfig)}`);
      c('levelConfig.list 是数组', D.levelConfig && Array.isArray(D.levelConfig.list),
        `list 类型=${Array.isArray(D.levelConfig?.list)?'是':'否'}`);
      c('levelConfig.list.length === 8', D.levelConfig?.list?.length === 8,
        `实际长度=${D.levelConfig?.list?.length}`);

      // ============== 断言 2：levelConfig 8 条 P1~P8 role 正确 ==============
      console.log('\n  ---- 断言 2：levelConfig 8 条 P1~P8 内容 ----');
      const LIST = D.levelConfig?.list || [];
      const EXPECT = ['P1','P2','P3','P4','P5','P6','P7','P8'];
      for (let i=0;i<8;i++) {
        if (!LIST[i]) { c(`list[${i}] 存在`, false, '缺失'); continue; }
        c(`list[${i}].level === ${EXPECT[i]}`, LIST[i].level === EXPECT[i],
          `实际=${LIST[i].level}`);
        c(`list[${i}].name 存在(字符串)`, typeof LIST[i].name === 'string' && LIST[i].name.length > 0,
          `name=${JSON.stringify(LIST[i].name)}`);
        c(`list[${i}].commission ∈(0,1]`, typeof LIST[i].commission==='number' && LIST[i].commission > 0 && LIST[i].commission <= 1,
          `实际=${LIST[i].commission}`);
        c(`list[${i}].minRevenue ≥0`, typeof LIST[i].minRevenue==='number' && LIST[i].minRevenue >= 0,
          `实际=${LIST[i].minRevenue}`);
        c(`list[${i}].targetRevenue ≥minRevenue`, typeof LIST[i].targetRevenue==='number' && LIST[i].targetRevenue >= LIST[i].minRevenue,
          `target=${LIST[i].targetRevenue} min=${LIST[i].minRevenue}`);
        if (i === 0) { // P1 必须 GL
          c(`list[0] (P1) role === "GROUP_LEADER"`, String(LIST[0].role||'').toUpperCase() === 'GROUP_LEADER',
            `实际 role=${LIST[0].role}`);
        } else { // P2+ 必须 TL
          c(`list[${i}] (${EXPECT[i]}) role === "NORMAL_ADMIN"`, String(LIST[i].role||'').toUpperCase() === 'NORMAL_ADMIN',
            `实际 role=${LIST[i].role}`);
        }
      }

      // ============== 断言 3：level 对象必须 14 字段 ==============
      console.log('\n  ---- 断言 3：level 字段完整性 ----');
      const L = D.level || {};
      const mustKeys = ['currentLevel','currentLevelName','currentCommission','nextLevel','nextLevelName','nextCommission',
        'nextLevelThreshold','nextLevelMinRevenue','currentLevelMinRevenue','currentLevelTargetRevenue',
        'progressToNext','revenueToNext','isMaxLevel','upgradePending','manualLevel','manualLevelSetAt'];
      for (const k of mustKeys) {
        c(`level.${k} 存在`, Object.prototype.hasOwnProperty.call(L, k),
          `缺失字段 ${k}（现有 keys=${Object.keys(L).join(',')}）`);
      }
      c('level.currentLevel ∈ P1~P8', EXPECT.includes(L.currentLevel),
        `实际 currentLevel=${L.currentLevel}`);
      c('level.currentCommission ∈ (0,1]', typeof L.currentCommission==='number' && L.currentCommission>0 && L.currentCommission<=1,
        `实际=${L.currentCommission}`);

      // nextLevel 非空性：cur != P8 时 nextLevel 必须非空
      if (L.currentLevel !== 'P8') {
        c(`当前${L.currentLevel}非顶 → level.nextLevel 非空且在P1~P8内`, !!L.nextLevel && EXPECT.includes(L.nextLevel),
          `nextLevel=${JSON.stringify(L.nextLevel)}`);
        c(`level.nextCommission 是正数且 ≤1`, typeof L.nextCommission==='number' && L.nextCommission>0 && L.nextCommission<=1,
          `nextCommission=${L.nextCommission}`);
        c(`level.nextLevelName 非空字符串`, typeof L.nextLevelName==='string' && L.nextLevelName.length > 0,
          `nextLevelName=${JSON.stringify(L.nextLevelName)}`);
        c(`level.nextLevelThreshold ≥0 整数`, typeof L.nextLevelThreshold==='number' && L.nextLevelThreshold >= 0,
          `nextLevelThreshold=${L.nextLevelThreshold}`);
      } else {
        c(`当前P8满级 → level.nextLevel 为 null`, L.nextLevel === null, `实际=${JSON.stringify(L.nextLevel)}`);
      }
      c('level.progressToNext ∈ [0,1]', typeof L.progressToNext==='number' && L.progressToNext >=0 && L.progressToNext <=1,
        `progress=${L.progressToNext}`);
      c('level.revenueToNext ≥0 数字', typeof L.revenueToNext==='number' && L.revenueToNext >= 0,
        `revenueToNext=${L.revenueToNext}`);
      c('level.isMaxLevel 布尔', typeof L.isMaxLevel === 'boolean', `isMaxLevel 类型=${typeof L.isMaxLevel}`);
      c('level.upgradePending 布尔', typeof L.upgradePending === 'boolean', `upgradePending 类型=${typeof L.upgradePending}`);

      // progress 数学正确性：tr = summary.totalRevenue
      const tr = +(D.summary.totalRevenue || 0);
      if (L.currentLevel !== 'P8' && !L.isMaxLevel) {
        // progressToNext ≈ (tr - cur.min) / (cur.target - cur.min) clamp 0~1
        const curCfg = LIST.find(l => l.level === L.currentLevel);
        if (curCfg && typeof curCfg.targetRevenue === 'number' && typeof curCfg.minRevenue === 'number') {
          const denom = curCfg.targetRevenue - curCfg.minRevenue;
          const expectedProgress = denom > 0 ? Math.max(0, Math.min(1, (tr - curCfg.minRevenue) / denom)) : 1;
          c(`level.progressToNext 正确(${tr} 在 ${L.currentLevel}[${curCfg.minRevenue}~${curCfg.targetRevenue}] → ${expectedProgress.toFixed(4)})`,
            Math.abs(L.progressToNext - expectedProgress) < 0.005,
            `实际=${L.progressToNext} 期望≈${expectedProgress.toFixed(4)}`);
        }
        // revenueToNext = max(0, 当前档目标 - tr)
        if (curCfg && typeof curCfg.targetRevenue === 'number') {
          const expectedRevNext = Math.max(0, curCfg.targetRevenue - tr);
          c(`level.revenueToNext 正确(cur.targetRevenue=${curCfg.targetRevenue} - ${tr} = ${expectedRevNext.toFixed(2)})`,
            Math.abs(L.revenueToNext - expectedRevNext) < 0.5,
            `实际=${L.revenueToNext} 期望≈${expectedRevNext.toFixed(2)}`);
        }
        // nextLevelThreshold = 当前档 targetRevenue（同 TL 端口径）
        if (curCfg && typeof curCfg.targetRevenue === 'number') {
          c(`level.nextLevelThreshold === 当前档 ${L.currentLevel}.targetRevenue=${curCfg.targetRevenue}`,
            L.nextLevelThreshold === curCfg.targetRevenue,
            `实际=${L.nextLevelThreshold}`);
        }
      }

      // nextLevel = 当前档 idx + 1
      const curIdx = LIST.findIndex(l => l.level === L.currentLevel);
      if (curIdx >= 0 && curIdx < LIST.length - 1) {
        const EXPECT_NEXT = LIST[curIdx + 1].level;
        c(`level.nextLevel === ${L.currentLevel} 的下一档 = ${EXPECT_NEXT}`, L.nextLevel === EXPECT_NEXT,
          `实际 nextLevel=${JSON.stringify(L.nextLevel)}`);
        c(`level.nextCommission === ${EXPECT_NEXT}.commission=${LIST[curIdx+1].commission}`,
          L.nextCommission === LIST[curIdx+1].commission,
          `实际=${L.nextCommission}`);
      }

      // ============== 断言 4：手动档正确性 ==============
      console.log('\n  ---- 断言 4：手动档 ----');
      if (gl.manualLevel && /^P[1-8]$/.test(String(gl.manualLevel).toUpperCase())) {
        const expectedManual = String(gl.manualLevel).toUpperCase();
        c(`手动档(${expectedManual}) → level.currentLevel === ${expectedManual}`,
          L.currentLevel === expectedManual, `实际=${L.currentLevel}`);
        c(`手动档 → level.manualLevel === ${expectedManual}`,
          L.manualLevel === expectedManual, `实际=${JSON.stringify(L.manualLevel)}`);
        c(`手动档 → level.manualLevelSetAt 已设置(Date)`,
          !!L.manualLevelSetAt, `实际=${JSON.stringify(L.manualLevelSetAt)}`);
      } else {
        c(`自动档 → level.manualLevel === null`, L.manualLevel === null,
          `实际=${JSON.stringify(L.manualLevel)}`);
      }
    } catch(e) { console.error(`  💥 组长 ${gl.username} 接口报错:`, e.message); fails++; }
  }

  console.log(`\n===== TOTAL FAILURES: ${fails} =====`);
  if (fails === 0) console.log('✅ ALL GREEN：组长端 levelConfig 8条+level字段完整+手动档正确');
  else process.exit(1);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
