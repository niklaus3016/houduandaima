const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function checkGoldLogs() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('数据库连接成功\n');
    
    const GoldLog = mongoose.connection.db.collection('goldlogs');
    
    // 获取北京时间
    function getBeijingDate() {
      const now = new Date();
      return new Date(now.getTime() + 8 * 60 * 60 * 1000);
    }
    
    // 查询用户1111今天的金币记录
    const today = getBeijingDate();
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);
    const todayStartUTC = new Date(todayStart.getTime() - 8 * 60 * 60 * 1000);
    const todayEndUTC = new Date(todayStartUTC.getTime() + 24 * 60 * 60 * 1000);
    
    const todayLogs = await GoldLog.find({
      employeeId: '1111',
      createTime: {
        $gte: todayStartUTC,
        $lt: todayEndUTC
      }
    }).toArray();
    
    console.log('========================================');
    console.log('用户1111今天的金币记录');
    console.log('========================================');
    console.log(`记录数: ${todayLogs.length}`);
    
    if (todayLogs.length > 0) {
      let totalGold = 0;
      todayLogs.forEach((log, index) => {
        console.log(`\n记录 ${index + 1}:`);
        console.log(`  时间: ${log.createTime.toISOString()}`);
        console.log(`  金币: ${log.gold}`);
        console.log(`  ECPM: ${log.ecpm}`);
        console.log(`  设备ID: ${log.deviceId}`);
        totalGold += log.gold || 0;
      });
      console.log(`\n今日总金币: ${totalGold}`);
    }
    
    // 查看GoldLog表的所有字段
    const sampleLog = await GoldLog.findOne({});
    if (sampleLog) {
      console.log('\n========================================');
      console.log('GoldLog表的字段');
      console.log('========================================');
      console.log(Object.keys(sampleLog));
    }
    
  } catch (error) {
    console.error('查询失败:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n数据库连接已关闭');
  }
}

checkGoldLogs();
