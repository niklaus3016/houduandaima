const mongoose = require('mongoose');
const Employee = require('./models/Employee');
const UserGold = require('./models/UserGold');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('MongoDB连接成功');
    
    console.log('=== 查询2222的用户信息 ===\n');
    
    // 查找2222的员工信息
    const employee = await Employee.findOne({ employeeId: '2222' });
    
    if (employee) {
      console.log('找到员工2222:');
      console.log(`- 用户ID: ${employee.userId}`);
      console.log(`- 员工ID: ${employee.employeeId}`);
      
      // 查找用户金币信息
      const userGold = await UserGold.findOne({ userId: employee.userId });
      if (userGold) {
        console.log(`- 当月金币: ${userGold.currentMonthGold}`);
        console.log(`- 上月金币: ${userGold.lastMonthGold}`);
      }
    } else {
      console.log('未找到员工2222');
    }
    
    mongoose.disconnect();
    console.log('\n操作完成');
  })
  .catch(err => {
    console.error('MongoDB连接失败:', err);
    mongoose.disconnect();
  });
