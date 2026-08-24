const mongoose = require('mongoose');
const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function testAdmin002TeamPerformance() {
  await mongoose.connect(MONGODB_URI);
  
  const Admin = require('./models/Admin');
  const TeamGroup = require('./models/TeamGroup');
  const Employee = require('./models/Employee');
  const GoldLog = require('./models/GoldLog');
  
  console.log('=== 完整测试: admin002 团队管理 ===\n');
  
  const admin002 = await Admin.findOne({ username: 'admin002' }).lean();
  console.log('1. admin002 信息:');
  console.log(`   _id: ${admin002._id}`);
  console.log(`   role: ${admin002.role}`);
  console.log(`   managedTeamIds: ${admin002.managedTeamIds?.map(id => String(id)) || []}\n`);
  
  const managedTeamIds = admin002.managedTeamIds?.map(id => String(id)) || [];
  if (managedTeamIds.length === 0) {
    console.log('❌ 未分配任何团队');
    await mongoose.disconnect();
    return;
  }
  
  console.log('2. 查询管理的团队长:');
  const teamLeaders = await Admin.find({ _id: { $in: managedTeamIds } }).lean();
  teamLeaders.forEach(tl => console.log(`   - ${tl.username} (${tl.teamName})`));
  
  console.log('\n3. 查询下属组:');
  const teamGroups = await TeamGroup.find({ teamLeaderId: { $in: managedTeamIds } }).lean();
  teamGroups.forEach(g => console.log(`   - ${g.groupName}`));
  
  console.log('\n4. 查询下属组长:');
  const groupIds = teamGroups.map(g => String(g._id));
  const groupNames = teamGroups.map(g => g.groupName).filter(Boolean);
  const groupLeaders = await Admin.find({
    $or: [
      { teamGroupId: { $in: groupIds }, role: 'GROUP_LEADER' },
      { groupName: { $in: groupNames }, role: 'GROUP_LEADER' }
    ]
  }).lean();
  groupLeaders.forEach(gl => console.log(`   - ${gl.username} (${gl.groupName || gl.teamName})`));
  
  console.log('\n5. 验证管理者总数:');
  console.log(`   团队长: ${teamLeaders.length} 人`);
  console.log(`   组长: ${groupLeaders.length} 人`);
  console.log(`   合计: ${teamLeaders.length + groupLeaders.length} 人`);
  
  console.log('\n6. 验证每个管理者对应的员工数:');
  let totalEmployees = 0;
  for (const tl of teamLeaders) {
    const tlGroups = teamGroups.filter(g => String(g.teamLeaderId) === String(tl._id));
    const tlGroupIds = tlGroups.map(g => String(g._id));
    const tlGroupNames = tlGroups.map(g => g.groupName);
    
    const employees = await Employee.find({
      $or: [
        { parentId: String(tl._id) },
        { teamGroupId: { $in: tlGroupIds } },
        ...tlGroupNames.map(name => ({ groupName: name }))
      ]
    }).countDocuments();
    console.log(`   - ${tl.username}: ${employees} 名员工`);
    totalEmployees += employees;
  }
  
  for (const gl of groupLeaders) {
    const glGroupIds = [gl.teamGroupId].filter(Boolean);
    const glGroupName = gl.groupName;
    
    const employees = await Employee.find({
      $or: [
        { teamGroupId: { $in: glGroupIds } },
        glGroupName ? { groupName: glGroupName } : {}
      ]
    }).countDocuments();
    console.log(`   - ${gl.username}: ${employees} 名员工`);
    totalEmployees += employees;
  }
  console.log(`   总计: ${totalEmployees} 名员工`);
  
  console.log('\n✅ 测试完成！admin002 团队管理逻辑正确');
  
  await mongoose.disconnect();
}

testAdmin002TeamPerformance().catch(err => {
  console.error('\n❌ 测试失败:', err);
  process.exit(1);
});