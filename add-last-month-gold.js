const mongoose = require('mongoose');
const UserGold = require('./models/UserGold');
const Employee = require('./models/Employee');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('MongoDB连接成功');
    
    const employeeId = '2222';
    
    // 查找员工2222的用户信息
    console.log('查找员工2222的用户信息...');
    
    // 方法1：直接查找UserGold中employeeId为2222的记录
    const userGold = await UserGold.findOne({ employeeId: employeeId });
    
    if (userGold) {
      console.log('找到用户:', userGold);
      
      // 增加上月金币12345
      const oldLastMonthGold = userGold.lastMonthGold;
      userGold.lastMonthGold += 12345;
      
      await userGold.save();
      console.log('更新成功！');
      console.log('旧上月金币:', oldLastMonthGold);
      console.log('新上月金币:', userGold.lastMonthGold);
    } else {
      console.log('未找到员工2222的用户记录');
      
      // 方法2：查找Employee中employeeId为2222的记录，获取userId
      const employee = await Employee.findOne({ employeeId: employeeId });
      if (employee) {
        console.log('找到员工记录:', employee);
        console.log('员工userId:', employee.userId);
        
        // 检查是否存在UserGold记录
        const existingUserGold = await UserGold.findOne({ userId: employee.userId });
        if (existingUserGold) {
          console.log('找到用户金币记录:', existingUserGold);
          
          // 增加上月金币12345
          const oldLastMonthGold = existingUserGold.lastMonthGold;
          existingUserGold.lastMonthGold += 12345;
          
          await existingUserGold.save();
          console.log('更新成功！');
          console.log('旧上月金币:', oldLastMonthGold);
          console.log('新上月金币:', existingUserGold.lastMonthGold);
        } else {
          console.log('未找到用户金币记录');
        }
      } else {
        console.log('未找到员工2222的记录');
      }
    }
    
    mongoose.disconnect();
    console.log('操作完成');
  })
  .catch(err => {
    console.error('MongoDB连接失败:', err);
    mongoose.disconnect();
  });
