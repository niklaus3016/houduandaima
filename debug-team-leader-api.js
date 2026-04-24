const mongoose = require('mongoose');

// MongoDB连接字符串
const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

// 导入模型
const TeamGroup = require('./models/TeamGroup');
const Employee = require('./models/Employee');

async function debugTeamLeaderAPI() {
  try {
    console.log('=== 调试团队长API逻辑 ===\n');

    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功\n');

    const fanjieUserId = '69cd2b814b7bff2403ab4f70';
    console.log(`测试用户ID: ${fanjieUserId}\n`);

    // 1. 模拟API中的TeamGroup查询
    console.log('1. 模拟API中的TeamGroup查询:');
    const groups = await TeamGroup.find({
      $or: [
        { teamLeaderId: fanjieUserId },
        { teamLeaderId: new mongoose.Types.ObjectId(fanjieUserId) }
      ]
    });
    console.log(`找到 ${groups.length} 个组`);
    groups.forEach(g => {
      console.log(`  - ${g.groupName} (id: ${g._id}, teamLeaderId: ${g.teamLeaderId})`);
    });
    console.log('');

    if (groups.length > 0) {
      // 2. 收集groupIds和teamLeaderIds
      const groupIds = groups.map(g => g._id.toString());
      const teamLeaderIds = groups.map(g => g.teamLeaderId?.toString()).filter(id => id);
      console.log('2. 收集的ID:');
      console.log(`  groupIds: ${groupIds}`);
      console.log(`  teamLeaderIds: ${teamLeaderIds}`);
      console.log('');

      // 3. 测试员工查询
      console.log('3. 测试员工查询:');
      
      // 测试1: 用groupIds查询
      const employees1 = await Employee.find({
        teamGroupId: { $in: groupIds }
      });
      console.log(`  用groupIds查询: ${employees1.length} 个员工`);

      // 测试2: 用teamLeaderIds查询
      const employees2 = await Employee.find({
        teamGroupId: { $in: teamLeaderIds }
      });
      console.log(`  用teamLeaderIds查询: ${employees2.length} 个员工`);

      // 测试3: 用$or查询
      const employees3 = await Employee.find({
        $or: [
          { teamGroupId: { $in: groupIds } },
          { teamGroupId: { $in: teamLeaderIds } }
        ]
      });
      console.log(`  用$or查询: ${employees3.length} 个员工`);

      // 测试4: 用groupName查询
      const employees4 = await Employee.find({
        groupName: '洁然如初代理'
      });
      console.log(`  用groupName查询: ${employees4.length} 个员工`);
      console.log('');

      // 5. 打印前几个员工的信息
      if (employees3.length > 0) {
        console.log('4. 前3个员工的信息:');
        employees3.slice(0, 3).forEach((emp, i) => {
          console.log(`${i+1}. employeeId: ${emp.employeeId}`);
          console.log(`   teamGroupId: "${emp.teamGroupId}"`);
          console.log(`   groupName: "${emp.groupName}"`);
        });
      }
    }

    await mongoose.connection.close();

  } catch (error) {
    console.error('调试失败:', error.message);
    if (error.stack) {
      console.error('错误堆栈:', error.stack);
    }
  }
}

debugTeamLeaderAPI();
