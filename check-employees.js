const mongoose = require('mongoose');
const Admin = require('./models/Admin');
const Employee = require('./models/Employee');
const TeamGroup = require('./models/TeamGroup');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017').then(async () => {
  const admin = await Admin.findOne({ username: 'cuiding' });
  console.log('管理员:', admin.username);
  console.log('团队:', admin.teamName);
  
  const employees = await Employee.find({ parentId: admin._id.toString() });
  console.log('总员工数:', employees.length);
  
  const groups = await TeamGroup.find({ teamName: admin.teamName });
  console.log('组别数:', groups.length);
  
  // 统计各组员工数
  let groupedCount = 0;
  for (const group of groups) {
    const groupEmps = employees.filter(e => 
      e.groupName === group.groupName || 
      e.teamGroupId === group._id.toString()
    );
    groupedCount += groupEmps.length;
    console.log(`组 ${group.groupName}: ${groupEmps.length}人`);
  }
  
  // 未分组员工
  const noGroup = employees.filter(e => {
    const hasGroup = groups.some(g => 
      e.groupName === g.groupName || 
      e.teamGroupId === g._id.toString()
    );
    return !hasGroup;
  });
  
  console.log('未分组员工数:', noGroup.length);
  console.log('已分组员工数:', groupedCount);
  
  await mongoose.connection.close();
});