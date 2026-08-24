const mongoose = require('mongoose');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017/test?authSource=admin&replicaSet=lzjzb-sjk-mongodb';

(async () => {
  await mongoose.connect(MONGODB_URI);
  const Admin = require('./models/Admin');
  const Employee = require('./models/Employee');
  const TeamGroup = require('./models/TeamGroup');
  const GoldLog = require('./models/GoldLog');
  const dashboard = require('./routes/dashboard');

  console.log('=== 深入分析计算逻辑 ===\n');

  // 查看 huangzhenhui 的提成率
  const admin = await Admin.findOne({ username: 'huangzhenhui' }).lean();
  console.log('Admin.commission:', admin.commission);
  
  // 获取实时算档率
  const verification = require('./routes/verification');
  const perf = await verification.getTeamLeaderPerformance(String(admin._id), { allowLazy: false });
  console.log('实时算档 currentCommission:', perf?.data?.level?.currentCommission);
  console.log('实时算档 currentLevel:', perf?.data?.level?.currentLevel);
  console.log('实时算档 totalRevenue:', perf?.data?.summary?.totalRevenue);
  
  // 检查 _dRateExpr 的修改是否生效
  console.log('\n=== 检查 _dRateExpr 是否正确 ===');
  console.log('_dRateExpr:', typeof dashboard._dRateExpr);
  
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
  
  console.log(`直推员工数: ${directDIds.length}`);
  
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

  // 手动计算：使用 _dRateExpr
  console.log('\n=== 手动使用 _dRateExpr 计算 ===');
  const dRateExpr = dashboard._dRateExpr;
  console.log('dRateExpr 参数 (tlFallback=0.14):', JSON.stringify(dRateExpr(0.14)));
  
  // 使用修改后的 _dRateExpr 进行聚合计算
  const aggResult = await GoldLog.aggregate([
    { $match: { employeeId: { $in: directDIds }, createTime: { $gte: lastMonthStart, $lt: lastMonthEnd } } },
    { $group: {
      _id: null,
      count: { $sum: 1 },
      totalGold: { $sum: '$gold' },
      totalCommissionGold: { $sum: { $cond: [{ $lte: ['$gold', 10000] }, { $multiply: ['$gold', dRateExpr(0.14)] }, 0] } }
    } }
  ]);
  
  console.log('\n使用 _dRateExpr(0.14) 的计算结果:');
  console.log('  count:', aggResult?.[0]?.count);
  console.log('  totalGold:', aggResult?.[0]?.totalGold?.toFixed(2));
  console.log('  totalCommissionGold:', aggResult?.[0]?.totalCommissionGold?.toFixed(2));
  console.log('  直推提成金额:', ((aggResult?.[0]?.totalCommissionGold || 0) / 1000).toFixed(2), '元');
  
  // 对比：如果所有记录都用 14% 计算
  const simpleCalc = await GoldLog.aggregate([
    { $match: { employeeId: { $in: directDIds }, createTime: { $gte: lastMonthStart, $lt: lastMonthEnd }, gold: { $lte: 10000 } } },
    { $group: { _id: null, totalGold: { $sum: '$gold' } } }
  ]);
  const simpleCommission = (simpleCalc?.[0]?.totalGold || 0) * 0.14 / 1000;
  console.log('\n如果所有记录都用 14% 计算:');
  console.log('  直推提成金额:', simpleCommission.toFixed(2), '元');

  await mongoose.disconnect();
})();
