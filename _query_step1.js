const mongoose = require('mongoose');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017/test?authSource=admin&replicaSet=lzjzb-sjk-mongodb';

(async () => {
  await mongoose.connect(MONGODB_URI);
  const Admin = require('./models/Admin');
  const verification = require('./routes/verification');
  const dashboard = require('./routes/dashboard');

  console.log('=== 查询线上接口数据 ===\n');

  // 1. 查询团队长 huangzhenhui
  console.log('【团队长 huangzhenhui】');
  const tlAdmin = await Admin.findOne({ username: 'huangzhenhui' }).lean();
  const tlScope = { kind: 'TL', adminId: String(tlAdmin._id) };
  const tlResult = await verification._buildCommissionStatsFlatExported(tlScope, tlAdmin, dashboard.computeNewKpi);
  console.log('  lastMonth:', tlResult?.flat?.lastMonth);
  console.log('  lastMonthCommission:', tlResult?.flat?.lastMonthCommission);
  
  // 2. 查询高管 admin002
  console.log('\n【高管 admin002】');
  const admin2 = await Admin.findOne({ username: 'admin002' }).lean();
  console.log('  role:', admin2.role);
  const admin2Scope = { kind: 'TL', adminId: String(admin2._id) };
  const admin2Kpi = await dashboard.computeNewKpi(admin2Scope, 'lastMonth');
  console.log('  lastMonth.teamCommission:', admin2Kpi.teamCommission);
  
  // 3. 查询高管 admin003
  console.log('\n【高管 admin003】');
  const admin3 = await Admin.findOne({ username: 'admin003' }).lean();
  console.log('  role:', admin3.role);
  const admin3Scope = { kind: 'TL', adminId: String(admin3._id) };
  const admin3Kpi = await dashboard.computeNewKpi(admin3Scope, 'lastMonth');
  console.log('  lastMonth.teamCommission:', admin3Kpi.teamCommission);

  await mongoose.disconnect();
})();
