const mongoose = require('mongoose');

async function findTeamByEmployee() {
  try {
    // 连接数据库
    const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功');

    // 直接查询employees集合，搜索指定员工
    const db = mongoose.connection;
    const employees = await db.collection('employees').find({ 
      employeeId: { $in: ['8888', '9999'] } 
    }).toArray();
    
    console.log('=== 搜索员工8888和9999 ===');
    console.log(`找到 ${employees.length} 个员工`);
    
    for (const emp of employees) {
      console.log(`\n员工 ${emp.employeeId}:`);
      console.log('  realName:', emp.realName);
      console.log('  teamGroupId:', emp.teamGroupId);
      console.log('  groupName:', emp.groupName);
      console.log('  parentId:', emp.parentId);
      console.log('  role:', emp.role);
      
      // 通过parentId查询团队长信息
      if (emp.parentId) {
        const admin = await db.collection('admins').findOne({ _id: mongoose.Types.ObjectId(emp.parentId) });
        if (admin) {
          console.log('  团队长信息:');
          console.log('    username:', admin.username);
          console.log('    realName:', admin.realName);
        }
      }
      
      // 通过teamGroupId查询团队组信息
      if (emp.teamGroupId) {
        const group = await db.collection('teamgroups').findOne({ _id: mongoose.Types.ObjectId(emp.teamGroupId) });
        if (group) {
          console.log('  团队组信息:');
          console.log('    teamName:', group.teamName);
          console.log('    groupName:', group.groupName);
          console.log('    teamLeaderId:', group.teamLeaderId);
        }
      }
    }

    // 搜索团队长huangzhenhui
    const admin = await db.collection('admins').findOne({ username: 'huangzhenhui' });
    if (admin) {
      console.log('\n=== 团队长huangzhenhui ===');
      console.log('  _id:', admin._id);
      console.log('  username:', admin.username);
      console.log('  realName:', admin.realName);
      console.log('  role:', admin.role);
      
      // 查询该团队长的所有员工
      const adminEmployees = await db.collection('employees').find({ parentId: admin._id.toString() }).toArray();
      console.log(`  管理的员工数: ${adminEmployees.length}`);
      adminEmployees.forEach((emp, index) => {
        console.log(`  ${index + 1}. ${emp.employeeId} - ${emp.realName}`);
      });
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('查询失败:', error);
    await mongoose.disconnect();
  }
}

findTeamByEmployee();