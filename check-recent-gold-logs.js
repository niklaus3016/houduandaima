const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function checkRecentGoldLogs() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('数据库连接成功\n');
    
    const GoldLog = mongoose.connection.db.collection('goldlogs');
    
    // 查询最近10条广告记录
    const recentLogs = await GoldLog.find({}).sort({ createdAt: -1 }).limit(10).toArray();
    
    console.log('========================================');
    console.log('最近10条广告记录（所有用户）');
    console.log('========================================');
    
    if (recentLogs.length === 0) {
      console.log('没有找到任何广告记录');
    } else {
      recentLogs.forEach((log, index) => {
        console.log(`${index + 1}. 用户ID: ${log.userId || '未知'}`);
        console.log(`   员工ID: ${log.employeeId || '未知'}`);
        console.log(`   时间: ${log.createdAt ? log.createdAt.toISOString() : '未知'}`);
        console.log(`   金币: ${log.gold || 0}`);
        console.log(`   ECPM: ${log.ecpm || 0}`);
        console.log(`   类型: ${log.type || '未知'}`);
        console.log('');
      });
    }
    
    // 统计总记录数
    const totalCount = await GoldLog.countDocuments({});
    console.log(`总广告记录数: ${totalCount}`);
    
    // 统计今天的记录数
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayCount = await GoldLog.countDocuments({
      createdAt: { $gte: todayStart }
    });
    console.log(`今天广告记录数: ${todayCount}`);
    
  } catch (error) {
    console.error('查询失败:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n数据库连接已关闭');
  }
}

checkRecentGoldLogs();
