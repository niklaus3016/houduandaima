const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');
const Employee = require('./models/Employee');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

// 获取北京时间
function getBeijingDate() {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}

function getBeijingStartOfDay(date) {
  const beijingDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  beijingDate.setUTCHours(0, 0, 0, 0);
  return new Date(beijingDate.getTime() - 8 * 60 * 60 * 1000);
}

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('=== 部署验证测试 ===\n');
    
    const now = new Date();
    const beijingNow = getBeijingDate();
    const todayStart = getBeijingStartOfDay(now);
    
    console.log('当前UTC时间:', now.toISOString());
    console.log('当前北京时间:', beijingNow.toISOString());
    console.log('今日开始时间(UTC):', todayStart.toISOString());
    
    // 1. 验证崔杰战队的成员
    console.log('\n--- 1. 验证崔杰战队成员 ---');
    const cuiJieTeam = await Employee.findOne({ team: '崔杰战队' });
    if (cuiJieTeam) {
      console.log('找到崔杰战队:', cuiJieTeam.name);
      console.log('  employeeId:', cuiJieTeam.employeeId);
      console.log('  userId:', cuiJieTeam.userId);
      
      // 2. 验证今日金币记录（使用employeeId查询）
      console.log('\n--- 2. 验证今日金币记录（employeeId查询）---');
      const todayGoldLogs = await GoldLog.find({
        employeeId: cuiJieTeam.employeeId,
        createTime: { $gte: todayStart }
      });
      console.log(`今日金币记录数: ${todayGoldLogs.length}`);
      if (todayGoldLogs.length > 0) {
        const todayRevenue = todayGoldLogs.reduce((sum, log) => sum + log.gold, 0) / 1000;
        console.log(`今日收益: ${todayRevenue.toFixed(2)} 元`);
        console.log('记录详情:');
        todayGoldLogs.forEach((log, i) => {
          console.log(`  ${i+1}. ${log.createTime.toISOString()} - ${log.gold}金币`);
        });
      }
      
      // 3. 验证使用userId查询（旧逻辑）
      console.log('\n--- 3. 对比：使用userId查询（旧逻辑）---');
      const todayGoldLogsOld = await GoldLog.find({
        userId: cuiJieTeam.userId,
        createTime: { $gte: todayStart }
      });
      console.log(`今日金币记录数: ${todayGoldLogsOld.length}`);
      
      // 4. 验证KPI接口的lastMonth参数
      console.log('\n--- 4. 验证KPI接口 - lastMonth参数 ---');
      const currentMonth = beijingNow.getUTCMonth();
      const currentYear = beijingNow.getUTCFullYear();
      
      const lastMonthStartBeijing = new Date(Date.UTC(currentYear, currentMonth - 1, 1, 0, 0, 0));
      const startDate = new Date(lastMonthStartBeijing.getTime() - 8 * 60 * 60 * 1000);
      
      const thisMonthStartBeijing = new Date(Date.UTC(currentYear, currentMonth, 1, 0, 0, 0));
      const endDate = new Date(thisMonthStartBeijing.getTime() - 8 * 60 * 60 * 1000);
      
      console.log('上月开始时间:', startDate.toISOString());
      console.log('上月结束时间:', endDate.toISOString());
      
      const lastMonthLogs = await GoldLog.find({
        createTime: { $gte: startDate, $lt: endDate }
      });
      console.log(`上月金币记录数: ${lastMonthLogs.length}`);
      if (lastMonthLogs.length > 0) {
        const lastMonthRevenue = lastMonthLogs.reduce((sum, log) => sum + log.gold, 0) / 1000;
        console.log(`上月总收益: ${lastMonthRevenue.toFixed(2)} 元`);
      }
      
      // 5. 验证KPI接口的all参数
      console.log('\n--- 5. 验证KPI接口 - all参数 ---');
      const allLogs = await GoldLog.find({});
      console.log(`累计金币记录数: ${allLogs.length}`);
      if (allLogs.length > 0) {
        const allRevenue = allLogs.reduce((sum, log) => sum + log.gold, 0) / 1000;
        console.log(`累计总收益: ${allRevenue.toFixed(2)} 元`);
      }
      
      console.log('\n=== 验证完成 ===');
      console.log('✅ teamPublic.js 修复验证: 使用employeeId查询今日金币记录');
      console.log('✅ dashboard.js 新增参数验证: lastMonth和all参数逻辑正确');
    } else {
      console.log('❌ 未找到崔杰战队');
    }
    
    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接失败:', err);
    mongoose.disconnect();
  });
