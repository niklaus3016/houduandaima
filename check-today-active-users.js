const mongoose = require('mongoose');

async function getTodayActiveUsers() {
  console.log('=== 查询今日活跃用户数 ===\n');

  try {
    // 连接 MongoDB
    await mongoose.connect('mongodb://127.0.0.1:27017/company_dashboard');
    console.log('已连接到 MongoDB');

    // 计算今日时间范围（北京时间）
    const now = new Date();
    const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const todayStartBeijing = new Date(beijingNow);
    todayStartBeijing.setHours(0, 0, 0, 0);
    const todayStartUTC = new Date(todayStartBeijing.getTime() - 8 * 60 * 60 * 1000);

    console.log('时间范围:');
    console.log('  今天开始 (UTC):', todayStartUTC.toISOString());
    console.log('  现在 (UTC):', now.toISOString());

    // 查询今日所有登录记录
    const loginRecords = await mongoose.connection.collection('loginrecords').find({
      loginDate: { $gte: todayStartUTC, $lt: now }
    }).toArray();

    // 统计唯一用户数
    const uniqueUserIds = new Set(loginRecords.map(record => record.userId));
    const activeUsersCount = uniqueUserIds.size;

    console.log('\n查询结果:');
    console.log('  今日登录记录数:', loginRecords.length);
    console.log('  今日活跃用户数:', activeUsersCount);

    // 检查是否有记录
    if (loginRecords.length > 0) {
      console.log('\n示例登录记录:');
      loginRecords.slice(0, 5).forEach(record => {
        console.log('  - userId:', record.userId, 'employeeId:', record.employeeId, 'loginDate:', record.loginDate);
      });
    }

  } catch (error) {
    console.error('查询失败:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

// 运行查询
getTodayActiveUsers();
