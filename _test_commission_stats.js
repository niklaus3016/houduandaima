const mongoose = require('mongoose');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017/test?authSource=admin&replicaSet=lzjzb-sjk-mongodb';

(async () => {
  await mongoose.connect(MONGODB_URI);
  const Admin = require('./models/Admin');
  const verification = require('./routes/verification');
  const dashboard = require('./routes/dashboard');

  console.log('=== 调用 router._buildCommissionStatsFlatExported ===\n');

  const admin = await Admin.findOne({ username: 'huangzhenhui' }).lean();
  
  const buildFn = verification._buildCommissionStatsFlatExported;
  const scope = { kind: 'TL', adminId: String(admin._id) };
  
  const result = await buildFn(scope, admin, dashboard.computeNewKpi);
  
  // 查看 flat 结构
  if (result && result.flat) {
    console.log('\nflat 结构:');
    for (const [key, value] of Object.entries(result.flat)) {
      console.log(`  ${key}: ${value}`);
    }
  }
  
  // 查看 raw 结构
  if (result && result.raw) {
    console.log('\nraw 结构 (lastMonth):');
    const lastMonth = result.raw.lastMonth;
    if (lastMonth) {
      for (const [key, value] of Object.entries(lastMonth)) {
        console.log(`  ${key}: ${value}`);
      }
    }
  }

  await mongoose.disconnect();
})();
