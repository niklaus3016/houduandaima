const mongoose = require('mongoose');

// MongoDB连接字符串
const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

// 定义Employee模型
const EmployeeSchema = new mongoose.Schema({
  _id: mongoose.Schema.Types.ObjectId,
  employeeId: String,
  realName: String,
  username: String,
  teamGroupId: mongoose.Schema.Types.ObjectId,
  groupName: String,
  parentId: mongoose.Schema.Types.ObjectId,
  role: String
}, { collection: 'employees' });

const Employee = mongoose.model('Employee', EmployeeSchema);

// 定义TeamGroup模型
const TeamGroupSchema = new mongoose.Schema({
  _id: mongoose.Schema.Types.ObjectId,
  groupName: String,
  groupLeaderName: String,
  teamLeaderId: mongoose.Schema.Types.ObjectId,
  teamName: String
}, { collection: 'teamgroups' });

const TeamGroup = mongoose.model('TeamGroup', TeamGroupSchema);

async function debugFanjie() {
  try {
    console.log('=== 调试fanjie的数据 ===\n');

    // 连接MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功\n');

    // 查询fanjie的员工信息
    console.log('1. 查询fanjie的员工信息:');
    const fanjieEmployee = await Employee.findOne({ username: 'fanjie' });
    if (fanjieEmployee) {
      console.log(`   employeeId: ${fanjieEmployee.employeeId}`);
      console.log(`   username: ${fanjieEmployee.username}`);
      console.log(`   realName: ${fanjieEmployee.realName}`);
      console.log(`   teamGroupId: ${fanjieEmployee.teamGroupId}`);
      console.log(`   groupName: ${fanjieEmployee.groupName}`);
      console.log(`   parentId: ${fanjieEmployee.parentId}`);
      console.log(`   role: ${fanjieEmployee.role}`);
    } else {
      console.log('   未找到fanjie的员工记录');
    }

    console.log('\n2. 查询所有teamGroupId对应的TeamGroup:');
    const allGroups = await TeamGroup.find({});
    allGroups.forEach(group => {
      console.log(`   TeamGroup: ${group.groupName}, teamLeaderId: ${group.teamLeaderId}`);
    });

    console.log('\n3. 查询Employee表中所有groupName为"洁然如初代理"的员工:');
    const jieranEmployees = await Employee.find({ groupName: '洁然如初代理' });
    console.log(`   找到 ${jieranEmployees.length} 个员工`);
    jieranEmployees.forEach((emp, i) => {
      console.log(`   ${i+1}. employeeId: ${emp.employeeId}, teamGroupId: ${emp.teamGroupId}`);
    });

    console.log('\n4. 查询Employee表中teamGroupId为 69cd2b3f4b7bff2403ab4c79 的员工:');
    const teamGroupEmployees = await Employee.find({
      teamGroupId: new mongoose.Types.ObjectId('69cd2b3f4b7bff2403ab4c79')
    });
    console.log(`   找到 ${teamGroupEmployees.length} 个员工`);
    teamGroupEmployees.forEach((emp, i) => {
      console.log(`   ${i+1}. employeeId: ${emp.employeeId}, username: ${emp.username}, groupName: ${emp.groupName}`);
    });

    await mongoose.connection.close();

  } catch (error) {
    console.error('调试失败:', error.message);
    if (error.stack) {
      console.error('错误堆栈:', error.stack);
    }
  }
}

debugFanjie();
