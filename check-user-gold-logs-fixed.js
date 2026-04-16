const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

// 获取北京时间
function getBeijingDate() {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}

// 获取当前周（YYYY-WW 格式，北京时间）
function getCurrentWeek() {
  const now = getBeijingDate();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now - startOfYear) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return `${now.getFullYear()}-${weekNumber.toString().padStart(2, '0')}`;
}

// 获取周开始和结束时间（北京时间）
function getWeekRange(week) {
  const [year, weekNumber] = week.split('-').map(Number);
  const startOfYear = new Date(year, 0, 1);
  const days = (weekNumber - 1) * 7 - startOfYear.getDay() + 1;
  const weekStart = new Date(startOfYear);
  weekStart.setDate(weekStart.getDate() + days);
  weekStart.setHours(0, 0, 0, 0);
  
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  weekEnd.setHours(0, 0, 0, 0);
  
  // 转换为UTC时间
  return {
    start: new Date(weekStart.getTime() - 8 * 60 * 60 * 1000),
    end: new Date(weekEnd.getTime() - 8 * 60 * 60 * 1000)
  };
}

async function checkUserGoldLogs() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('数据库连接成功\n');
    
    const currentWeek = getCurrentWeek();
    const weekRange = getWeekRange(currentWeek);
    
    console.log('========================================');
    console.log('查询用户1111的广告记录');
    console.log('========================================');
    console.log(`当前周: ${currentWeek}`);
    console.log(`周开始时间: ${weekRange.start.toISOString()}`);
    console.log(`周结束时间: ${weekRange.end.toISOString()}`);
    console.log(`北京时间: ${getBeijingDate().toISOString()}`);
    console.log('========================================\n');
    
    // 查询用户1111的用户ID
    const UserGold = mongoose.connection.db.collection('usergolds');
    const userGold = await UserGold.findOne({ employeeId: '1111' });
    
    if (!userGold) {
      console.log('未找到用户1111的记录');
      return;
    }
    
    console.log('用户信息:');
    console.log(`  userId: ${userGold.userId}`);
    console.log(`  employeeId: ${userGold.employeeId}`);
    console.log(`  本月金币: ${userGold.currentMonthGold}`);
    console.log(`  上月金币: ${userGold.lastMonthGold}`);
    console.log('');
    
    // 查询本周的广告记录（使用createTime字段）
    const GoldLog = mongoose.connection.db.collection('goldlogs');
    const weeklyLogs = await GoldLog.find({
      userId: userGold.userId,
      createTime: {
        $gte: weekRange.start,
        $lt: weekRange.end
      }
    }).toArray();
    
    console.log(`本周广告记录数: ${weeklyLogs.length}`);
    
    if (weeklyLogs.length > 0) {
      console.log('\n本周广告记录详情:');
      weeklyLogs.forEach((log, index) => {
        console.log(`  ${index + 1}. 时间: ${log.createTime.toISOString()}, 金币: ${log.gold}, ECPM: ${log.ecpm}`);
      });
    }
    
    // 查询今天的广告记录
    const today = getBeijingDate();
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);
    const todayStartUTC = new Date(todayStart.getTime() - 8 * 60 * 60 * 1000);
    const todayEndUTC = new Date(todayStartUTC.getTime() + 24 * 60 * 60 * 1000);
    
    const todayLogs = await GoldLog.find({
      userId: userGold.userId,
      createTime: {
        $gte: todayStartUTC,
        $lt: todayEndUTC
      }
    }).toArray();
    
    console.log(`\n今天广告记录数: ${todayLogs.length}`);
    
    if (todayLogs.length > 0) {
      console.log('\n今天广告记录详情:');
      todayLogs.forEach((log, index) => {
        console.log(`  ${index + 1}. 时间: ${log.createTime.toISOString()}, 金币: ${log.gold}, ECPM: ${log.ecpm}`);
      });
    }
    
    // 查询最近10条广告记录
    const recentLogs = await GoldLog.find({
      userId: userGold.userId
    }).sort({ createTime: -1 }).limit(10).toArray();
    
    console.log(`\n最近10条广告记录:`);
    if (recentLogs.length === 0) {
      console.log('  没有找到广告记录');
    } else {
      recentLogs.forEach((log, index) => {
        console.log(`  ${index + 1}. 时间: ${log.createTime.toISOString()}, 金币: ${log.gold}, ECPM: ${log.ecpm}`);
      });
    }
    
  } catch (error) {
    console.error('查询失败:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n数据库连接已关闭');
  }
}

checkUserGoldLogs();
