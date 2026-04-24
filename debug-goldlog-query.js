const axios = require('axios');

const API_BASE_URL = 'http://127.0.0.1:3003/api';
const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');
const Employee = require('./models/Employee');
const TeamGroup = require('./models/TeamGroup');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function login(username, password) {
  try {
    const response = await axios.post(`${API_BASE_URL}/admin/login`, {
      username,
      password
    });
    return response.data.data.token;
  } catch (error) {
    console.error(`登录失败:`, error.response?.data || error.message);
    return null;
  }
}

async function runTests() {
  console.log('=== 直接检查数据库中的 GoldLog 数据 ===\n');

  await mongoose.connect(MONGODB_URI);

  const beijingDate = new Date(new Date().getTime() + 8 * 60 * 60 * 1000);
  const todayStartBeijing = new Date(beijingDate.getFullYear(), beijingDate.getMonth(), beijingDate.getDate(), 0, 0, 0, 0);
  const todayStartUTC = new Date(todayStartBeijing.getTime() - 8 * 60 * 60 * 1000);
  const todayEndUTC = new Date(todayStartBeijing.getTime() + 24 * 60 * 60 * 1000 - 8 * 60 * 60 * 1000);

  console.log('当前北京时间:', beijingDate.toISOString());
  console.log('今日开始时间(UTC):', todayStartUTC.toISOString());
  console.log('今日结束时间(UTC):', todayEndUTC.toISOString());

  try {
    // 检查 GoldLog 中的记录
    const allGoldLogs = await GoldLog.find({}).limit(5);
    console.log('\nGoldLog 示例记录:');
    for (const log of allGoldLogs) {
      console.log(`  employeeId: ${log.employeeId}, gold: ${log.gold}, ecpm: ${log.ecpm}, createTime: ${log.createTime.toISOString()}`);
    }

    // 检查总数
    const totalCount = await GoldLog.countDocuments({});
    const todayCount = await GoldLog.countDocuments({
      createTime: { $gte: todayStartUTC, $lt: todayEndUTC }
    });
    console.log('\nGoldLog 总数:', totalCount);
    console.log('今日 GoldLog 数量:', todayCount);

    // 检查"洁然如初代理"组的员工
    const group = await TeamGroup.findOne({ groupName: '洁然如初代理' });
    if (group) {
      console.log('\n洁然如初代理组 ID:', group._id.toString());
      const employees = await Employee.find({ teamGroupId: group._id.toString() });
      const employeeIds = employees.map(e => e.employeeId);
      console.log('员工数量:', employeeIds.length);
      console.log('员工ID示例:', employeeIds.slice(0, 5));

      // 查询这些员工的今日 GoldLog
      const todayGoldLogs = await GoldLog.find({
        employeeId: { $in: employeeIds },
        createTime: { $gte: todayStartUTC, $lt: todayEndUTC }
      });
      console.log('\n这些员工今日的 GoldLog 数量:', todayGoldLogs.length);

      if (todayGoldLogs.length > 0) {
        console.log('示例:');
        for (const log of todayGoldLogs.slice(0, 3)) {
          console.log(`  employeeId: ${log.employeeId}, gold: ${log.gold}, ecpm: ${log.ecpm}, createTime: ${log.createTime.toISOString()}`);
        }
      }
    }

  } catch (error) {
    console.error('错误:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

runTests();
