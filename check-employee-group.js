const mongoose = require('mongoose');
const Employee = require('./models/Employee');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function checkEmployeeGroup() {
  try {
    // 连接MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功');

    // 查询8202员工的信息
    const employee = await Employee.findOne({ employeeId: '8202' });
    console.log('8202员工的信息:', employee);

    if (employee) {
      console.log('8202员工的组ID:', employee.teamGroupId);
      console.log('8202员工的组名:', employee.groupName);
    } else {
      console.log('未找到8202员工');
    }

    // 断开连接
    await mongoose.disconnect();
  } catch (error) {
    console.error('查询错误:', error);
    // 断开连接
    await mongoose.disconnect();
  }
}

checkEmployeeGroup();