const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');
const DailyTarget = require('./models/DailyTarget');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

// 获取北京时间（UTC + 8小时）
function getBeijingDate() {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}

// 获取北京时间的当天开始（返回UTC时间）
function getBeijingStartOfDay(beijingTime) {
  const year = beijingTime.getUTCFullYear();
  const month = beijingTime.getUTCMonth();
  const day = beijingTime.getUTCDate();
  const utcMidnight = new Date(Date.UTC(year, month, day, 0, 0, 0));
  const beijingStartUTC = new Date(utcMidnight.getTime() - 8 * 60 * 60 * 1000);
  return beijingStartUTC;
}

async function check8202Today() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功');

    const userId = 'user_8202_1772466028893';
    const employeeId = '8202';

    // 获取今日日期（北京时间）
    const beijingNow = getBeijingDate();
    const today = beijingNow.toISOString().split('T')[0];
    const todayStart = getBeijingStartOfDay(beijingNow);
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    console.log('=== 时间信息 ===');
    console.log(`当前UTC时间: ${new Date().toISOString()}`);
    console.log(`当前北京时间: ${beijingNow.toISOString()}`);
    console.log(`今日: ${today}`);
    console.log(`今日开始(UTC): ${todayStart.toISOString()}`);
    console.log(`今日结束(UTC): ${todayEnd.toISOString()}`);

    // 查询今日目标任务
    const dailyTarget = await DailyTarget.findOne({ date: today });
    console.log('\n=== 今日目标任务 ===');
    if (dailyTarget) {
      console.log(`目标: ${dailyTarget.target}`);
      console.log(`奖励金币: ${dailyTarget.bonusGold}`);
    } else {
      console.log('❌ 未设置今日目标任务');
    }

    // 查询员工8202今天的所有记录（使用employeeId）
    const todayLogsByEmployee = await GoldLog.find({
      employeeId: employeeId,
      createTime: { $gte: todayStart, $lt: todayEnd }
    }).sort({ createTime: -1 });

    console.log('\n=== 今日所有记录（通过employeeId查询）===');
    console.log(`记录数: ${todayLogsByEmployee.length}`);
    
    let totalGold = 0;
    todayLogsByEmployee.forEach((log, index) => {
      const beijingTime = new Date(log.createTime.getTime() + 8 * 60 * 60 * 1000);
      console.log(`${index + 1}. UTC时间: ${log.createTime.toISOString()}, 北京时间: ${beijingTime.toISOString()}, 金币: ${log.gold}`);
      totalGold += log.gold;
    });

    console.log(`\n今日金币总和: ${totalGold}`);
    
    if (dailyTarget) {
      console.log(`目标: ${dailyTarget.target}`);
      console.log(`是否达标: ${totalGold >= dailyTarget.target ? '✅ 是' : '❌ 否'}`);
      console.log(`差额: ${totalGold - dailyTarget.target}`);
    }

    // 也查询一下通过userId
    const todayLogsByUserId = await GoldLog.find({
      userId: userId,
      createTime: { $gte: todayStart, $lt: todayEnd }
    }).sort({ createTime: -1 });

    console.log('\n=== 今日所有记录（通过userId查询）===');
    console.log(`记录数: ${todayLogsByUserId.length}`);
    todayLogsByUserId.forEach((log, index) => {
      const beijingTime = new Date(log.createTime.getTime() + 8 * 60 * 60 * 1000);
      console.log(`${index + 1}. UTC时间: ${log.createTime.toISOString()}, 北京时间: ${beijingTime.toISOString()}, 金币: ${log.gold}`);
    });

    await mongoose.disconnect();
    console.log('\n完成');
  } catch (error) {
    console.error('错误:', error);
    process.exit(1);
  }
}

check8202Today();
