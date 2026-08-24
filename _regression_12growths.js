// 回归验证：fanjie(TL) + 一个组长(GL视角)，12个环比字段都有返回值
const mongoose = require('mongoose');
require('./models/Admin');
require('./models/Employee');
require('./models/TeamGroup');
require('./models/GoldLog');
require('./models/TeamLeaderLevelConfig');
const MONGO = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';
const db = require('./routes/dashboard');
const assert = require('assert');

const EXPECT_GROWTH_KEYS = [
  'directRevenueGrowth','directCommissionGrowth','directImpressionsGrowth',
  'indirectRevenueGrowth','indirectCommissionGrowth','indirectImpressionsGrowth',
  'teamRevenueGrowth','teamCommissionGrowth'
];
const RANGES = ['today','month'];

async function check12Growths(label, scope, expectIndirectZero=false) {
  console.log('\n─── ' + label + ' ───');
  let ok = true;
  for (const r of RANGES) {
    const res = await db.computeNewKpi(scope, r);
    // 8 个 growth 字段全存在
    for (const k of EXPECT_GROWTH_KEYS) {
      const has = Object.prototype.hasOwnProperty.call(res, k);
      const v = res[k];
      const isFin = typeof v === 'number' && isFinite(v);
      const pass = has && isFin;
      if (!pass) { ok = false; console.log('  ❌ '+r+'.'+k+' 缺失或非数字: '+JSON.stringify(v)); continue; }
      // GL间接=0校验
      if (expectIndirectZero && k.startsWith('indirect')) {
        if (v !== 0) { ok = false; console.log('  ❌ '+r+'.'+k+' GL应为0，却='+v); continue; }
      }
    }
    // 12（6卡×2range）个字段都有值
    const line = '  '+r.toUpperCase()+': '
      +'直推业'+String(res.directRevenueGrowth).padStart(7)+'%  '
      +'直推成'+String(res.directCommissionGrowth).padStart(7)+'%  '
      +'直推曝'+String(res.directImpressionsGrowth).padStart(7)+'%  |  '
      +'间推业'+String(res.indirectRevenueGrowth).padStart(7)+'%  '
      +'间推成'+String(res.indirectCommissionGrowth).padStart(7)+'%  '
      +'间推曝'+String(res.indirectImpressionsGrowth).padStart(7)+'%';
    console.log(line);
  }
  console.log('  ' + (ok ? '✅ 全部字段存在且为数字' : '❌ 失败'));
  return ok;
}

(async () => {
  await mongoose.connect(MONGO, {});
  const Admin = mongoose.model('Admin');
  const TeamGroup = mongoose.model('TeamGroup');
  let allOK = true;

  // 1. TL: fanjie
  const fanjie = await Admin.findOne({ username:'fanjie', role:{ $in:['NORMAL_ADMIN','normal_admin'] } }).select('_id').lean();
  if (fanjie) allOK &= await check12Growths('【TL】fanjie (P4 14%)', { kind:'TL', adminId: String(fanjie._id) });

  // 2. GL: 随便找一个 teamGroup 非空的组长（role=groupLeader）
  const glAdmin = await Admin.findOne({
    $or: [{ role:'groupLeader' }, { role:'GROUP_LEADER' }, { role: 'p1' }]
  }).select('_id username teamGroupId commission').lean();
  if (!glAdmin) {
    console.log('\n⚠  没找到 role=groupLeader 的组长，退而求其次：找 teamGroupId 非空的普通 ADMIN 模拟');
  }
  let tgId = glAdmin?.teamGroupId;
  if (!tgId) {
    const anyTg = await TeamGroup.findOne({}).select('_id').lean();
    tgId = anyTg && anyTg._id;
  }
  if (tgId) {
    allOK &= await check12Growths('【GL】 teamGroupId='+String(tgId).slice(-6) + (glAdmin?' ('+glAdmin.username+')':''),
      { kind:'GL', teamGroupId: String(tgId), adminId: glAdmin?String(glAdmin._id):'__global__' },
      true);
  } else {
    console.log('⚠  没找到可用的 teamGroup，跳过 GL 回归');
  }

  console.log('\n────────────────────────────────────────────');
  console.log(allOK ? '✅ 全部回归通过 (12 growth 字段齐全)' : '❌ 回归失败');
  process.exit(allOK ? 0 : 3);
})().catch(e => { console.error('ERR:', e.message || e); process.exit(1); });
