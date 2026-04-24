const mongoose = require('mongoose');
const UserGold = require('./models/UserGold');

// 连接数据库
mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    // 查询用户2222的UserGold记录
    const userGold = await UserGold.findOne({
      employeeId: '2222'
    });

    console.log('\n=== 用户2222的UserGold记录 ===');
    if (userGold) {
      console.log('userId:', userGold.userId);
      console.log('employeeId:', userGold.employeeId);
    } else {
      console.log('未找到UserGold记录');
    }

    // 查询Employee记录
    const Employee = require('./models/Employee');
    const employee = await Employee.findOne({
      employeeId: '2222'
    });

    console.log('\n=== 用户2222的Employee记录 ===');
    if (employee) {
      console.log('_id:', employee._id);
      console.log('employeeId:', employee.employeeId);
    } else {
      console.log('未找到Employee记录');
    }

    // 关闭连接
    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });