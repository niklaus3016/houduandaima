const mongoose = require('mongoose');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017/test?authSource=admin&replicaSet=lzjzb-sjk-mongodb';

(async () => {
  await mongoose.connect(MONGODB_URI);
  const Admin = require('./models/Admin');
  const Employee = require('./models/Employee');
  const TeamGroup = require('./models/TeamGroup');
  const GoldLog = require('./models/GoldLog');
  const dashboard = require('./routes/dashboard');

  console.log('=== 对比：不同提成率计算的结果 ===\n');

  // 查询 huangzhenhui 的员工数据
  const admin = await Admin.findOne({ username: 'huangzhenhui' }).lean();
  console.log('Admin.commission 字段:', admin.commission);

  // 获取直推员工（与 _getTLDirectDIds 逻辑一致）
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

  // 查询直推员工的金币记录
  const goldAgg = await GoldLog.aggregate([
    { $match: { employeeId: { $in: directDIds }, createTime: { $gte: lastMonthStart, $lt: lastMonthEnd } } },
    { $group: { _id: null, totalGold: { $sum: '$gold' }, count: { $sum: 1 } } }
  ]);
  
  const totalGold = goldAgg?.[0]?.totalGold || 0;
  const totalRevenue = totalGold / 1000;
  console.log(`上月直推总金币: ${totalGold.toFixed(2)}`);
  console.log(`上月直推总收益: ${totalRevenue.toFixed(2)} 元`);

  // 测试不同提成率
  console.log('\n=== 不同提成率的计算结果 ===');
  const rates = [
    { rate: 0.05, name: '5%' },
    { rate: 0.08, name: '8%' },
    { rate: 0.10, name: '10%' },
    { rate: 0.14, name: '14%' },
  ];
  
  for (const r of rates) {
    const commission = totalRevenue * r.rate;
    console.log(`${r.name}: ${commission.toFixed(2)} 元`);
  }

  // 用 computeNewKpi 调用
  console.log('\n=== 调用 computeNewKpi ===');
  const scope = { kind: 'TL', adminId: String(admin._id) };
  const kpi = await dashboard.computeNewKpi(scope, 'lastMonth');
  console.log('computeNewKpi 结果:', kpi.teamCommission, '元');
  
  // 获取实时算档率
  console.log('\n=== 获取实时算档率 ===');
  const verification = require('./routes/verification');
  try {
    const perf = await verification.getTeamLeaderPerformance(String(admin._id), { allowLazy: false });
    console.log('实时算档结果:', JSON.stringify(perf?.data?.level, null, 2));
    console.log('业绩 totalRevenue:', perf?.data?.summary?.totalRevenue || perf?.data?.currentMonth?.revenue || 0);
  } catch (e) {
    console.log('获取失败:', e.message);
  }

  // 计算 admin002 和 admin003
  console.log('\n=== 高管计算 ===');
  for (const username of ['admin002', 'admin003']) {
    const adm = await Admin.findOne({ username }).lean();
    const scopeTeamIds = adm?.managedTeamIds || [];
    const kpiResult = await dashboard.computeSuperKpi('lastMonth', scopeTeamIds);
    console.log(`${username}: dividendTotal=${kpiResult.dividendTotal}, lastMonth=${kpiResult.lastMonth?.teamCommission}`);
  }

  await mongoose.disconnect();
})();
