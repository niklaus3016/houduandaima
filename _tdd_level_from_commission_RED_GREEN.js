// TDD RED → GREEN：修复 manager-direct-cards 职级算档错误
// 正确映射（与业绩页面截图、project_memory完全一致）：
// GL 0.06→P1；TL 0.08→P2, 0.10→P3, 0.12→P4, 0.14→P5, 0.16→P6, 0.18→P7, 0.20→P8
const assert = require('assert');
let FAILED=0, PASSED=0;
const ok = (n, cond, d='') => {
  if (cond) { console.log(`✅ L${n} PASS ${d}`); PASSED++; }
  else { console.log(`❌ L${n} FAIL ${d}`); FAILED++; }
};

(async () => {
  const dash = require('./routes/dashboard');

  // 直接取核心函数：_md_levelFromCommission 通过 _computeSuperManagerDirectCards 不可直接访问
  // 所以我们通过 _computeSuperManagerDirectCards 验证：
  // - huangzhenhui commission=0.12 应为 P4（当前返回P6会失败）
  const mongoose = require('mongoose');
  const MONGO = process.env.MONGODB_URI || "mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017";
  require('./models/Admin');
  require('./models/Employee');
  require('./models/GoldLog');
  await mongoose.connect(MONGO, {});

  const result = await dash._computeSuperManagerDirectCards({ range:'today', role:'', limit:1000, page:1 });
  const cards = result.data;

  // 先查 Admin 原始 commission 值，对照截图
  const Admin = mongoose.model('Admin');
  const hzh = await Admin.findOne({ username:'huangzhenhui' }).select('commission role realName').lean();
  console.log(`\nDB huangzhenhui raw: commission=${hzh?.commission}, role=${hzh?.role}, realName=${hzh?.realName}`);

  const cardHz = cards.find(c=>c.username==='huangzhenhui');
  console.log(`接口 huangzhenhui 卡：commissionRate=${cardHz?.commissionRate}, level=${cardHz?.level}`);

  // ================ 核心断言 L1：0.12 → P4 ================
  ok('1', cardHz?.level === 'P4', `huangzhenhui commission=0.12 应当是 P4，接口返回 level=${cardHz?.level}，commissionRate=${cardHz?.commissionRate}`);

  // ================ L2：全卡 8档精确映射校验（从 cards 里尽可能命中多档） ================
  const EXPECTED = { '0.06':'P1','0.08':'P2','0.10':'P3','0.12':'P4','0.14':'P5','0.16':'P6','0.18':'P7','0.20':'P8' };
  let allMapOK = true, wrongOnes = [];
  for (const c of cards) {
    const key = (+c.commissionRate).toFixed(2);
    if (EXPECTED[key]) {
      if (c.level !== EXPECTED[key]) { allMapOK=false; wrongOnes.push({name:c.realName||c.username, commission:key, got:c.level, expected:EXPECTED[key]}); }
    }
  }
  ok('2', allMapOK, wrongOnes.length? `映射错误 ${JSON.stringify(wrongOnes)}` : `8档映射全部正确，命中档位=${[...new Set(cards.map(c=>(+c.commissionRate).toFixed(2)))].sort().join(',')}`);

  // ================ L3：GL 0.06 → P1 ================
  const anyGL = cards.find(c => /GROUPLEADER|GL/i.test((c.role||'').replace(/_/g,'')) && (+c.commissionRate).toFixed(2)==='0.06');
  ok('3', !anyGL || anyGL.level === 'P1', anyGL? `GL ${anyGL.realName||anyGL.username} commission=0.06 level=${anyGL.level}（期望P1）`:'无GL样本跳过');

  // ================ L4：P2 对应 0.08（范洁） ================
  const fanjie = await Admin.findOne({ username:'fanjie' }).select('commission role').lean();
  const fjCard = cards.find(c=>c.username==='fanjie');
  const expectedFJ = EXPECTED[(+fanjie?.commission).toFixed(2)] || '?';
  ok('4', !fjCard || fjCard.level === expectedFJ, `范洁 commission=${fanjie?.commission} 期望 ${expectedFJ}，接口返回 level=${fjCard?.level}`);

  console.log(`\n总计：${PASSED} 通过 / ${FAILED} 失败`);
  process.exit(FAILED===0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
