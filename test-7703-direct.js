const GoldLog = require('./models/GoldLog');
const mongoose = require('mongoose');

async function test() {
  await mongoose.connect('mongodb://localhost:27017/ad-monetization');

  // 北京时间2025-04-20 00:00:00 对应的UTC时间
  // 北京时间 = UTC + 8小时
  // 所以北京时间2025-04-20 00:00:00 = UTC 2025-04-19 16:00:00

  // 当前北京时间是2025-04-20 14:xx左右，所以：
  // 开始时间：北京时间2025-04-20 00:00:00 = UTC 2025-04-19 16:00:00
  // 结束时间：北京时间2025-04-20 23:59:59 = UTC 2025-04-20 15:59:59

  const todayStartUTC = new Date('2025-04-19T16:00:00.000Z');
  const todayEndUTC = new Date('2025-04-20T15:59:59.999Z');

  console.log('=== 查询7703员工的金币记录（按employeeId统计）===');
  console.log('开始时间(UTC):', todayStartUTC);
  console.log('结束时间(UTC):', todayEndUTC);

  const logsByEmployee = await GoldLog.find({
    employeeId: '7703',
    createTime: { $gte: todayStartUTC, $lt: todayEndUTC }
  });

  console.log('按employeeId统计，7703今日记录数:', logsByEmployee.length);

  // 统计金币总数
  const totalGoldByEmployee = logsByEmployee.reduce((sum, log) => sum + log.gold, 0);
  console.log('按employeeId统计，7703今日总金币:', totalGoldByEmployee);

  // 获取所有userId
  const userIds = [...new Set(logsByEmployee.map(log => log.userId))];
  console.log('7703下对应的userId数量:', userIds.length);
  console.log('userId列表:', userIds);

  console.log('\n=== 按userId分别统计 ===');
  for (const userId of userIds) {
    const userLogs = logsByEmployee.filter(log => log.userId === userId);
    const userGold = userLogs.reduce((sum, log) => sum + log.gold, 0);
    console.log(`userId: ${userId}, 记录数: ${userLogs.length}, 总金币: ${userGold}`);
  }

  // 按userId统计总数
  let totalByUserId = 0;
  let totalCountByUserId = 0;
  for (const userId of userIds) {
    const userLogs = logsByEmployee.filter(log => log.userId === userId);
    totalByUserId += userLogs.reduce((sum, log) => sum + log.gold, 0);
    totalCountByUserId += userLogs.length;
  }
  console.log('\n按userId汇总，7703下所有用户的总金币:', totalByUserId);
  console.log('按userId汇总，7703下所有用户的总记录数:', totalCountByUserId);

  await mongoose.disconnect();
}

test().catch(console.error);