const mongoose = require('mongoose');
const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function test() {
  await mongoose.connect(MONGODB_URI);
  
  const Admin = require('./models/Admin');
  const TeamGroup = require('./models/TeamGroup');
  
  const cuidingId = '69af8e34132651c70aa85608';
  const scopeTeamIdStrings = [cuidingId];
  
  const teamGroupQuery = { teamLeaderId: { $in: scopeTeamIdStrings } };
  const teamGroups = await TeamGroup.find(teamGroupQuery).lean();
  const groupIds = teamGroups.map(g => String(g._id));
  const groupNames = teamGroups.map(g => g.groupName).filter(Boolean);
  
  console.log('=== 查询组 ===');
  teamGroups.forEach(g => console.log(`${g.groupName} - _id: ${g._id}`));
  
  console.log('\n=== 用新逻辑查询管理者 ===');
  const adminQuery = { 
    $or: [
      { _id: { $in: scopeTeamIdStrings }, role: 'NORMAL_ADMIN' },
      { teamGroupId: { $in: groupIds }, role: 'GROUP_LEADER' },
      { groupName: { $in: groupNames }, role: 'GROUP_LEADER' }
    ]
  };
  
  const admins = await Admin.find(adminQuery).lean();
  admins.forEach(admin => {
    console.log(`${admin.username} - ${admin.role} - ${admin.teamName || admin.groupName}`);
  });
  
  await mongoose.disconnect();
}

test().catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});