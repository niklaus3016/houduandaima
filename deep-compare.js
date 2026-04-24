const http = require('http');

async function login() {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ username: 'admin', password: 'admin123456' });
    const req = http.request({ hostname: '127.0.0.1', port: 3003, path: '/api/admin/login', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': data.length } }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d).data.token));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function fetch(path, token) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: 3003, path, headers: { Authorization: `Bearer ${token}` } }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const token = await login();

  console.log('=== 详细对比分析 ===\n');

  // 首页接口完整数据
  const usersData = await fetch('/api/admin/dashboard/users?range=today', token);
  const users = usersData.data || [];

  console.log('首页接口返回的所有用户数:', users.length);

  // 统计首页接口中每个employeeId的汇总
  const empStats = {};
  users.forEach(u => {
    if (!empStats[u.employeeId]) {
      empStats[u.employeeId] = { watched: 0, earnings: 0, users: [] };
    }
    empStats[u.employeeId].watched += u.watched;
    empStats[u.employeeId].earnings += u.earnings;
    empStats[u.employeeId].users.push({ userId: u.userId, watched: u.watched });
  });

  // 按earnings排序
  const empRanking = Object.entries(empStats)
    .map(([eid, s]) => ({ employeeId: eid, ...s }))
    .sort((a, b) => b.earnings - a.earnings);

  console.log('\n首页接口 - 按employeeId汇总排名:');
  empRanking.slice(0, 10).forEach((r, i) => {
    console.log(`${i+1}. ${r.employeeId}: watched=${r.watched}, earnings=${r.earnings.toFixed(2)}, 用户数=${r.users.length}`);
  });

  // 排行榜接口数据
  const rankingData = await fetch('/api/ranking/today-ranking', token);
  const ranking = rankingData.data.ranking;

  console.log('\n排行榜接口 - 排名:');
  ranking.slice(0, 10).forEach((r, i) => {
    console.log(`${i+1}. ${r.employeeId}: count=${r.count}, earnings=${r.earnings}`);
  });

  // 找出差异最大的employeeId
  console.log('\n=== 差异分析 ===');
  const top5 = empRanking.slice(0, 5);
  top5.forEach(r => {
    const rApi = ranking.find(x => x.employeeId === r.employeeId);
    const ratio = rApi ? (rApi.count / r.watched).toFixed(2) : 'N/A';
    console.log(`${r.employeeId}: 首页=${r.watched}, 排行榜=${rApi?.count || 0}, 比例=${ratio}x`);
  });

  // 检查首页3769有多少个用户
  console.log('\n=== 3769员工详情 ===');
  const emp3769 = users.filter(u => u.employeeId === '3769');
  console.log('3769下属用户数:', emp3769.length);
  emp3769.forEach((u, i) => {
    console.log(`  ${i+1}. userId=${u.userId}, watched=${u.watched}, earnings=${u.earnings.toFixed(2)}`);
  });
}

main().catch(console.error);