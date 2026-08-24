const mongoose = require('mongoose');
const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function test() {
  await mongoose.connect(MONGODB_URI);
  
  const Admin = require('./models/Admin');
  const TeamGroup = require('./models/TeamGroup');
  const Employee = require('./models/Employee');
  
  console.log('=== 验证用户列表接口 - 组长直接下属 ===\n');
  
  const admin002 = await Admin.findOne({ username: 'admin002' }).lean();
  const scopeTeamIds = admin002.managedTeamIds?.map(id => String(id)) || [];
  const managedIdStrings = scopeTeamIds;
  
  console.log('1. 获取下属组和组长:');
  const allGroups = await TeamGroup.find({ teamLeaderId: { $in: managedIdStrings } }).lean();
  const subLeaderIds = new Set();
  for (const g of allGroups) {
    if (g.groupLeaderId) {
      subLeaderIds.add(String(g.groupLeaderId));
    }
  }
  
  const leaders = await Admin.find({ _id: { $in: [...subLeaderIds] } }).select('username realName role').lean();
  console.log(`   组长数: ${leaders.length}`);
  leaders.forEach(l => console.log(`   - ${l.username} (${l.realName})`));
  
  console.log('\n2. 查询上级是组长的员工:');
  const leaderDirectEmps = await Employee.find({ parentId: { $in: [...subLeaderIds] } }).select('employeeId parentId groupName').lean();
  console.log(`   上级是组长的员工数: ${leaderDirectEmps.length}`);
  if (leaderDirectEmps.length > 0) {
    console.log('\n   示例:');
    for (let i = 0; i < Math.min(5, leaderDirectEmps.length); i++) {
      const emp = leaderDirectEmps[i];
      const leader = leaders.find(l => String(l._id) === emp.parentId);
      console.log(`     - 员工 ${emp.employeeId}: 上级=${leader?.realName || leader?.username}, 组=${emp.groupName}`);
    }
  }
  
  console.log('\n3. 查询上级是团队长的员工:');
  const tlDirectEmps = await Employee.find({ parentId: { $in: managedIdStrings } }).select('employeeId parentId groupName').lean();
  console.log(`   上级是团队长的员工数: ${tlDirectEmps.length}`);
  if (tlDirectEmps.length > 0) {
    console.log('\n   示例:');
    const tls = await Admin.find({ _id: { $in: managedIdStrings } }).select('username realName').lean();
    for (let i = 0; i < Math.min(5, tlDirectEmps.length); i++) {
      const emp = tlDirectEmps[i];
      const tl = tls.find(t => String(t._id) === emp.parentId);
      console.log(`     - 员工 ${emp.employeeId}: 上级=${tl?.realName || tl?.username}, 组=${emp.groupName}`);
    }
  }
  
  console.log('\n4. 总员工数对比:');
  console.log(`   - 上级是组长: ${leaderDirectEmps.length} 人`);
  console.log(`   - 上级是团队长: ${tlDirectEmps.length} 人`);
  console.log(`   - 总计: ${leaderDirectEmps.length + tlDirectEmps.length} 人`);
  
  await mongoose.disconnect();
  
  console.log('\n✅ 测试完成！');
}

test().catch(err => {
  console.error('\n❌ 测试失败:', err);
  process.exit(1);
});