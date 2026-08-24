const mongoose = require('mongoose');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017/test?authSource=admin&replicaSet=lzjzb-sjk-mongodb';

(async () => {
  await mongoose.connect(MONGODB_URI);
  const Admin = require('./models/Admin');
  const Employee = require('./models/Employee');
  const TeamGroup = require('./models/TeamGroup');
  const GoldLog = require('./models/GoldLog');
  const dashboard = require('./routes/dashboard');

  console.log('=== 检查 GoldLog 中的 tlCommissionRate 字段 ===\n');

  const admin = await Admin.findOne({ username: 'huangzhenhui' }).lean();
  
  // 获取直推员工
  const groups = await TeamGroup.find({ teamLeaderId: String(admin._id) }).select('_id groupLeaderId groupName').lean();
  const subGroupFuzzy = new Set();
  for (const g of groups) {
    subGroupFuzzy.add(String(g._id));
    if (g.groupLeaderId) subGroupFuzzy.add(String(g.groupLeaderId));
    if (g.groupName) subGroupFuzzy.add(String(g.groupName));
  }
  
  const allChildren = await Employee.find({ parentId: String(admin._id) }).select('employeeId teamGroupId groupName').lean();
  const directDIds = allChildren
    .filter(e => {
      const gid = e.teamGroupId ? String(e.teamGroupId) : '';
      const gn = e.groupName ? String(e.groupName) : '';
      const inSubGroup = (gid && subGroupFuzzy.has(gid)) || (gn && subGroupFuzzy.has(gn));
      return !inSubGroup;
    })
    .map(e => e.employeeId).filter(Boolean);
  
  // 计算上月时间范围
  const now = new Date();
  const bjNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const curYear = bjNow.getUTCFullYear();
  const curMonth = bjNow.getUTCMonth() + 1;
  
  let lastMonthStart, lastMonthEnd;
  if (curMonth === 1) {
    lastMonthStart = new Date(Date.UTC(curYear - 1, 10, 1));
    lastMonthEnd = new Date(Date.UTC(curYear - 1, 11, 1));
  } else {
    lastMonthStart = new Date(Date.UTC(curYear, curMonth - 2, 1));
    lastMonthEnd = new Date(Date.UTC(curYear, curMonth - 1, 1));
  }

  // 检查 GoldLog 中 tlCommissionRate 的分布
  console.log('检查 GoldLog.tlCommissionRate 分布...');
  const rateDist = await GoldLog.aggregate([
    { $match: { employeeId: { $in: directDIds }, createTime: { $gte: lastMonthStart, $lt: lastMonthEnd } } },
    { $group: { _id: '$tlCommissionRate', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 20 }
  ]);
  
  console.log(`GoldLog 中 tlCommissionRate 分布（共 ${rateDist.length} 种值）:`);
  for (const d of rateDist) {
    console.log(`  tlCommissionRate=${d._id}: ${d.count} 条`);
  }

  // 手动计算：如果所有记录都用 14% 提成率
  console.log('\n=== 手动计算（假设统一 14% 提成率）===');
  const goldAgg = await GoldLog.aggregate([
    { $match: { employeeId: { $in: directDIds }, createTime: { $gte: lastMonthStart, $lt: lastMonthEnd }, gold: { $lte: 10000 } } },
    { $group: { _id: null, totalGold: { $sum: '$gold' }, count: { $sum: 1 } } }
  ]);
  
  const totalGold = goldAgg?.[0]?.totalGold || 0;
  const totalRevenue = totalGold / 1000;
  console.log(`有效记录（gold <= 10000）: ${goldAgg?.[0]?.count || 0} 条`);
  console.log(`总金币: ${totalGold.toFixed(2)}`);
  console.log(`总收益: ${totalRevenue.toFixed(2)} 元`);
  console.log(`14% 提成: ${(totalRevenue * 0.14).toFixed(2)} 元`);
  console.log(`10% 提成: ${(totalRevenue * 0.10).toFixed(2)} 元`);
  console.log(`8% 提成: ${(totalRevenue * 0.08).toFixed(2)} 元`);

  // 对比 computeNewKpi
  console.log('\n=== computeNewKpi 结果 ===');
  const scope = { kind: 'TL', adminId: String(admin._id) };
  const kpi = await dashboard.computeNewKpi(scope, 'lastMonth');
  console.log('teamRevenue:', kpi.teamRevenue);
  console.log('teamCommission:', kpi.teamCommission);
  console.log('directCommission:', kpi.directCommission);
  console.log('indirectCommission:', kpi.indirectCommission);

  await mongoose.disconnect();
})();
