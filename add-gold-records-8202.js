const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');
const UserGold = require('./models/UserGold');

async function addGoldRecords() {
  try {
    await mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017');
    console.log('MongoDB连接成功');
    
    const employeeId = '8202';
    const userId = 'user_8202_1772466028893';
    const currentTime = new Date();
    
    // 1. 添加500金币记录
    const goldLog1 = new GoldLog({
      userId: userId,
      employeeId: employeeId,
      gold: 500,
      type: 'ad',
      createTime: currentTime
    });
    await goldLog1.save();
    console.log('✅ 已添加500金币记录');
    
    // 2. 添加1000金币记录
    const goldLog2 = new GoldLog({
      userId: userId,
      employeeId: employeeId,
      gold: 1000,
      type: 'ad',
      createTime: currentTime
    });
    await goldLog2.save();
    console.log('✅ 已添加1000金币记录');
    
    // 3. 更新UserGold记录
    const userGold = await UserGold.findOne({ employeeId: employeeId });
    if (userGold) {
      userGold.currentMonthGold = (userGold.currentMonthGold || 0) + 500 + 1000;
      userGold.adCount = (userGold.adCount || 0) + 2;
      await userGold.save();
      console.log('✅ 已更新UserGold记录');
      console.log('更新后currentMonthGold:', userGold.currentMonthGold);
      console.log('更新后adCount:', userGold.adCount);
    } else {
      console.log('❌ 未找到8202用户的UserGold记录');
    }
    
    // 4. 验证添加结果
    const goldLogs = await GoldLog.find({ 
      employeeId: employeeId, 
      createTime: { $gte: new Date(Date.now() - 60000) } // 只查询最近1分钟的记录
    });
    console.log('\n最近添加的金币记录:', goldLogs);
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('添加金币记录时出错:', error);
    await mongoose.connection.close();
  }
}

addGoldRecords();