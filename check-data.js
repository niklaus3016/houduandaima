const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017').then(async () => {
  console.log('MongoDB连接成功\n');

  // 当前时间
  const now = new Date();
  console.log('当前UTC时间:', now.toISOString());

  // 北京时间04-20 00:10 对应 UTC 04-19 16:10
  const apr20Beijing = new Date(Date.UTC(2026, 3, 20, 0, 0, 0));
  console.log('北京时间4月20日0点 = UTC:', apr20Beijing.toISOString());

  // 数据库最新记录
  const latest = await GoldLog.findOne({}).sort({ createTime: -1 });
  console.log('\n数据库最新记录:', latest.createTime.toISOString());

  // 用北京时间4月20日0点作为起始点查询
  const todayLogs = await GoldLog.find({ createTime: { $gte: apr20Beijing } });
  console.log('从北京时间4月20日0点开始的记录数:', todayLogs.length);

  // 用北京时间4月19日12点（即UTC 4月19日4点）查
  const apr19Noon = new Date(Date.UTC(2026, 3, 19, 4, 0, 0));
  console.log('\n北京时间4月19日12点 = UTC:', apr19Noon.toISOString());

  const apr19NoonLogs = await GoldLog.find({ createTime: { $gte: apr19Noon } });
  console.log('从北京时间4月19日12点开始的记录数:', apr19NoonLogs.length);

  // 按小时统计
  const hourStats = {};
  apr19NoonLogs.forEach(log => {
    const hour = log.createTime.getUTCHours();
    if (!hourStats[hour]) hourStats[hour] = 0;
    hourStats[hour]++;
  });
  console.log('\n按UTC小时统计记录数:');
  for (const [hour, count] of Object.entries(hourStats).sort((a,b) => a[0]-b[0])) {
    console.log(`  UTC ${hour}点 (北京时间 ${parseInt(hour)+8}点): ${count}条`);
  }

  mongoose.connection.close();
}).catch(err => console.error(err));