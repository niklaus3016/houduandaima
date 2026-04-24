const mongoose = require('mongoose');
const LoginRecord = require('./models/LoginRecord');

// 使用环境变量或默认值
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB 连接成功');
  } catch (error) {
    console.error('MongoDB 连接失败:', error.message);
    process.exit(1);
  }
}

function getCurrentTime() {
  const now = new Date();
  const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return { utc: now, beijing: beijingNow };
}

function getTodayRange() {
  const { beijing } = getCurrentTime();
  const todayStartBeijing = new Date(beijing.getFullYear(), beijing.getMonth(), beijing.getDate(), 0, 0, 0, 0);
  const todayEndBeijing = new Date(beijing.getFullYear(), beijing.getMonth(), beijing.getDate(), 23, 59, 59, 999);
  const startDate = new Date(todayStartBeijing.getTime() - 8 * 60 * 60 * 1000);
  const endDate = new Date(todayEndBeijing.getTime() - 8 * 60 * 60 * 1000);
  return { startDate, endDate };
}

async function checkLoginRecords() {
  console.log('=== 直接检查 LoginRecord 数据 ===\n');

  const { startDate, endDate } = getTodayRange();
  console.log('今天时间范围（UTC）:');
  console.log('  开始:', startDate.toISOString());
  console.log('  结束:', endDate.toISOString());

  try {
    const allRecords = await LoginRecord.find({});
    console.log('\n所有 LoginRecord:', allRecords.length);

    if (allRecords.length > 0) {
      console.log('\n最新的 5 条记录:');
      for (const record of allRecords.slice(-5)) {
        console.log(`  userId: ${record.userId}, loginDate: ${record.loginDate.toISOString()}`);
      }
    }

    const todayRecords = await LoginRecord.find({
      loginDate: { $gte: startDate, $lt: endDate }
    });
    console.log('\n今天的 LoginRecord:', todayRecords.length);

    if (todayRecords.length > 0) {
      console.log('\n今天的记录:');
      for (const record of todayRecords) {
        console.log(`  userId: ${record.userId}, loginDate: ${record.loginDate.toISOString()}`);
      }
    }

    const testUserRecords = await LoginRecord.find({ userId: 'test_7777' });
    console.log('\ntest_7777 的记录:', testUserRecords.length);

    if (testUserRecords.length > 0) {
      console.log('\ntest_7777 的记录:');
      for (const record of testUserRecords) {
        console.log(`  loginDate: ${record.loginDate.toISOString()}`);
      }
    }

  } catch (error) {
    console.error('查询错误:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n已断开 MongoDB 连接');
  }
}

connectDB().then(checkLoginRecords);
