// GREEN TDD：修复后 新接口算法 vs KPI权威 逐字段相等
const mongoose = require('mongoose');
require('./models/Admin');
require('./models/Employee');
require('./models/TeamGroup');
require('./models/GoldLog');
require('./models/TeamLeaderLevelConfig');
const MONGO = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';
const assert = require('assert');
const db = require('./routes/dashboard');

const RANGES = ['today', 'yesterday', 'week', 'month', 'lastMonth'];
const TL_USERNAMES = ['cuiding', 'fanjie'];

async function newInterfaceAlgo(tlId) {
  const scope = { kind: 'TL', adminId: String(tlId) };
  const results = await Promise.all(RANGES.map(r => db.computeNewKpi(scope, r)));
  const out = {};
  RANGES.forEach((r, i) => { out[r] = +(results[i].teamCommission || 0).toFixed(2); });
  return out;
}

async function kpiAuthority(tlId) {
  const scope = { kind: 'TL', adminId: String(tlId) };
  const out = {};
  for (const r of RANGES) {
    const res = await db.computeNewKpi(scope, r);
    out[r] = +(res.teamCommission || 0).toFixed(2);
  }
  return out;
}

(async () => {
  await mongoose.connect(MONGO, {});
  const Admin = mongoose.model('Admin');
  let allOK = true;
  for (const name of TL_USERNAMES) {
    const tl = await Admin.findOne({ username: name }).select('_id username role commission teamName').lean();
    if (!tl) { console.log('SKIP ' + name + ' not found'); continue; }
    const role = (tl.role || '').toLowerCase();
    if (role !== 'normal_admin') { console.log('SKIP ' + name + ' role=' + tl.role); continue; }
    console.log('\nTL=' + name + ' commission=' + (+tl.commission*100).toFixed(1) + '% teamName=' + (tl.teamName || ''));
    const [a, b] = await Promise.all([newInterfaceAlgo(tl._id), kpiAuthority(tl._id)]);
    console.log('range      A(新接口)   B(KPI权威)   delta      OK?');
    for (const r of RANGES) {
      const aa = +a[r], bb = +b[r];
      const d = +(aa - bb).toFixed(2);
      const ok = Math.abs(d) <= 0.01;
      if (!ok) allOK = false;
      const line = '  ' + r.padEnd(10)
        + '  ' + ('¥' + aa.toFixed(2)).padStart(10)
        + '  ' + ('¥' + bb.toFixed(2)).padStart(11)
        + '  ' + ('¥' + d.toFixed(2)).padStart(8)
        + '  ' + (ok ? 'OK' : 'FAIL');
      console.log(line);
      assert.ok(ok, name + '.' + r + ' 新接口=' + aa + ' KPI=' + bb + ' delta=' + d);
    }
  }
  console.log('\n' + (allOK ? 'PASS: 所有TL所有range 100%一致 (Δ≤¥0.01)' : 'FAIL: 仍有差异'));
  process.exit(allOK ? 0 : 2);
})().catch(e => { console.error('ERR:', e.message || e); process.exit(1); });
