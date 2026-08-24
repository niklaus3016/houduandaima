const mongoose = require('mongoose');
const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function test() {
  await mongoose.connect(MONGODB_URI);
  
  const Admin = require('./models/Admin');
  const TeamGroup = require('./models/TeamGroup');
  
  const scopeTeamIds = ['69af8e34132651c70aa85608'];
  const scopeSet = new Set(scopeTeamIds.map(id => String(id)));
  const scopeTeamIdStrings = [...scopeSet];
  
  const groups = await TeamGroup.find({ teamLeaderId: { $in: scopeTeamIdStrings } }).lean();
  const groupIds = groups.map(g => String(g._id));
  const groupNames = groups.map(g => g.groupName).filter(Boolean);
  
  console.log('=== 查询组 ===');
  groups.forEach(g => console.log(`${g.groupName} - _id: ${g._id}`));
  
  console.log('\n=== 用新逻辑查询管理者 ===');
  const query = { 
    status: { $nin: ['disabled','deleted','DISABLED','DELETED','Deleted'] },
    $or: [
      { role: /NORMAL_ADMIN|NORMAL|TEAM_LEADER/i, _id: { $in: scopeTeamIdStrings } },
      { role: /GROUP_LEADER/i, teamGroupId: { $in: groupIds } },
      { role: /GROUP_LEADER/i, groupName: { $in: groupNames } }
    ]
  };
  
  const allAdmins = await Admin.find(query)
    .select('_id username realName role teamName groupName')
    .lean();
  
  console.log(`\n总管理者数: ${allAdmins.length}`);
  allAdmins.forEach(admin => {
    console.log(`${admin.username} - ${admin.role} - ${admin.teamName || admin.groupName}`);
  });
  
  await mongoose.disconnect();
}

test().catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});