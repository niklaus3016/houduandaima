// TDD RED：验证崔鼎（cuiding/cuidi/崔鼎）实际职级应读 Admin 表真实字段，不能仅靠 commission 反推
const mongoose = require('mongoose');
const MONGO = process.env.MONGODB_URI || "mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017";
require('./models/Admin');
require('./models/Employee');
require('./models/GoldLog');
let FAILED=0, PASSED=0;
const ok = (n, cond, d='') => {
  if (cond) { console.log(`✅ T${n} PASS ${d}`); PASSED++; }
  else { console.log(`❌ T${n} FAIL ${d}`); FAILED++; }
};

(async () => {
  await mongoose.connect(MONGO, {});
  const Admin = mongoose.model('Admin');
  const dash = require('./routes/dashboard');

  // 1. 找崔鼎：可能是 cuiding / cuidi / realName=崔鼎
  const candidates = await Admin.find({
    $or: [
      { username: /cuid/i },
      { realName: /崔鼎/ },
      { realName: /崔杰/ },
      { realName: /崔鼎/ }
    ]
  }).select('_id username realName role commission level currentLevel manualLevel levelManual isManual manualLevelSetAt status').lean();
  console.log("=== [DB原始数据] 可能的崔鼎/崔鼎/崔杰 账号 ===");
  candidates.forEach(c => console.log(JSON.stringify(c, null, 2)));

  // 2. 调接口拿所有卡片
  const result = await dash._computeSuperManagerDirectCards({ range:'today', role:'', limit:1000, page:1 });
  const cards = result.data;

  // 3. 匹配所有 candidate 的接口返回
  console.log("\n=== [接口返回] 这些账号的 level/commissionRate ===");
  for (const c of candidates) {
    const card = cards.find(x => x._id === String(c._id) || x.username === c.username || x.realName === c.realName);
    if (card) {
      console.log(`\n${card.realName||card.username} (username=${card.username})`);
      console.log(`  DB: commission=${c.commission}, level=${c.level}, currentLevel=${c.currentLevel}, manualLevel=${c.manualLevel}, levelManual=${c.levelManual}, isManual=${c.isManual}`);
      console.log(`  API: level=${card.level}, commissionRate=${card.commissionRate}, levelManual=${card.levelManual}`);
    }
  }

  // ============ T1 核心断言：如果 Admin.manualLevel 是 P4 且 isManual/levelManual=true，level 必须是 P4 ============
  console.log("\n=== 断言开始 ===");
  let cuidingFixed = true, cuidingMsg = [];
  for (const c of candidates) {
    const card = cards.find(x => x._id === String(c._id));
    if (!card) continue;
    // 真实职级优先链：manualLevel(P1~P8) → level(P1~P8) → currentLevel(P1~P8) → commission反推
    let expected = null;
    if (/^P[1-8]$/.test(c.manualLevel||'')) expected = c.manualLevel;
    else if (/^P[1-8]$/.test(c.level||'')) expected = c.level;
    else if (/^P[1-8]$/.test(c.currentLevel||'')) expected = c.currentLevel;
    if (expected && card.level !== expected) {
      cuidingFixed = false;
      cuidingMsg.push(`${c.realName||c.username}: DB存的职级是${expected}（commission=${c.commission}），API却返回${card.level}`);
    }
    // levelManual 标志：只要有手动档迹象（levelManual/isManual/manualLevel），levelManual 必须 true
    const anyManualFlag = Boolean(c.levelManual || c.isManual || (c.manualLevel && /^P[1-8]$/.test(c.manualLevel)));
    if (anyManualFlag && !card.levelManual) {
      cuidingFixed = false;
      cuidingMsg.push(`${c.realName||c.username}: 有手动档标识(DB)，但API的levelManual=false`);
    }
  }
  ok('1', cuidingFixed, cuidingMsg.length ? cuidingMsg.join('；') : `所有candidate账号 DB职级字段 与 API level 完全对齐（共${candidates.length}人）`);

  // ============ T2 全局：所有卡 level 必须严格遵循「读真实 Admin.level*/currentLevel 优先，commission仅兜底」 ============
  // 从 Admin 表重新取 25 人完整 level 信息对照
  const allAdminsLv = await Admin.find({ status: { $nin: ['disabled','deleted','DISABLED','DELETED','Deleted'] } })
    .select('_id username realName commission level currentLevel manualLevel levelManual isManual role').lean();
  const map = new Map(allAdminsLv.map(a => [String(a._id), a]));
  let globalOK = true, wrongs = [];
  for (const card of cards) {
    const a = map.get(card._id);
    if (!a) continue;
    let expected = null;
    if (/^P[1-8]$/.test(a.manualLevel||'')) expected = a.manualLevel;
    else if (/^P[1-8]$/.test(a.level||'')) expected = a.level;
    else if (/^P[1-8]$/.test(a.currentLevel||'')) expected = a.currentLevel;
    // 如果 Admin 存了以上任一字段，必须等于 card.level
    if (expected && card.level !== expected) {
      globalOK = false;
      wrongs.push(`${a.realName||a.username}: DB真实职级=${expected}，API=${card.level}（DB commission=${a.commission}）`);
    }
  }
  ok('2', globalOK, wrongs.length ? `全局错配：${wrongs.slice(0,10).join(' ； ')}${wrongs.length>10?'...共'+wrongs.length+'条':''}` : `全局${cards.length}张卡：Admin真实职级字段 与 API level 完全一致`);

  console.log(`\n总计：${PASSED} 通过 / ${FAILED} 失败`);
  process.exit(FAILED===0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
