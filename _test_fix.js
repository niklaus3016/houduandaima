const mongoose = require('mongoose');
const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function test() {
  await mongoose.connect(MONGODB_URI);
  
  const Admin = require('./models/Admin');
  const TeamGroup = require('./models/TeamGroup');
  const Employee = require('./models/Employee');
  
  const cuidingId = '69af8e34132651c70aa85608';
  const scopeTeamIdStrings = [cuidingId];
  
  const teamGroups = await TeamGroup.find({ teamLeaderId: { $in: scopeTeamIdStrings } }).lean();
  
  const teamGroupMap = new Map();
  const groupIdMap = new Map();
  const groupNameMap = new Map();
  teamGroups.forEach(group => {
    const tlId = String(group.teamLeaderId);
    if (!teamGroupMap.has(tlId)) {
      teamGroupMap.set(tlId, []);
    }
    teamGroupMap.get(tlId).push(group);
    
    groupIdMap.set(String(group._id), group);
    if (group.groupName) {
      groupNameMap.set(group.groupName, group);
    }
  });
  
  const groupIds = teamGroups.map(g => String(g._id));
  const groupNames = teamGroups.map(g => g.groupName).filter(Boolean);
  
  const admins = await Admin.find({
    $or: [
      { _id: { $in: scopeTeamIdStrings }, role: 'NORMAL_ADMIN' },
      { teamGroupId: { $in: groupIds }, role: 'GROUP_LEADER' },
      { groupName: { $in: groupNames }, role: 'GROUP_LEADER' }
    ]
  }).lean();
  
  console.log('=== 测试修复后的逻辑 ===');
  for (const admin of admins) {
    const adminId = String(admin._id);
    let groups = [];
    
    if (admin.role === 'NORMAL_ADMIN') {
      groups = teamGroupMap.get(adminId) || [];
    } else {
      if (admin.teamGroupId && groupIdMap.has(admin.teamGroupId)) {
        groups = [groupIdMap.get(admin.teamGroupId)];
      } else if (admin.groupName && groupNameMap.has(admin.groupName)) {
        groups = [groupNameMap.get(admin.groupName)];
      }
    }
    
    const groupIds = groups.map(g => String(g._id));
    const groupNames = groups.map(g => g.groupName).filter(Boolean);
    
    let employees;
    if (admin.role === 'NORMAL_ADMIN') {
      employees = await Employee.find({
        $or: [
          { parentId: adminId },
          { teamGroupId: { $in: groupIds } },
          ...groupNames.map(name => ({ groupName: name }))
        ]
      }).select('employeeId').lean();
    } else {
      employees = await Employee.find({
        $or: [
          { teamGroupId: { $in: groupIds } },
          ...groupNames.map(name => ({ groupName: name }))
        ]
      }).select('employeeId').lean();
    }
    
    console.log(`${admin.username} (${admin.role}) - 组: ${groups.map(g => g.groupName).join(',') || '无'} - 员工数: ${employees.length}`);
  }
  
  await mongoose.disconnect();
}

test().catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});