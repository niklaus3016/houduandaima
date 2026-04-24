const mongoose = require('mongoose');

async function run() {
  console.log('=== 简单调试 ===\n');

  await mongoose.connect('mongodb://127.0.0.1:27017/company_dashboard');
  console.log('已连接 MongoDB');

  const employees = await mongoose.connection.collection('employees').find({
    parentId: '65f1a2b3c4d5e6f7a8b9c0d1' // cuidng 的 admin _id
  }).limit(5).toArray();

  console.log('\n1. Employee 记录:');
  employees.forEach(e => {
    console.log(`   _id: ${e._id}, employeeId: "${e.employeeId}", name: ${e.name}`);
  });

  const employeeIds = employees.map(e => e.employeeId);
  console.log('\n2. employeeIds 数组:', employeeIds);

  const now = new Date();
  const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const todayStart = new Date(beijingNow);
  todayStart.setHours(0, 0, 0, 0);
  const todayStartUTC = new Date(todayStart.getTime() - 8 * 60 * 60 * 1000);

  console.log('\n3. 时间:');
  console.log('   now:', now.toISOString());
  console.log('   todayStartUTC:', todayStartUTC.toISOString());

  const loginRecords = await mongoose.connection.collection('loginrecords').find({
    loginDate: { $gte: todayStartUTC, $lt: now },
    employeeId: { $in: employeeIds }
  }).limit(5).toArray();

  console.log('\n4. LoginRecord 查询结果:', loginRecords.length);

  if (loginRecords.length > 0) {
    loginRecords.forEach(r => {
      console.log(`   userId: "${r.userId}", employeeId: "${r.employeeId}", loginDate: ${r.loginDate}`);
    });
  }

  // 检查 LoginRecord 中是否有任何记录的 employeeId 在 employeeIds 数组中
  const allLoginRecords = await mongoose.connection.collection('loginrecords').find({
    loginDate: { $gte: todayStartUTC, $lt: now }
  }).limit(20).toArray();

  console.log('\n5. 今日所有 LoginRecord (前 20 条):');
  allLoginRecords.forEach(r => {
    console.log(`   employeeId: "${r.employeeId}", loginDate: ${r.loginDate}`);
  });

  console.log('\n6. employeeIds 数组中的值类型:', typeof employeeIds[0], employeeIds[0].constructor.name);

  await mongoose.disconnect();
}

run().catch(console.error);
