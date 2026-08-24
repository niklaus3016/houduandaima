const mongoose = require('mongoose');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017/test?authSource=admin&replicaSet=lzjzb-sjk-mongodb';

(async () => {
  await mongoose.connect(MONGODB_URI);
  const Admin = require('./models/Admin');
  const WithdrawRecord = require('./models/WithdrawRecord');

  console.log('=== 排查 admin003 上月收益异常 ===\n');

  // 1. 查 admin003 的完整信息
  const admin = await Admin.findOne({ username: 'admin003' }).lean();
  if (admin) {
    console.log('1. admin003 基本信息:');
    console.log('   username:', admin.username);
    console.log('   role:', admin.role);
    console.log('   realName:', admin.realName);
    console.log('   commission:', admin.commission);
    console.log('   lastMonthGold:', admin.lastMonthGold);
    console.log('   teamName:', admin.teamName);
    console.log('   teamGroupId:', admin.teamGroupId);
    console.log('   managedTeamIds:', admin.managedTeamIds);
    console.log('   manualLevel:', admin.manualLevel);
    console.log('   manualLevelSetAt:', admin.manualLevelSetAt ? new Date(admin.manualLevelSetAt).toLocaleString('zh-CN', {timeZone:'Asia/Shanghai'}) : null);
  }

  // 2. 查所有超管/高管的 commission 字段值
  console.log('\n2. 所有高级/高管管理员的 commission 字段:');
  const highLevelAdmins = await Admin.find({
    role: { $in: ['SUPER_ADMIN', 'ADMIN_MANAGER', 'ADMIN'] }
  }).select('username role commission lastMonthGold').lean();
  highLevelAdmins.forEach(a => {
    console.log('   ' + a.username + ': role=' + a.role + ', commission=' + a.commission + ', lastMonthGold=' + a.lastMonthGold);
  });

  // 3. 查 admin003 的提现记录
  console.log('\n3. admin003 的提现记录:');
  const withdraws = await WithdrawRecord.find({ userId: 'admin003', type: 'admin' }).sort({ createdAt: -1 }).limit(10).lean();
  if (withdraws.length > 0) {
    let totalWithdrawn = 0;
    withdraws.forEach(w => {
      console.log('   status=' + w.status + ', amount=' + w.amount + ', createdAt=' + new Date(w.createdAt).toLocaleString('zh-CN', {timeZone:'Asia/Shanghai'}));
      totalWithdrawn += w.amount;
    });
    console.log('   总提现金额:', totalWithdrawn);
  } else {
    console.log('   无提现记录');
  }

  // 4. 查 admin003 的提现记录（status=0 待处理）
  console.log('\n4. admin003 待处理提现 (status=0):');
  const pendingWithdraws = await WithdrawRecord.find({ userId: 'admin003', type: 'admin', status: 0 }).lean();
  if (pendingWithdraws.length > 0) {
    pendingWithdraws.forEach(w => {
      console.log('   amount=' + w.amount + ', createdAt=' + new Date(w.createdAt).toLocaleString('zh-CN', {timeZone:'Asia/Shanghai'}));
    });
    const totalPending = pendingWithdraws.reduce((s,w) => s + w.amount, 0);
    console.log('   待处理总额:', totalPending);
  } else {
    console.log('   无待处理提现');
  }

  // 5. 分析：为什么会出现负值
  console.log('\n5. 原因分析:');
  const commissionVal = admin?.commission || 0;
  const totalPending = pendingWithdraws.length > 0 ? pendingWithdraws.reduce((s,w) => s + w.amount, 0) : 0;
  const availableBalance = Math.max(0, commissionVal - totalPending);
  console.log('   admin.commission =', commissionVal);
  console.log('   待处理提现 =', totalPending);
  console.log('   availableBalance = max(0, commission - pending) =', availableBalance);
  console.log('   负值来源：可能是其他计算逻辑（如 KPI 计算）产生的负值');

  await mongoose.disconnect();
})();
