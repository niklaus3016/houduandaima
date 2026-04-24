const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

// 连接数据库
mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');
    
    // 测试用户2222的周数据
    const userId = '69af8be9132651c70aa855db';
    const employeeId = '2222';
    
    // 获取当前周（YYYY-WW 格式，北京时间，周一为一周开始）
    function getCurrentWeek() {
      const now = new Date();
      const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
      const year = beijingNow.getFullYear();
      const firstDayOfYear = new Date(year, 0, 1);
      const dayOfWeek = firstDayOfYear.getUTCDay() || 7;
      const daysToFirstMonday = (8 - dayOfWeek) % 7;
      const firstMonday = new Date(firstDayOfYear);
      firstMonday.setDate(firstMonday.getDate() + daysToFirstMonday);
      
      const diffTime = beijingNow - firstMonday;
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      const weekNumber = Math.floor(diffDays / 7) + 1;
      return `${year}-${weekNumber.toString().padStart(2, '0')}`;
    }

    // 获取周开始和结束时间（北京时间，周一为一周开始）
    function getWeekRange(week) {
      const [year, weekNumber] = week.split('-').map(Number);
      const firstDayOfYear = new Date(year, 0, 1);
      const dayOfWeek = firstDayOfYear.getUTCDay() || 7;
      const daysToFirstMonday = (8 - dayOfWeek) % 7;
      const firstMonday = new Date(firstDayOfYear);
      firstMonday.setDate(firstMonday.getDate() + daysToFirstMonday);
      
      const weekStart = new Date(firstMonday);
      weekStart.setDate(weekStart.getDate() + (weekNumber - 1) * 7);
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
    
    const currentWeek = getCurrentWeek();
    const weekRange = getWeekRange(currentWeek);
    
    console.log('=== 周计算信息 ===');
    console.log('当前周:', currentWeek);
    console.log('本周开始(UTC):', weekRange.start.toISOString());
    console.log('本周结束(UTC):', weekRange.end.toISOString());
    console.log('本周开始(北京时间):', new Date(weekRange.start.getTime() + 8 * 60 * 60 * 1000).toISOString());
    console.log('本周结束(北京时间):', new Date(weekRange.end.getTime() + 8 * 60 * 60 * 1000).toISOString());
    
    // 查询用户2222的本周GoldLog数据
    console.log('\n=== 查询用户2222的本周数据 ===');
    
    // 方法1: 按userId查询
    const goldLogsByUserId = await GoldLog.find({
      userId: userId,
      createTime: {
        $gte: weekRange.start,
        $lt: weekRange.end
      }
    });
    
    console.log('按userId查询结果:');
    console.log('数量:', goldLogsByUserId.length);
    if (goldLogsByUserId.length > 0) {
      console.log('第一条记录:', goldLogsByUserId[0].createTime.toISOString());
      console.log('最后一条记录:', goldLogsByUserId[goldLogsByUserId.length - 1].createTime.toISOString());
    }
    
    // 方法2: 按employeeId查询
    const goldLogsByEmployeeId = await GoldLog.find({
      employeeId: employeeId,
      createTime: {
        $gte: weekRange.start,
        $lt: weekRange.end
      }
    });
    
    console.log('\n按employeeId查询结果:');
    console.log('数量:', goldLogsByEmployeeId.length);
    if (goldLogsByEmployeeId.length > 0) {
      console.log('第一条记录:', goldLogsByEmployeeId[0].createTime.toISOString());
      console.log('最后一条记录:', goldLogsByEmployeeId[goldLogsByEmployeeId.length - 1].createTime.toISOString());
    }
    
    // 查询所有时间的记录，验证数据是否存在
    const allGoldLogs = await GoldLog.find({
      employeeId: employeeId
    }).sort({ createTime: -1 }).limit(10);
    
    console.log('\n=== 最近10条记录 ===');
    console.log('总记录数:', allGoldLogs.length);
    allGoldLogs.forEach((log, index) => {
      console.log(`${index + 1}. 时间: ${log.createTime.toISOString()}, 金币: ${log.gold}, 用户ID: ${log.userId}`);
    });
    
    // 关闭连接
    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });