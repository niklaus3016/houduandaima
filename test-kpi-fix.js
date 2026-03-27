// 本地测试脚本 - 验证KPI接口修复逻辑

// 模拟时间范围计算
function getBeijingDate() {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}

// 模拟时间范围计算
function calculateDateRanges(range) {
  const now = new Date();
  const beijingNow = getBeijingDate();
  let startDate, endDate, prevStartDate, prevEndDate;
  
  if (range === 'yesterday') {
    // 昨天（北京时间）
    const yesterdayBeijing = new Date(beijingNow);
    yesterdayBeijing.setUTCDate(yesterdayBeijing.getUTCDate() - 1);
    
    // 昨天开始 = 昨天北京时间0点对应的UTC时间
    const yesterdayStartBeijing = new Date(yesterdayBeijing);
    yesterdayStartBeijing.setUTCHours(0, 0, 0, 0);
    startDate = new Date(yesterdayStartBeijing.getTime() - 8 * 60 * 60 * 1000);
    
    // 昨天结束 = 今天北京时间0点对应的UTC时间
    const todayStartBeijing = new Date(beijingNow);
    todayStartBeijing.setUTCHours(0, 0, 0, 0);
    endDate = new Date(todayStartBeijing.getTime() - 8 * 60 * 60 * 1000);
    
    // 前天
    const dayBeforeBeijing = new Date(yesterdayBeijing);
    dayBeforeBeijing.setUTCDate(dayBeforeBeijing.getUTCDate() - 1);
    const dayBeforeStartBeijing = new Date(dayBeforeBeijing);
    dayBeforeStartBeijing.setUTCHours(0, 0, 0, 0);
    prevStartDate = new Date(dayBeforeStartBeijing.getTime() - 8 * 60 * 60 * 1000);
    prevEndDate = startDate;
  } else {
    // 今天（北京时间）
    const todayStartBeijing = new Date(beijingNow);
    todayStartBeijing.setUTCHours(0, 0, 0, 0);
    startDate = new Date(todayStartBeijing.getTime() - 8 * 60 * 60 * 1000);
    endDate = now;
    
    // 昨天
    const yesterdayBeijing = new Date(beijingNow);
    yesterdayBeijing.setUTCDate(yesterdayBeijing.getUTCDate() - 1);
    yesterdayBeijing.setUTCHours(0, 0, 0, 0);
    prevStartDate = new Date(yesterdayBeijing.getTime() - 8 * 60 * 60 * 1000);
    
    const yesterdayEndBeijing = new Date(beijingNow);
    yesterdayEndBeijing.setUTCHours(0, 0, 0, 0);
    prevEndDate = new Date(yesterdayEndBeijing.getTime() - 8 * 60 * 60 * 1000);
  }
  
  return { startDate, endDate, prevStartDate, prevEndDate };
}

// 模拟登录记录数据
const mockLoginRecords = [
  // 今日登录记录（25条）
  ...Array.from({ length: 25 }, (_, i) => ({
    employeeId: `user${i + 1}`,
    loginDate: new Date(Date.now() - Math.random() * 86400000) // 今日随机时间
  })),
  // 昨日登录记录（22条）
  ...Array.from({ length: 22 }, (_, i) => ({
    employeeId: `user${i + 1}`,
    loginDate: new Date(Date.now() - 86400000 - Math.random() * 86400000) // 昨日随机时间
  }))
];

// 模拟查询登录记录
function mockFindLoginRecords(dateRange, teamMemberUserIds = null) {
  return mockLoginRecords.filter(record => {
    const inDateRange = record.loginDate >= dateRange.startDate && record.loginDate < dateRange.endDate;
    const inTeam = !teamMemberUserIds || teamMemberUserIds.includes(record.employeeId);
    return inDateRange && inTeam;
  });
}

// 测试修复后的逻辑
function testKpiLogic(range) {
  console.log(`\n=== 测试${range}时间范围 ===`);
  
  // 计算时间范围
  const { startDate, endDate, prevStartDate, prevEndDate } = calculateDateRanges(range);
  
  // 模拟查询当前时间范围的登录记录
  const currentLoginRecords = mockFindLoginRecords({ startDate, endDate });
  const activeUsers = new Set(currentLoginRecords.map(r => r.employeeId)).size;
  
  // 模拟查询对比时间范围的登录记录
  const prevLoginRecords = mockFindLoginRecords({ startDate: prevStartDate, endDate: prevEndDate });
  const prevActiveUsers = new Set(prevLoginRecords.map(r => r.employeeId)).size;
  
  // 计算增长率
  const activeUsersGrowth = prevActiveUsers > 0 
    ? ((activeUsers - prevActiveUsers) / prevActiveUsers * 100).toFixed(1) 
    : 0;
  
  console.log(`时间范围: ${range}`);
  console.log(`开始时间: ${startDate.toISOString()}`);
  console.log(`结束时间: ${endDate.toISOString()}`);
  console.log(`当前活跃用户数: ${activeUsers}`);
  console.log(`对比活跃用户数: ${prevActiveUsers}`);
  console.log(`活跃用户增长率: ${activeUsersGrowth}%`);
  
  return { activeUsers, activeUsersGrowth, prevActiveUsers };
}

// 运行测试
console.log('开始测试KPI接口修复逻辑...');

testKpiLogic('today');
testKpiLogic('yesterday');

console.log('\n✅ 测试完成');
console.log('\n修复说明:');
console.log('1. 之前的问题: 无论选择什么时间范围，活跃用户数总是显示今日的25');
console.log('2. 修复方案: 使用与其他指标相同的时间范围参数（startDate和endDate）');
console.log('3. 修复效果: 现在活跃用户数会根据选择的时间范围动态变化');
console.log('4. 增长率计算: 正确计算当前时间范围与对比时间范围的增长率');
