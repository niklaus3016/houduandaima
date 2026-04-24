const mongoose = require('mongoose');

// MongoDB连接字符串
const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

// 导入模型
const TeamGroup = require('./models/TeamGroup');
const Employee = require('./models/Employee');

async function testTeamLeaderLogic() {
  try {
    console.log('=== 测试团队长逻辑 ===\n');

    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功\n');

    // cuiding的用户ID
    const cuidingUserId = '69af8e34132651c70aa85608';
    console.log(`测试用户ID: ${cuidingUserId}\n`);

    // 1. 查TeamGroup
    console.log('1. 查询TeamGroup:');
    const groups = await TeamGroup.find({ teamLeaderId: cuidingUserId });
    console.log(`找到 ${groups.length} 个组`);
    groups.forEach(g => {
      console.log(`  - ${g.groupName} (id: ${g._id}, teamLeaderId: ${g.teamLeaderId}, groupLeaderId: ${g.groupLeaderId})`);
    });
    console.log('');

    if (groups.length > 0) {
      // 2. 收集所有可能的ID
      const groupIds = groups.map(g => g._id.toString());
      const teamLeaderIds = groups.map(g => g.teamLeaderId?.toString()).filter(id => id);
      const groupLeaderIds = groups.map(g => g.groupLeaderId?.toString()).filter(id => id);
      
      // 合并所有可能的ID
      const allPossibleIds = [...groupIds, ...teamLeaderIds, ...groupLeaderIds];
      
      console.log('2. 收集的ID:');
      console.log(`  groupIds: ${groupIds}`);
      console.log(`  teamLeaderIds: ${teamLeaderIds}`);
      console.log(`  groupLeaderIds: ${groupLeaderIds}`);
      console.log(`  allPossibleIds: ${allPossibleIds}`);
      console.log('');

      // 3. 查Employee
      console.log('3. 查询Employee:');
      const allEmployees = await Employee.find({
        teamGroupId: { $in: allPossibleIds }
      });
      console.log(`找到 ${allEmployees.length} 个员工`);
      
      if (allEmployees.length > 0) {
        console.log('前5个员工:');
        allEmployees.slice(0, 5).forEach((emp, i) => {
          console.log(`${i+1}. ${emp.employeeId}, teamGroupId: ${emp.teamGroupId}, groupName: ${emp.groupName}`);
        });
      }
      console.log('');

      // 4. 按groupName分组
      console.log('4. 按groupName分组:');
      const employeesByGroup = {};
      allEmployees.forEach(emp => {
        if (emp.groupName) {
          if (!employeesByGroup[emp.groupName]) {
            employeesByGroup[emp.groupName] = [];
          }
          employeesByGroup[emp.groupName].push(emp);
        }
      });

      console.log(`共有 ${Object.keys(employeesByGroup).length} 个组:`);
      Object.entries(employeesByGroup).forEach(([groupName, emps]) => {
        console.log(`  - ${groupName}: ${emps.length} 个员工`);
      });
    }

    await mongoose.connection.close();

  } catch (error) {
    console.error('测试失败:', error.message);
    if (error.stack) {
      console.error('错误堆栈:', error.stack);
    }
  }
}

testTeamLeaderLogic();
