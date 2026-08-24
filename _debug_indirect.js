const mongoose = require('mongoose');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017/test?authSource=admin&replicaSet=lzjzb-sjk-mongodb';

(async () => {
  await mongoose.connect(MONGODB_URI);
  const Admin = require('./models/Admin');
  const Employee = require('./models/Employee');
  const TeamGroup = require('./models/TeamGroup');
  const GoldLog = require('./models/GoldLog');
  const dashboard = require('./routes/dashboard');

  console.log('=== 分析间推计算逻辑 ===\n');

  const admin = await Admin.findOne({ username: 'huangzhenhui' }).lean();
  console.log('Admin.commission:', admin.commission);
  
  // 获取下属组长组
  const groups = await TeamGroup.find({ teamLeaderId: String(admin._id) }).select('_id groupLeaderId groupName').lean();
  console.log('\n下属组长组:');
  for (const g of groups) {
    console.log(`  groupId=${g._id}, groupName=${g.groupName}, groupLeaderId=${g.groupLeaderId}`);
  }
  
  // 获取下属组长
  const subGLs = await Admin.find({ teamGroupId: { $in: groups.map(g => g._id) } }).select('username teamGroupId commission').lean();
  console.log('\n下属组长:');
  for (const gl of subGLs) {
    console.log(`  ${gl.username}, teamGroupId=${gl.teamGroupId}, commission=${gl.commission}`);
  }
  
  // 检查 _ptlRateExprForSubordinate
  console.log('\n=== 检查 _ptlRateExprForSubordinate ===');
  const ptlRateExpr = dashboard._ptlRateExprForSubordinate;
  console.log('_ptlRateExprForSubordinate 函数:', typeof ptlRateExpr);
  
  // 测试这个函数
  const subOwnRate = 0.05; // 组长的本级率
  const fallback = 0.09; // TL 级差率 = max(0, 0.14 - 0.05)
  const expr = ptlRateExpr(subOwnRate, fallback);
  console.log(`\nsubOwnRate=0.05, fallback=0.09 时的表达式:`);
  console.log(JSON.stringify(expr, null, 2));

  // 调用 computeNewKpi 并查看详细数据
  console.log('\n=== 调用 computeNewKpi 获取详细数据 ===');
  const scope = { kind: 'TL', adminId: String(admin._id) };
  const kpi = await dashboard.computeNewKpi(scope, 'lastMonth');
  
  // 打印所有字段
  console.log('\ncomputeNewKpi 返回的所有字段:');
  for (const [key, value] of Object.entries(kpi)) {
    if (typeof value !== 'object') {
      console.log(`  ${key}: ${value}`);
    }
  }

  await mongoose.disconnect();
})();
