const mongoose = require('mongoose');
const Admin = require('./models/Admin');
const TeamGroup = require('./models/TeamGroup');
const Employee = require('./models/Employee');

// 连接数据库
mongoose.connect('mongodb://localhost:27017/test-db', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// 测试团队长账号
async function testTeamLeaderAccounts() {
  try {
    console.log('=== 测试团队长账号 ===\n');
    
    // 测试 cuiding 账号
    console.log('--- 测试团队长账号 (cuiding) ---');
    const cuiding = await Admin.findOne({ username: 'cuiding' });
    if (cuiding) {
      console.log('账号信息:', {
        username: cuiding.username,
        role: cuiding.role,
        teamName: cuiding.teamName,
        teamGroupId: cuiding.teamGroupId
      });
      
      // 检查 TeamGroup
      if (cuiding.teamName) {
        const groups = await TeamGroup.find({ teamName: cuiding.teamName });
        console.log('TeamGroup 数量:', groups.length);
        if (groups.length > 0) {
          console.log('第一个 TeamGroup:', {
            groupName: groups[0].groupName,
            teamLeaderId: groups[0].teamLeaderId
          });
        }
      }
      
      // 检查员工
      if (cuiding._id) {
        const employees = await Employee.find({ parentId: cuiding._id.toString() });
        console.log('员工数量:', employees.length);
        if (employees.length > 0) {
          console.log('第一个员工:', {
            employeeId: employees[0].employeeId,
            realName: employees[0].realName,
            teamGroupId: employees[0].teamGroupId
          });
        }
      }
    } else {
      console.log('账号不存在');
    }
    
    console.log('\n');
    
    // 测试 huangzhenhui 账号
    console.log('--- 测试团队长账号 (huangzhenhui) ---');
    const huangzhenhui = await Admin.findOne({ username: 'huangzhenhui' });
    if (huangzhenhui) {
      console.log('账号信息:', {
        username: huangzhenhui.username,
        role: huangzhenhui.role,
        teamName: huangzhenhui.teamName,
        teamGroupId: huangzhenhui.teamGroupId
      });
      
      // 检查 TeamGroup
      if (huangzhenhui.teamName) {
        const groups = await TeamGroup.find({ teamName: huangzhenhui.teamName });
        console.log('TeamGroup 数量:', groups.length);
        if (groups.length > 0) {
          console.log('第一个 TeamGroup:', {
            groupName: groups[0].groupName,
            teamLeaderId: groups[0].teamLeaderId
          });
        }
      }
      
      // 检查员工
      if (huangzhenhui._id) {
        const employees = await Employee.find({ parentId: huangzhenhui._id.toString() });
        console.log('员工数量:', employees.length);
        if (employees.length > 0) {
          console.log('第一个员工:', {
            employeeId: employees[0].employeeId,
            realName: employees[0].realName,
            teamGroupId: employees[0].teamGroupId
          });
        }
      }
    } else {
      console.log('账号不存在');
    }
    
    console.log('\n=== 测试完成 ===');
  } catch (error) {
    console.error('测试出错:', error);
  } finally {
    mongoose.disconnect();
  }
}

// 运行测试
testTeamLeaderAccounts();
