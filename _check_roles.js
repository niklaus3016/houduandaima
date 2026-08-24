const mongoose = require('mongoose');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017/test?authSource=admin&replicaSet=lzjzb-sjk-mongodb';

(async () => {
  await mongoose.connect(MONGODB_URI);
  const Admin = require('./models/Admin');

  console.log('=== 查询所有用户角色 ===\n');
  
  // 查询 huangzhenhui 的详细信息
  const admin = await Admin.findOne({ username: 'huangzhenhui' }).lean();
  console.log('huangzhenhui:');
  console.log('  username:', admin.username);
  console.log('  role:', admin.role);
  console.log('  commission:', admin.commission);
  console.log('  teamGroupId:', admin.teamGroupId);
  console.log('  parentTlId:', admin.parentTlId);
  console.log('  level:', admin.level);
  
  // 查询所有不同的角色
  console.log('\n=== 所有角色 ===');
  const roles = await Admin.distinct('role');
  console.log('角色列表:', roles);
  
  // 统计每个角色的数量
  for (const role of roles) {
    const count = await Admin.countDocuments({ role });
    console.log(`  ${role}: ${count} 人`);
  }
  
  // 查看 huangzhenhui 是否是团队长
  console.log('\n=== 团队长检查 ===');
  const teamLeaders = await Admin.find({ 
    $or: [
      { role: 'TEAM_LEADER' },
      { role: 'team_leader' },
      { role: 'NORMAL_ADMIN', commission: { $gt: 0 } }
    ]
  }).select('username role commission parentTlId').lean();
  
  console.log(`团队长数量: ${teamLeaders.length}`);
  for (const tl of teamLeaders) {
    console.log(`  ${tl.username}: role=${tl.role}, commission=${tl.commission}`);
  }

  await mongoose.disconnect();
})();
