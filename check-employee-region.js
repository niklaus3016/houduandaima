const mongoose = require('mongoose');
const Employee = require('./models/Employee');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function checkEmployeeRegion() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功');

    const employeeId = '2222';
    const employee = await Employee.findOne({ employeeId });

    if (employee) {
      console.log('员工2222完整信息:');
      console.log(JSON.stringify(employee, null, 2));
    } else {
      console.log('❌ 员工2222不存在');
    }

    await mongoose.disconnect();
    console.log('\n完成');
  } catch (error) {
    console.error('错误:', error);
    process.exit(1);
  }
}

checkEmployeeRegion();
