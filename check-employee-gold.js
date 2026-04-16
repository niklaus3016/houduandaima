const mongoose = require('mongoose');
const UserGold = require('./models/UserGold');

// 连接数据库
const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';
mongoose.connect(MONGODB_URI);

// 查询员工的金币余额
async function checkEmployeeGold(employeeId) {
  try {
    console.log(`查询员工 ${employeeId} 的金币余额情况...`);
    
    // 通过员工号查询用户的 UserGold 记录
    const userGolds = await UserGold.find({ employeeId });
    
    if (userGolds.length === 0) {
      console.log(`未找到员工 ${employeeId} 的金币记录`);
    } else {
      console.log(`找到 ${userGolds.length} 条记录:`);
      
      userGolds.forEach((userGold, index) => {
        console.log(`记录 ${index + 1}:`);
        console.log(`  用户ID: ${userGold.userId}`);
        console.log(`  员工号: ${userGold.employeeId}`);
        console.log(`  本月累计金币: ${userGold.currentMonthGold}`);
        console.log(`  上月累计金币: ${userGold.lastMonthGold}`);
        console.log(`  广告次数: ${userGold.adCount}`);
        console.log(`  最后领取奖金日期: ${userGold.lastClaimedBonusDate}`);
        console.log('---');
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('查询员工金币余额时出错:', error);
    process.exit(1);
  }
}

// 运行脚本
const employeeId = '1111';
checkEmployeeGold(employeeId);
