const mongoose = require('mongoose');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017/test?authSource=admin&replicaSet=lzjzb-sjk-mongodb';

(async () => {
  await mongoose.connect(MONGODB_URI);
  const Admin = require('./models/Admin');
  const Employee = require('./models/Employee');
  const TeamGroup = require('./models/TeamGroup');
  const GoldLog = require('./models/GoldLog');
  const dashboard = require('./routes/dashboard');

  console.log('=== 用正确格式调用 _fastSumTeamCommissions ===\n');

  const admin = await Admin.findOne({ username: 'huangzhenhui' }).lean();
  
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
  
  // 正确的 tlScopes 格式需要包含 kind 和 adminId
  const tlScopes = [{ kind: 'TL', adminId: String(admin._id) }];
  
  console.log('tlScopes:', JSON.stringify(tlScopes));
  
  // 调用 _fastSumTeamCommissions
  console.log('\n调用 _fastSumTeamCommissions...');
  const totalCommission = await dashboard._fastSumTeamCommissions(tlScopes, lastMonthStart, lastMonthEnd);
  
  console.log('\n_fastSumTeamCommissions 结果:');
  console.log('  totalCommission:', totalCommission.toFixed(2));

  await mongoose.disconnect();
})();
