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

  const now = new Date();
  const beijing = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const y = beijing.getUTCFullYear();
  const m = beijing.getUTCMonth() + 1;
  const d = beijing.getUTCDate();
  const start = getBeijingStartOfDay(y, m, d);
  const end = getBeijingEndOfDay(y, m, d);

  // CSJ = platform: csj 或者 slotId 以 10 开头(8-12位)
  const csjRecords = await GoldLog.aggregate([
    { $match: { 
        createTime: { $gte: start, $lt: end },
        $or: [
          { platform: 'csj' },
          { slotId: { $regex: /^10\d{6,10}$/ } }
        ]
    }},
    { $group: {
      _id: null,
      totalGold: { $sum: { $ifNull: ['$gold', 0] } },
      totalEcpm: { $sum: { $ifNull: ['$ecpm', 0] } },
      count: { $sum: 1 },
      employeeCount: { $addToSet: '$employeeId' }
    }}
  ]).allowDiskUse(true).exec();

  // 非CSJ (baidu等)
  const nonCsjRecords = await GoldLog.aggregate([
    { $match: { 
        createTime: { $gte: start, $lt: end },
        $and: [
          { platform: { $ne: 'csj' } },
          { slotId: { $not: { $regex: /^10\d{6,10}$/ } } }
        ]
    }},
    { $group: {
      _id: null,
      totalGold: { $sum: { $ifNull: ['$gold', 0] } },
      totalEcpm: { $sum: { $ifNull: ['$ecpm', 0] } },
      count: { $sum: 1 },
      employeeCount: { $addToSet: '$employeeId' }
    }}
  ]).allowDiskUse(true).exec();

  // 总计
  const totalRecords = await GoldLog.aggregate([
    { $match: { createTime: { $gte: start, $lt: end } } },
    { $group: {
      _id: null,
      totalGold: { $sum: { $ifNull: ['$gold', 0] } },
      totalEcpm: { $sum: { $ifNull: ['$ecpm', 0] } },
      count: { $sum: 1 }
    }}
  ]).allowDiskUse(true).exec();

  const csj = csjRecords[0] || { totalGold: 0, totalEcpm: 0, count: 0, employeeCount: [] };
  const nonCsj = nonCsjRecords[0] || { totalGold: 0, totalEcpm: 0, count: 0, employeeCount: [] };
  const total = totalRecords[0] || { totalGold: 0, totalEcpm: 0, count: 0 };

  console.log('========== 今日(' + y + '-' + String(m).padStart(2,'0') + '-' + String(d).padStart(2,'0') + ') 金币发放统计 ==========');
  console.log('');
  console.log('【穿山甲 CSJ】');
  console.log('  发放金币:  ' + Math.round(csj.totalGold).toLocaleString() + ' 金币');
  console.log('  折合金额:  ' + (csj.totalGold / 1000).toFixed(2) + ' 元');
  console.log('  总ECPM:    ' + Math.round(csj.totalEcpm).toLocaleString());
  console.log('  记录条数:  ' + csj.count.toLocaleString());
  console.log('  员工数:    ' + csj.employeeCount.length + ' 人');
  console.log('');
  console.log('【百度等其他】');
  console.log('  发放金币:  ' + Math.round(nonCsj.totalGold).toLocaleString() + ' 金币');
  console.log('  折合金额:  ' + (nonCsj.totalGold / 1000).toFixed(2) + ' 元');
  console.log('  总ECPM:    ' + Math.round(nonCsj.totalEcpm).toLocaleString());
  console.log('  记录条数:  ' + nonCsj.count.toLocaleString());
  console.log('  员工数:    ' + nonCsj.employeeCount.length + ' 人');
  console.log('');
  console.log('【总计】');
  console.log('  发放金币:  ' + Math.round(total.totalGold).toLocaleString() + ' 金币');
  console.log('  折合金额:  ' + (total.totalGold / 1000).toFixed(2) + ' 元');
  console.log('  总ECPM:    ' + Math.round(total.totalEcpm).toLocaleString());
  console.log('  记录条数:  ' + total.count.toLocaleString());

  await mongoose.disconnect();
}
main().catch(e => console.error(e));
