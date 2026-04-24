const mongoose = require('mongoose');
const Employee = require('./models/Employee');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    console.log('\n=== 按手机号查询 ===');
    const employee = await Employee.findOne({ phone: '13566117222' });
    if (employee) {
      console.log('找到员工:', JSON.stringify(employee, null, 2));
    } else {
      console.log('未找到该手机号的员工');
    }

    console.log('\n=== 按员工号查询 ===');
    const emp7523 = await Employee.findOne({ employeeId: '7523' });
    if (emp7523) {
      console.log('找到员工7523:', JSON.stringify(emp7523, null, 2));
    } else {
      console.log('未找到员工7523');
    }

    console.log('\n=== 查询所有最近的员工（按创建时间排序） ===');
    const recentEmployees = await Employee.find({}).sort({ createdAt: -1 }).limit(10);
    console.log('最近10个注册的員工:');
    recentEmployees.forEach(emp => {
      console.log(`employeeId: ${emp.employeeId}, phone: ${emp.phone}, createdAt: ${emp.createdAt.toISOString()}`);
    });

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });