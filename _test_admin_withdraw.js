const mongoose = require('mongoose');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017/test?authSource=admin&replicaSet=lzjzb-sjk-mongodb';

(async () => {
  await mongoose.connect(MONGODB_URI);
  const Admin = require('./models/Admin');
  const WithdrawRecord = require('./models/WithdrawRecord');
  const dashboard = require('./routes/dashboard');

  console.log('=== 测试高管提现逻辑 ===\n');

  async function testAdminWithdraw(username, amount) {
    const admin = await Admin.findOne({ username }).lean();
    if (!admin) {
      console.log(`${username}: 未找到管理员`);
      return;
    }

    const role = String(admin.role || '').toUpperCase();
    const isAdminManager = role === 'ADMIN_MANAGER';
    const isSuperAdmin = role === 'SUPER_ADMIN';
    
    console.log(`${username} (${role}):`);
    console.log(`  commission字段: ${admin.commission} (分成比例/提现余额)`);
    console.log(`  角色类型: ${isAdminManager || isSuperAdmin ? '高管/超管' : '普通管理员'}`);

    // 计算待处理提现
    let pendingAmount = 0;
    try {
      const wdAgg = await WithdrawRecord.aggregate([
        { $match: { userId: admin.username, type: 'admin', status: 0 } },
        { $group: { _id: null, sumAmount: { $sum: '$amount' } } }
      ]).exec();
      pendingAmount = +(wdAgg?.[0]?.sumAmount || 0);
    } catch (e) {
      console.warn('  计算待处理提现失败:', e.message);
    }
    console.log(`  待处理提现: ${pendingAmount.toFixed(2)} 元`);

    let availableBalance;
    
    if (isAdminManager || isSuperAdmin) {
      // 高管/超管：使用动态计算的 dividendTotal
      const scopeTeamIds = admin.managedTeamIds || [];
      const kpi = await dashboard.computeSuperKpi('lastMonth', scopeTeamIds);
      availableBalance = Math.max(0, kpi.dividendTotal - pendingAmount);
      console.log(`  dividendTotal (上月分红): ${kpi.dividendTotal.toFixed(2)} 元`);
      console.log(`  使用动态计算的 dividendTotal`);
    } else {
      // TL/GL：使用 Admin.commission 字段
      availableBalance = Math.max(0, (+admin.commission || 0) - pendingAmount);
      console.log(`  使用 Admin.commission 字段`);
    }
    
    console.log(`  可提现金额: ${availableBalance.toFixed(2)} 元`);
    console.log(`  提现请求金额: ${amount.toFixed(2)} 元`);
    
    if (amount > availableBalance) {
      console.log(`  ❌ 余额不足！`);
    } else {
      console.log(`  ✅ 余额充足，可以提现`);
    }
    console.log('');
  }

  // 测试 admin002 和 admin003
  await testAdminWithdraw('admin002', 2583.56);
  await testAdminWithdraw('admin003', 5331.22);

  // 也测试一个普通 TL
  await testAdminWithdraw('huangzhenhui', 1000);

  console.log('=== 测试完成 ===');

  await mongoose.disconnect();
})();
