const mongoose = require('mongoose');

async function main() {
  await mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017/test?authSource=admin&replicaSet=lzjzb-sjk-mongodb');
  const db = mongoose.connection.db;
  const userGold = db.collection('usergold');
  const employees = db.collection('employees');

  // 先看看 lastMonthGold 的数据分布（看看单位是什么）
  console.log('===== lastMonthGold 数据分布 =====');
  const stats = await userGold.aggregate([
    { $group: {
      _id: null,
      total: { $sum: '$lastMonthGold' },
      max: { $max: '$lastMonthGold' },
      avg: { $avg: '$lastMonthGold' },
      gt0: { $sum: { $cond: [{ $gt: ['$lastMonthGold', 0] }, 1, 0] } }
    }}
  ]).toArray();
  console.log(JSON.stringify(stats, null, 2));

  // 同时看看排名前20的 lastMonthGold
  console.log('\n===== lastMonthGold 前20 =====');
  const top20 = await userGold.find({}, { employeeId: 1, lastMonthGold: 1 })
    .sort({ lastMonthGold: -1 }).limit(20).toArray();
  for (const u of top20) {
    console.log(`employeeId=${u.employeeId}  lastMonthGold=${u.lastMonthGold}  收益(按金币/1000)=${(u.lastMonthGold / 1000).toFixed(2)}元`);
  }

  // 查询上月收益 > 1000元（即 lastMonthGold > 1,000,000）
  const threshold = 1000000;
  console.log(`\n===== 上月收益 > 1000元（lastMonthGold > ${threshold}） =====`);
  const count = await userGold.countDocuments({ lastMonthGold: { $gt: threshold } });
  console.log(`用户数: ${count}`);

  if (count > 0) {
    const result = await userGold.aggregate([
      { $match: { lastMonthGold: { $gt: threshold } } },
      {
        $lookup: {
          from: 'employees',
          localField: 'employeeId',
          foreignField: 'employeeId',
          as: 'empInfo'
        }
      },
      { $unwind: { path: '$empInfo', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          employeeId: 1,
          realName: { $ifNull: ['$empInfo.realName', '$empInfo.name', '未知'] },
          lastMonthGold: 1,
          yuan: { $divide: ['$lastMonthGold', 1000] },
          role: { $ifNull: ['$empInfo.role', 'EMPLOYEE'] },
          teamGroupId: { $ifNull: ['$empInfo.teamGroupId', ''] }
        }
      },
      { $sort: { lastMonthGold: -1 } }
    ]).toArray();

    console.log(`\n员工号 | 姓名 | 上月金币 | 上月收益(元) | 职级 | 所在组`);
    console.log('------|------|---------|-------------|------|------');
    for (const u of result) {
      console.log(`${u.employeeId} | ${u.realName} | ${u.lastMonthGold.toLocaleString()} | ${u.yuan.toFixed(2)} | ${u.role} | ${u.teamGroupId || '-'}`);
    }
  } else {
    // 如果没有 >1000元的，也看看 >500元 的
    const threshold2 = 500000;
    const count2 = await userGold.countDocuments({ lastMonthGold: { $gt: threshold2 } });
    console.log(`\n===== 上月收益 > 500元（lastMonthGold > ${threshold2}） =====`);
    console.log(`用户数: ${count2}`);
    if (count2 > 0) {
      const result2 = await userGold.aggregate([
        { $match: { lastMonthGold: { $gt: threshold2 } } },
        {
          $lookup: { from: 'employees', localField: 'employeeId', foreignField: 'employeeId', as: 'empInfo' }
        },
        { $unwind: { path: '$empInfo', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            employeeId: 1,
            realName: { $ifNull: ['$empInfo.realName', '$empInfo.name', '未知'] },
            lastMonthGold: 1,
            yuan: { $divide: ['$lastMonthGold', 1000] },
            role: { $ifNull: ['$empInfo.role', 'EMPLOYEE'] },
            teamGroupId: { $ifNull: ['$empInfo.teamGroupId', ''] }
          }
        },
        { $sort: { lastMonthGold: -1 } }
      ]).toArray();

      console.log(`\n员工号 | 姓名 | 上月金币 | 上月收益(元) | 职级 | 所在组`);
      console.log('------|------|---------|-------------|------|------');
      for (const u of result2) {
        console.log(`${u.employeeId} | ${u.realName} | ${u.lastMonthGold.toLocaleString()} | ${u.yuan.toFixed(2)} | ${u.role} | ${u.teamGroupId || '-'}`);
      }
    }
  }

  await mongoose.disconnect();
}
main().catch(e => console.error(e));
