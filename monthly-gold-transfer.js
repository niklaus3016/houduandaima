const mongoose = require('mongoose');
const UserGold = require('./models/UserGold');

// 连接数据库
const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';
mongoose.connect(MONGODB_URI);

// 执行月度金币转移
async function transferMonthlyGold() {
  try {
    console.log('开始执行月度金币转移...');
    
    // 查找所有用户的 UserGold 记录
    const userGolds = await UserGold.find();
    
    console.log(`找到 ${userGolds.length} 个用户记录`);
    
    // 遍历每个用户记录，将当前月金币转移到上月金币
    for (const userGold of userGolds) {
      // 保存当前月金币到上月金币
      userGold.lastMonthGold = userGold.currentMonthGold;
      // 重置当前月金币为 0
      userGold.currentMonthGold = 0;
      
      // 保存更改
      await userGold.save();
      
      console.log(`用户 ${userGold.userId} (员工号: ${userGold.employeeId}) 的金币已转移: 上月金币 = ${userGold.lastMonthGold}, 当前月金币 = ${userGold.currentMonthGold}`);
    }
    
    console.log('月度金币转移完成！');
    process.exit(0);
  } catch (error) {
    console.error('执行月度金币转移时出错:', error);
    process.exit(1);
  }
}

// 运行脚本
transferMonthlyGold();
