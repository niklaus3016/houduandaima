const mongoose = require('mongoose');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017/test?authSource=admin&replicaSet=lzjzb-sjk-mongodb';

(async () => {
  await mongoose.connect(MONGODB_URI);
  const Admin = require('./models/Admin');
  const verification = require('./routes/verification');

  console.log('=== 调用 verification.js 的收益接口 ===\n');

  const admin = await Admin.findOne({ username: 'huangzhenhui' }).lean();
  console.log('Admin:', admin.username);
  
  // 直接调用 _buildCommissionStatsFlat
  console.log('\n调用 _buildCommissionStatsFlat...');
  
  // 检查是否可以访问内部函数
  console.log('verification 模块导出:', Object.keys(verification));
  
  // 尝试获取团队长收益
  console.log('\n调用 getTeamLeaderCommissionStats...');
  if (typeof verification.getTeamLeaderCommissionStats === 'function') {
    const stats = await verification.getTeamLeaderCommissionStats(String(admin._id));
    console.log('结果:', JSON.stringify(stats, null, 2));
  } else {
    console.log('getTeamLeaderCommissionStats 不存在');
  }
  
  // 尝试其他方法
  console.log('\n尝试其他方法...');
  for (const key of Object.keys(verification)) {
    if (typeof verification[key] === 'function') {
      console.log(`  ${key}(): ${verification[key].toString().substring(0, 100)}...`);
    }
  }

  await mongoose.disconnect();
})();
