const mongoose = require('mongoose');
const WeeklyBonusClaim = require('./models/WeeklyBonusClaim');

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

    // 查询用户2222的领取记录
    const claims = await WeeklyBonusClaim.find({
      employeeId: '2222'
    }).sort({ createdAt: -1 }).limit(10);

    console.log('\n=== 用户2222的所有领取记录 ===');
    console.log('记录数:', claims.length);
    claims.forEach((claim, index) => {
      console.log(`${index + 1}. 周: ${claim.week}, userId: ${claim.userId}, employeeId: ${claim.employeeId}, 时间: ${claim.createdAt}`);
    });

    // 查询本周的领取记录
    const thisWeekClaims = await WeeklyBonusClaim.find({
      employeeId: '2222',
      week: currentWeek
    });

    console.log('\n=== 本周领取记录 ===');
    console.log('记录数:', thisWeekClaims.length);
    if (thisWeekClaims.length > 0) {
      console.log('已领取!');
      thisWeekClaims.forEach((claim, index) => {
        console.log(`${index + 1}. 周: ${claim.week}, 时间: ${claim.createdAt}`);
      });
    } else {
      console.log('未领取');
    }

    // 关闭连接
    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });