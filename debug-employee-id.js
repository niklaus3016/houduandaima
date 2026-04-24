const mongoose = require('mongoose');
const LoginRecord = require('./models/LoginRecord');

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

async function checkLoginRecords() {
  console.log('=== 检查 LoginRecord 中的 employeeId ===\n');

  try {
    // 检查 test_7777 的记录
    const testUserRecords = await LoginRecord.find({ userId: 'test_7777' });
    console.log('test_7777 的记录:');
    for (const record of testUserRecords) {
      console.log(`  userId: ${record.userId}, employeeId: ${record.employeeId}, loginDate: ${record.loginDate.toISOString()}`);
    }

    // 检查所有记录中的 employeeId 格式
    const allRecords = await LoginRecord.find({}).limit(10);
    console.log('\n所有记录（前10条）的 userId 和 employeeId:');
    for (const record of allRecords) {
      console.log(`  userId: ${record.userId}, employeeId: ${record.employeeId}`);
    }

    // 检查是否有 employeeId 为 '7777' 的记录
    const employee7777Records = await LoginRecord.find({ employeeId: '7777' });
    console.log('\nemployeeId=7777 的记录:', employee7777Records.length);
    if (employee7777Records.length > 0) {
      console.log('示例:', employee7777Records[0]);
    }

  } catch (error) {
    console.error('查询错误:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n已断开 MongoDB 连接');
  }
}

connectDB().then(checkLoginRecords);
