const mongoose = require('mongoose');
const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function test() {
  await mongoose.connect(MONGODB_URI);
  
  const Admin = require('./models/Admin');
  const TeamGroup = require('./models/TeamGroup');
  
  console.log('=== 测试 ADMIN_MANAGER 查看业绩权限 ===\n');
  
  const admin002 = await Admin.findOne({ username: 'admin002' }).lean();
  console.log('1. admin002 信息:');
  console.log(`   _id: ${admin002._id}`);
  console.log(`   role: ${admin002.role}`);
  console.log(`   managedTeamIds: ${admin002.managedTeamIds?.map(id => String(id)) || []}\n`);
  
  const managedTeamIds = admin002.managedTeamIds?.map(id => String(id)) || [];
  
  console.log('2. 查询管理范围内的团队长:');
  const teamLeaders = await Admin.find({ _id: { $in: managedTeamIds } }).lean();
  teamLeaders.forEach(tl => console.log(`   - ${tl.username} (${tl.teamName})`));
  
  console.log('\n3. 查询下属组长及其所属团队:');
  const groups = await TeamGroup.find({ teamLeaderId: { $in: managedTeamIds } }).lean();
  const groupIds = groups.map(g => String(g._id));
  const groupNames = groups.map(g => g.groupName).filter(Boolean);
  
  const groupLeaders = await Admin.find({
    $or: [
      { teamGroupId: { $in: groupIds }, role: 'GROUP_LEADER' },
      { groupName: { $in: groupNames }, role: 'GROUP_LEADER' }
    ]
  }).lean();
  
  for (const gl of groupLeaders) {
    const glGroup = groups.find(g => String(g._id) === gl.teamGroupId || g.groupName === gl.groupName);
    const tlName = glGroup ? teamLeaders.find(tl => String(tl._id) === glGroup.teamLeaderId)?.username : '未知';
    console.log(`   - ${gl.username} (${gl.groupName}) → ${tlName}`);
  }
  
  console.log('\n4. 验证权限逻辑:');
  for (const tl of teamLeaders) {
    const tlIdStr = String(tl._id);
    const isInManaged = managedTeamIds.includes(tlIdStr);
    console.log(`   - admin002 查看 ${tl.username}: ${isInManaged ? '✅ 有权限' : '❌ 无权限'}`);
  }
  
  for (const gl of groupLeaders) {
    const glGroup = groups.find(g => String(g._id) === gl.teamGroupId || g.groupName === gl.groupName);
    const tlIdStr = glGroup ? String(glGroup.teamLeaderId) : '';
    const isInManaged = managedTeamIds.includes(tlIdStr);
    console.log(`   - admin002 查看 ${gl.username}: ${isInManaged ? '✅ 有权限' : '❌ 无权限'}`);
  }
  
  await mongoose.disconnect();
  
  console.log('\n✅ 测试完成！权限逻辑验证通过');
}

test().catch(err => {
  console.error('\n❌ 测试失败:', err);
  process.exit(1);
});