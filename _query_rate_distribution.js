const mongoose = require('mongoose');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017/test?authSource=admin&replicaSet=lzjzb-sjk-mongodb';

(async () => {
  await mongoose.connect(MONGODB_URI);
  const Admin = require('./models/Admin');
  const Employee = require('./models/Employee');
  const TeamGroup = require('./models/TeamGroup');
  const GoldLog = require('./models/GoldLog');

  console.log('=== 查询 GoldLog 中提成率字段的实际分布 ===\n');

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
  
  // 获取间推（下属组长的 G 员工）
  const groupNames = groups.map(g => g.groupName);
  const subGLEmployees = await Employee.find({ 
    groupName: { $in: groupNames }
  }).select('employeeId').lean();
  const gEmployeeIds = subGLEmployees.map(e => e.employeeId).filter(Boolean);
  
  console.log(`直推员工数: ${directDIds.length}`);
  console.log(`间推 G 员工数: ${gEmployeeIds.length}`);
  
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
  
  console.log(`\n上月时间范围: ${lastMonthStart.toISOString()} ~ ${lastMonthEnd.toISOString()}`);

  // 1. 查询直推员工的 tlCommissionRate 分布
  console.log('\n=== 直推员工 tlCommissionRate 分布 ===');
  const tlRateDist = await GoldLog.aggregate([
    { $match: { employeeId: { $in: directDIds }, createTime: { $gte: lastMonthStart, $lt: lastMonthEnd } } },
    { $group: { 
      _id: { rate: '$tlCommissionRate' }, 
      count: { $sum: 1 },
      totalGold: { $sum: '$gold' }
    } },
    { $sort: { count: -1 } },
    { $limit: 20 }
  ]);
  
  console.log('tlCommissionRate | count | totalGold');
  console.log('-----------------|-------|-----------');
  for (const item of tlRateDist) {
    const rate = item._id.rate;
    console.log(`${rate?.toFixed(4) || 'null/null      '} | ${item.count} | ${item.totalGold?.toFixed(2)}`);
  }
  
  // 统计有多少条记录的 tlCommissionRate > 0.015
  const validTlCount = await GoldLog.countDocuments({ 
    employeeId: { $in: directDIds }, 
    createTime: { $gte: lastMonthStart, $lt: lastMonthEnd },
    tlCommissionRate: { $gt: 0.015, $lte: 0.30 }
  });
  const totalTlCount = await GoldLog.countDocuments({ 
    employeeId: { $in: directDIds }, 
    createTime: { $gte: lastMonthStart, $lt: lastMonthEnd }
  });
  console.log(`\n有效 tlCommissionRate 记录数: ${validTlCount} / ${totalTlCount}`);
  
  // 2. 查询间推 G 员工的 commissionRate 分布
  console.log('\n=== 间推 G 员工 commissionRate 分布 ===');
  const glRateDist = await GoldLog.aggregate([
    { $match: { employeeId: { $in: gEmployeeIds }, createTime: { $gte: lastMonthStart, $lt: lastMonthEnd } } },
    { $group: { 
      _id: { rate: '$commissionRate' }, 
      count: { $sum: 1 },
      totalGold: { $sum: '$gold' }
    } },
    { $sort: { count: -1 } },
    { $limit: 20 }
  ]);
  
  console.log('commissionRate | count | totalGold');
  console.log('---------------|-------|-----------');
  for (const item of glRateDist) {
    const rate = item._id.rate;
    console.log(`${rate?.toFixed(4) || 'null/null        '} | ${item.count} | ${item.totalGold?.toFixed(2)}`);
  }
  
  // 3. 查询间推 G 员工的 tlCommissionRate 分布（级差计算用）
  console.log('\n=== 间推 G 员工 tlCommissionRate 分布 ===');
  const glTlRateDist = await GoldLog.aggregate([
    { $match: { employeeId: { $in: gEmployeeIds }, createTime: { $gte: lastMonthStart, $lt: lastMonthEnd } } },
    { $group: { 
      _id: { rate: '$tlCommissionRate' }, 
      count: { $sum: 1 },
      totalGold: { $sum: '$gold' }
    } },
    { $sort: { count: -1 } },
    { $limit: 20 }
  ]);
  
  console.log('tlCommissionRate | count | totalGold');
  console.log('-----------------|-------|-----------');
  for (const item of glTlRateDist) {
    const rate = item._id.rate;
    console.log(`${rate?.toFixed(4) || 'null/null      '} | ${item.count} | ${item.totalGold?.toFixed(2)}`);
  }

  await mongoose.disconnect();
})();
