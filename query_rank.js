const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

function getBeijingStartOfDay(year, month, day) {
  const beijingTime = new Date(Date.UTC(year, month - 1, day, 0, 0, 0) + 8 * 60 * 60 * 1000);
  const start = new Date(beijingTime);
  start.setHours(0, 0, 0, 0);
  return new Date(start.getTime() - 8 * 60 * 60 * 1000);
}

function getBeijingEndOfDay(year, month, day) {
  const beijingTime = new Date(Date.UTC(year, month - 1, day, 0, 0, 0) + 8 * 60 * 60 * 1000);
  const end = new Date(beijingTime);
  end.setHours(23, 59, 59, 999);
  return new Date(end.getTime() - 8 * 60 * 60 * 1000);
}

async function main() {
  const conn = await mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017/test?authSource=admin&replicaSet=lzjzb-sjk-mongodb&readPreference=secondaryPreferred');

  const dates = [];
  for (let d = 27; d <= 31; d++) dates.push({ y: 2026, m: 7, d });
  for (let d = 1; d <= 2; d++) dates.push({ y: 2026, m: 8, d });

  for (const { y, m, d } of dates) {
    const start = getBeijingStartOfDay(y, m, d);
    const end = getBeijingEndOfDay(y, m, d);

    const aggregation = await GoldLog.aggregate([
      { $match: { createTime: { $gte: start, $lt: end } } },
      { $group: {
        _id: '$employeeId',
        totalGold: { $sum: { $ifNull: ['$gold', 0] } },
        count: { $sum: 1 }
      }},
      { $sort: { totalGold: -1 } },
      { $limit: 10 }
    ]).allowDiskUse(true).exec();

    console.log('\n========== ' + y + '-' + String(m).padStart(2,'0') + '-' + String(d).padStart(2,'0') + ' ==========');
    aggregation.forEach((r, i) => {
      const eid = r._id || '(未知)';
      const yuan = (r.totalGold / 1000).toFixed(2);
      console.log((i+1) + '. 员工' + eid + ' | 金币:' + Math.round(r.totalGold).toLocaleString() + ' | 金额:' + yuan + '元 | 条数:' + r.count);
    });
  }

  await mongoose.disconnect();
}
main().catch(e => console.error(e));
