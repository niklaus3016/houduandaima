const mongoose = require('mongoose');

// MongoDB连接字符串
const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

// 定义模型
const TeamGroupSchema = new mongoose.Schema({
  _id: mongoose.Schema.Types.ObjectId,
  groupName: String,
  teamLeaderId: mongoose.Schema.Types.ObjectId
}, { collection: 'teamgroups' });

const EmployeeSchema = new mongoose.Schema({
  employeeId: String,
  username: String,
  teamGroupId: mongoose.Schema.Types.ObjectId,
  groupName: String
}, { collection: 'employees' });

const TeamGroup = mongoose.model('TeamGroup', TeamGroupSchema);
const Employee = mongoose.model('Employee', EmployeeSchema);

async function analyzeData() {
  try {
    console.log('=== 分析数据对应关系 ===\n');

    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功\n');

    // 查洁然如初代理组
    const group = await TeamGroup.findOne({ groupName: '洁然如初代理' });
    console.log('1. 洁然如初代理组:');
    console.log(`   _id: ${group._id}`);
    console.log(`   teamLeaderId: ${group.teamLeaderId}`);
    console.log('');

    // 查询teamGroupId = group._id 的员工
    console.log(`2. 查询 teamGroupId = ${group._id} 的员工:`);
    const employees1 = await Employee.find({ teamGroupId: group._id });
    console.log(`   找到 ${employees1.length} 个员工`);
    employees1.forEach(e => console.log(`   - ${e.username} (${e.employeeId})`));
    console.log('');

    // 查询teamGroupId = group.teamLeaderId 的员工
    console.log(`3. 查询 teamGroupId = ${group.teamLeaderId} 的员工:`);
    const employees2 = await Employee.find({ teamGroupId: group.teamLeaderId });
    console.log(`   找到 ${employees2.length} 个员工`);
    console.log('');

    // 统计groupName = "洁然如初代理"的员工
    console.log('4. 查询 groupName = "洁然如初代理" 的员工:');
    const employees3 = await Employee.find({ groupName: '洁然如初代理' });
    console.log(`   找到 ${employees3.length} 个员工`);
    console.log('');

    console.log('=== 结论 ===');
    console.log(`组._id = ${group._id}`);
    console.log(`组.teamLeaderId = ${group.teamLeaderId}`);
    console.log(`teamGroupId = 组._id 的员工: ${employees1.length} 个`);
    console.log(`teamGroupId = 组.teamLeaderId 的员工: ${employees2.length} 个`);
    console.log(`groupName = "洁然如初代理" 的员工: ${employees3.length} 个`);

    await mongoose.connection.close();

  } catch (error) {
    console.error('分析失败:', error.message);
  }
}

analyzeData();
