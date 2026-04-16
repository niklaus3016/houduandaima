const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function checkLatestGoldLog() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('数据库连接成功\n');
    
    const GoldLog = mongoose.connection.db.collection('goldlogs');
    
    // 查询用户1111的最新一条金币记录
    const latestLog = await GoldLog.find({ employeeId: '1111' })
      .sort({ createTime: -1 })
      .limit(1)
      .toArray();
    
    console.log('========================================');
    console.log('用户1111的最新金币记录');
    console.log('========================================');
    console.log(JSON.stringify(latestLog[0], null, 2));
    
  } catch (error) {
    console.error('查询失败:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n数据库连接已关闭');
  }
}

checkLatestGoldLog();
