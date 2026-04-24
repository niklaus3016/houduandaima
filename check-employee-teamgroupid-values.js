const mongoose = require('mongoose');

// MongoDB连接字符串
const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

// 定义Employee模型
const EmployeeSchema = new mongoose.Schema({
  employeeId: String,
  username: String,
  teamGroupId: String, // 注意这里是String类型
  groupName: String
}, { collection: 'employees' });

const Employee = mongoose.model('Employee', EmployeeSchema);

async function checkTeamGroupIdValues() {
  try {
    console.log('=== 检查Employee表中teamGroupId字段的实际值 ===\n');

    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功\n');

    // 查询groupName为"洁然如初代理"的员工
    const employees = await Employee.find({ groupName: '洁然如初代理' });
    console.log(`找到 ${employees.length} 个员工，groupName为"洁然如初代理"`);
    console.log('');

    // 打印前5个员工的teamGroupId
    console.log('前5个员工的teamGroupId:');
    employees.slice(0, 5).forEach((emp, i) => {
      console.log(`${i+1}. ${emp.username} (${emp.employeeId}): teamGroupId = "${emp.teamGroupId}"`);
    });
    console.log('');

    // 统计不同teamGroupId的值
    const teamGroupIdCounts = {};
    employees.forEach(emp => {
      if (emp.teamGroupId) {
        teamGroupIdCounts[emp.teamGroupId] = (teamGroupIdCounts[emp.teamGroupId] || 0) + 1;
      }
    });

    console.log('teamGroupId统计:');
    Object.entries(teamGroupIdCounts).forEach(([id, count]) => {
      console.log(`  "${id}": ${count}个员工`);
    });

    await mongoose.connection.close();

  } catch (error) {
    console.error('检查失败:', error.message);
  }
}

checkTeamGroupIdValues();
