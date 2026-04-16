const mongoose = require('mongoose');
const UserGold = require('./models/UserGold');

// 连接数据库
const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';
mongoose.connect(MONGODB_URI);

// 给员工发放特殊奖励
async function addSpecialGold(employeeId, amount) {
  try {
    console.log(`给员工 ${employeeId} 发放 ${amount} 金币的特殊奖励...`);
    
    // 通过员工号查询用户的 UserGold 记录
    const userGolds = await UserGold.find({ employeeId });
    
    if (userGolds.length === 0) {
      console.log(`未找到员工 ${employeeId} 的金币记录`);
    } else {
      console.log(`找到 ${userGolds.length} 条记录:`);
      
      for (const userGold of userGolds) {
        console.log(`发放前 - 用户ID: ${userGold.userId}, 本月金币: ${userGold.currentMonthGold}`);
        
        // 增加金币
        userGold.currentMonthGold += amount;
        
        // 保存更改
        await userGold.save();
        
        console.log(`发放后 - 用户ID: ${userGold.userId}, 本月金币: ${userGold.currentMonthGold}`);
        console.log('---');
      }
      
      console.log(`成功给员工 ${employeeId} 发放了 ${amount} 金币的特殊奖励！`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('发放特殊奖励时出错:', error);
    process.exit(1);
  }
}

// 运行脚本
const employeeId = '1111';
const amount = 8888;
addSpecialGold(employeeId, amount);
