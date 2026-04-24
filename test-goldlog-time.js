const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

// 连接数据库
mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');
    
    const employeeId = '2222';
    
    // 获取当前周（YYYY-WW 格式，北京时间，周一为一周开始）
    function getCurrentWeek() {
      const now = getBeijingDate();
      const year = now.getFullYear();
      const firstDayOfYear = new Date(year, 0, 1);
      const dayOfWeek = firstDayOfYear.getUTCDay() || 7;
      const daysToFirstMonday = (8 - dayOfWeek) % 7;
      const firstMonday = new Date(firstDayOfYear);
      firstMonday.setDate(firstMonday.getDate() + daysToFirstMonday);
      
      const diffTime = now - firstMonday;
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
    
    // 获取北京时间
    function getBeijingDate() {
      const now = new Date();
      return new Date(now.getTime() + 8 * 60 * 60 * 1000);
    }
    
    const currentWeek = getCurrentWeek();
    const weekRange = getWeekRange(currentWeek);
    
    console.log('=== 周计算信息 ===');
    console.log('当前周:', currentWeek);
    console.log('本周开始(UTC):', weekRange.start.toISOString());
    console.log('本周结束(UTC):', weekRange.end.toISOString());
    console.log('本周开始(北京时间):', new Date(weekRange.start.getTime() + 8 * 60 * 60 * 1000).toISOString());
    console.log('本周结束(北京时间):', new Date(weekRange.end.getTime() + 8 * 60 * 60 * 1000).toISOString());
    
    // 检查GoldLog中的记录时间
    console.log('\n=== GoldLog记录时间检查 ===');
    
    // 最近10条记录
    const recentLogs = await GoldLog.find({
      employeeId: employeeId
    }).sort({ createTime: -1 }).limit(10);
    
    console.log('最近10条记录:');
    recentLogs.forEach((log, index) => {
      const createTime = log.createTime;
      const isInWeek = createTime >= weekRange.start && createTime < weekRange.end;
      console.log(`${index + 1}. 时间(UTC): ${createTime.toISOString()}`);
      console.log(`   时间(北京时间): ${new Date(createTime.getTime() + 8 * 60 * 60 * 1000).toISOString()}`);
      console.log(`   在本周内: ${isInWeek}`);
      console.log(`   员工ID: ${log.employeeId}`);
      console.log(`   用户ID: ${log.userId}`);
      console.log('---');
    });
    
    // 统计本周内的记录数
    const count = await GoldLog.countDocuments({
      employeeId: employeeId,
      createTime: {
        $gte: weekRange.start,
        $lt: weekRange.end
      }
    });
    
    console.log(`\n本周内记录数: ${count}`);
    
    // 关闭连接
    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });