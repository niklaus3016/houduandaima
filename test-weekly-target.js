const mongoose = require('mongoose');
const WeeklyTarget = require('./models/WeeklyTarget');

// 连接数据库
mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');
    
    // 获取当前周
    function getBeijingDate() {
      const now = new Date();
      return new Date(now.getTime() + 8 * 60 * 60 * 1000);
    }

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
    
    const currentWeek = getCurrentWeek();
    console.log('当前周:', currentWeek);
    
    // 查询weeklyTarget
    const weeklyTarget = await WeeklyTarget.findOne({ week: currentWeek });
    console.log('weeklyTarget:', weeklyTarget);
    
    if (!weeklyTarget) {
      console.log('weeklyTarget不存在，创建新的');
      const newTarget = new WeeklyTarget({
        week: currentWeek,
        targetCount: 3500,
        bonusGold: 28888
      });
      await newTarget.save();
      console.log('创建成功:', newTarget);
    } else {
      console.log('targetCount:', weeklyTarget.targetCount);
      console.log('bonusGold:', weeklyTarget.bonusGold);
    }
    
    // 关闭连接
    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });