const mongoose = require('mongoose');
const UserGold = require('./models/UserGold');

// 连接数据库
const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';
mongoose.connect(MONGODB_URI);

// 给多个员工发放特殊奖励
async function addSpecialGoldToMultiple() {
  try {
    console.log('给指定员工发放8888金币的特殊奖励...');
    
    // 定义需要发放奖励的员工信息
    const employees = [
      { employeeId: '5555', amount: 8888 },
      { employeeId: '8886', amount: 8888 },
      { employeeId: '8784', amount: 8888 },
      { employeeId: '3769', amount: 8888 },
      { employeeId: '2222', userId: 'user_2222_1773112309254', amount: 8888 },
      { employeeId: '9999', userId: 'user_9999_1773237523253', amount: 8888 }
    ];
    
    // 遍历每个员工
    for (const employee of employees) {
      console.log(`\n处理员工 ${employee.employeeId}...`);
      
      let userGolds;
      if (employee.userId) {
        // 如果指定了用户ID，直接通过用户ID查询
        userGolds = await UserGold.find({ userId: employee.userId });
      } else {
        // 否则通过员工号查询
        userGolds = await UserGold.find({ employeeId: employee.employeeId });
      }
      
      if (userGolds.length === 0) {
        console.log(`  未找到员工 ${employee.employeeId} 的金币记录`);
      } else {
        for (const userGold of userGolds) {
          console.log(`  发放前 - 用户ID: ${userGold.userId}, 本月金币: ${userGold.currentMonthGold}`);
          
          // 增加金币
          userGold.currentMonthGold += employee.amount;
          
          // 保存更改
          await userGold.save();
          
          console.log(`  发放后 - 用户ID: ${userGold.userId}, 本月金币: ${userGold.currentMonthGold}`);
        }
        console.log(`  成功给员工 ${employee.employeeId} 发放了 ${employee.amount} 金币的特殊奖励！`);
      }
    }
    
    console.log('\n所有员工的特殊奖励发放完成！');
    process.exit(0);
  } catch (error) {
    console.error('发放特殊奖励时出错:', error);
    process.exit(1);
  }
}

// 运行脚本
addSpecialGoldToMultiple();
