const mongoose = require('mongoose');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017/test?authSource=admin&replicaSet=lzjzb-sjk-mongodb';

(async () => {
  await mongoose.connect(MONGODB_URI);
  const Admin = require('./models/Admin');
  const Employee = require('./models/Employee');
  const TeamGroup = require('./models/TeamGroup');
  const dashboard = require('./routes/dashboard');
  const GoldLog = require('./models/GoldLog');

  console.log('=== 验证 computeNewKpi 中间推计算 ===\n');

  const admin = await Admin.findOne({ username: 'huangzhenhui' }).lean();
  const tlId = String(admin._id);
  console.log('TL:', admin.username);
  
  // 获取下属 TL
  const subTls = await Admin.find({ parentTlId: tlId, role: /NORMAL_ADMIN|normal_admin/i }).select('_id username commission').lean();
  console.log('\n下属 TL:');
  for (const st of subTls) {
    console.log(`  ${st.username} (ID: ${st._id}), commission=${st.commission}`);
  }
  
  // 获取下属 TL 的 D 员工
  console.log('\n下属 TL 的 D 员工:');
  for (const st of subTls) {
    const subDIds = await dashboard._getTLDirectDIds(String(st._id));
    console.log(`  ${st.username}: ${subDIds.length} 个 D 员工`);
  }
  
  // 手动计算间推（下属 TL 的 D 员工）
  console.log('\n=== 手动计算下属 TL D 员工的间推 ===');
  
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
  
  const tlFallbackRate = 0.14; // TL 实时算档率
  const _ptlRateExprForSubordinate = dashboard._ptlRateExprForSubordinate;
  
  let totalSubTlCommission = 0;
  for (const st of subTls) {
    const subTlRate = +st.commission;
    const subDIds = await dashboard._getTLDirectDIds(String(st._id));
    
    if (subDIds.length > 0) {
      const rateExpr = _ptlRateExprForSubordinate(subTlRate, Math.max(0, tlFallbackRate - subTlRate));
      const agg = await dashboard._aggGold(subDIds, lastMonthStart, lastMonthEnd, rateExpr);
      const commission = (+agg.totalCommissionGold || 0) / 1000;
      console.log(`  ${st.username}: ${subDIds.length} 员工, totalGold=${(+agg.totalGold || 0).toFixed(2)}, commission=¥${commission.toFixed(2)}`);
      totalSubTlCommission += commission;
    }
  }
  console.log(`\n下属 TL D 员工间推合计: ¥${totalSubTlCommission.toFixed(2)}`);
  
  // 计算组长 G 员工的间推
  console.log('\n=== 手动计算组长 G 员工的间推 ===');
  const subGIds = await dashboard._getTLSubGroupGIds(tlId);
  console.log(`G 员工数: ${subGIds.length}`);
  
  if (subGIds.length > 0) {
    const gRateExpr = _ptlRateExprForSubordinate(0.05, Math.max(0, tlFallbackRate - 0.05));
    const agg = await dashboard._aggGold(subGIds, lastMonthStart, lastMonthEnd, gRateExpr);
    const gCommission = (+agg.totalCommissionGold || 0) / 1000;
    console.log(`G 员工 totalGold=${(+agg.totalGold || 0).toFixed(2)}, commission=¥${gCommission.toFixed(2)}`);
    console.log(`\n间推合计 (G + 下属TL D): ¥${(totalSubTlCommission + gCommission).toFixed(2)}`);
  }

  await mongoose.disconnect();
})();
