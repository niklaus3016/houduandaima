const mongoose = require('mongoose');
const Employee = require('./models/Employee');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function checkEmployee() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功');

    const employeeId = '2222';
    const employee = await Employee.findOne({ employeeId });

    if (employee) {
      console.log('✅ 员工2222存在:');
      console.log(`员工号: ${employee.employeeId}`);
      console.log(`姓名: ${employee.name}`);
      console.log(`真实姓名: ${employee.realName}`);
      console.log(`状态: ${employee.status}`);
      console.log(`角色: ${employee.role}`);
      console.log(`手机号码: ${employee.phone}`);
      console.log(`区域: ${employee.area}`);
      console.log(`创建时间: ${employee.createdAt}`);
    } else {
      console.log('❌ 员工2222不存在');
    }

    // 检查所有员工号
    const allEmployees = await Employee.find({});
    console.log(`\n=== 所有员工号 ===`);
    allEmployees.forEach(emp => {
      console.log(`员工号: ${emp.employeeId}, 姓名: ${emp.name}, 状态: ${emp.status}`);
    });

    await mongoose.disconnect();
    console.log('\n完成');
  } catch (error) {
    console.error('错误:', error);
    process.exit(1);
  }
}

checkEmployee();
