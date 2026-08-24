// ===========================================================
// 🟥 RED：修复前错误状态断言（应该FAIL）
//   修复数据：Admin.fanjie.parentTlId / TeamGroup.洁然如初代理.teamLeaderId / Employee.groupName脏数据
// ===========================================================
const mongoose = require('mongoose');
require('./models/Admin');
require('./models/Employee');
require('./models/TeamGroup');
require('./models/GoldLog');
require('./models/TeamLeaderLevelConfig');
require('./models/UserGold');
require('./models/UserActivity');
require('./models/Team');
const db = require('./routes/dashboard');
const assert = require('assert');
const MONGO = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

let failCount = 0;
function check(label, cond, actualMsg) {
  if (cond) console.log('  ✅ ' + label);
  else { console.log('  ❌ FAIL: ' + label + '  |  ' + actualMsg); failCount++; }
}

(async () => {
  await mongoose.connect(MONGO, {});
  const Admin = mongoose.model('Admin');
  const TeamGroup = mongoose.model('TeamGroup');
  const Employee = mongoose.model('Employee');

  const cui = await Admin.findOne({ username:'cuiding' }).select('_id commission').lean();
  const fan = await Admin.findOne({ username:'fanjie' }).select('_id commission parentTlId teamGroupId').lean();
  const cuiId = String(cui._id), fanId = String(fan._id);

  console.log('========== RED：修复前错误状态 断言 ==========');

  // R1：组织结构 parentTlId 应该指向 cuiding（现在是 NULL → FAIL）
  check('[R1] fanjie.parentTlId === cuiding._id',
    String(fan.parentTlId || 'NULL') === cuiId,
    'actual=' + String(fan.parentTlId || 'NULL') + ', expect=' + cuiId.slice(-8));

  // R2：洁然如初代理 组 teamLeaderId 应该指向 fanjie（现在=cuiding → FAIL）
  const jrrc = await TeamGroup.findOne({ groupName:'洁然如初代理' }).select('_id teamLeaderId groupLeaderId').lean();
  check('[R2] 洁然如初代理.teamLeaderId === fanjie._id',
    jrrc && String(jrrc.teamLeaderId) === fanId,
    'actual=' + String(jrrc?.teamLeaderId || 'NULL').slice(-8) + ', expect=' + fanId.slice(-8));

  // R3：cuiding 下属TL集合应该至少有 fanjie（现在 parentTlId=NULL，count=0 → FAIL）
  const subTls = await Admin.find({ parentTlId: cuiId, role:/NORMAL_ADMIN|normal_admin/i }).select('_id username').lean();
  check('[R3] cuiding下属TL count >= 1', subTls.length >= 1,
    'actual下属TL count=' + subTls.length + ' (应为至少1：fanjie)');

  // R4：fanjie的directD 51人，Employee.groupName 不应写"洁然如初代理"（否则_directD排除逻辑误伤，归错类）
  const fanDIds = await db._getTLDirectDIds(fanId);
  const fanDEmps = await Employee.find({ employeeId: { $in: fanDIds }, groupName:'洁然如初代理' }).countDocuments();
  check('[R4] fanjie.directD('+fanDIds.length+')人中 groupName="洁然如初代理" 应为 0（否则会被下属组排除）',
    fanDEmps === 0, 'actual=' + fanDEmps);

  // R5：cuiding 今日 KPI 间推提成率不应 > 10%（现在≈12.1% → FAIL）
  const kpi = await db.computeNewKpi({ kind:'TL', adminId: cuiId }, 'today');
  const rate = kpi.indirectRevenue > 0
    ? (kpi.indirectCommission / kpi.indirectRevenue) * 100 : 0;
  console.log('  [数据] cuiding今日KPI：indirectRev=' + kpi.indirectRevenue
    + '  indirectComm=' + kpi.indirectCommission
    + '  实际间推提成率=' + rate.toFixed(2) + '%');
  check('[R5] 间推提成率在 [0%, 10%] 合理区间（G级差+D保底不超TL级差率上限）',
    rate >= 0 && rate <= 10,
    'actual rate=' + rate.toFixed(2) + '% > 10%，说明被hasTl=true取到14%错算');

  // R6：fanjie的 directD 51人，不应被 cuiding 的 subG 收进去（双重归属错误）
  const cuiSubG = new Set(await db._getTLSubGroupGIds(cuiId));
  const overlap = fanDIds.filter(id => cuiSubG.has(id)).length;
  check('[R6] cuiding.subG ∩ fanjie.directD 应为 0（不能双重归属）',
    overlap === 0, 'actual overlap=' + overlap + ' / fanD=' + fanDIds.length);

  console.log('\n────────────');
  if (failCount === 0) {
    console.log('🟢 全部通过（已修复？）'); process.exit(0);
  } else {
    console.log('🔴 ' + failCount + ' 项FAIL，准备修数据...'); process.exit(4);
  }
})().catch(e => { console.error('ERR:', e); process.exit(1); });
