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
  console.log('=== 首页接口 /api/admin/dashboard/users?range=today ===');
  const usersData = await fetch('/api/admin/dashboard/users?range=today', token);
  const users = usersData.data || [];
  console.log('总用户记录数:', users.length);

  const u7703 = users.find(u => u.employeeId === '7703');
  console.log('\n7703在首页接口的数据:');
  console.log('  watched:', u7703?.watched);
  console.log('  earnings:', u7703?.earnings);
  console.log('  ecpm:', u7703?.ecpm);

  const empStats = {};
  users.forEach(u => {
    if (!empStats[u.employeeId]) {
      empStats[u.employeeId] = { watched: 0, earnings: 0 };
    }
    empStats[u.employeeId].watched += u.watched;
    empStats[u.employeeId].earnings += u.earnings;
  });

  const r7703 = empStats['7703'];
  console.log('\n按employeeId汇总7703:');
  console.log('  watched:', r7703.watched);
  console.log('  earnings:', r7703.earnings.toFixed(2));

  const ranking = Object.entries(empStats)
    .map(([eid, s]) => ({ employeeId: eid, watched: s.watched, earnings: s.earnings }))
    .sort((a, b) => b.earnings - a.earnings);

  const rank7703 = ranking.findIndex(r => r.employeeId === '7703');
  console.log('\n7703按employeeId汇总后的排名:', rank7703 + 1);

  console.log('\n前10名 (按employeeId汇总):');
  ranking.slice(0, 10).forEach((r, i) => {
    console.log(`${i+1}. employeeId: ${r.employeeId}, watched: ${r.watched}, earnings: ${r.earnings.toFixed(2)}`);
  });

  console.log('\n=== 排行榜接口 /api/ranking/today-ranking ===');
  const rankingData = await fetch('/api/ranking/today-ranking', token);
  const rankingList = rankingData.data.ranking;

  rankingList.forEach((r, i) => {
    console.log(`${i+1}. employeeId: ${r.employeeId}, count: ${r.count}, earnings: ${r.earnings}, avgGold: ${r.avgGold}`);
  });

  const rank7703Api = rankingList.findIndex(r => r.employeeId === '7703');
  console.log('\n7703在排行榜接口中的排名:', rank7703Api + 1);

  console.log('\n=== 对比分析 ===');
  console.log('7703在首页接口按employeeId汇总: watched=' + r7703.watched + ', earnings=' + r7703.earnings.toFixed(2));
  console.log('7703在排行榜接口: count=' + rankingList[rank7703Api]?.count + ', earnings=' + rankingList[rank7703Api]?.earnings);
  console.log('差异: 首页接口watched=' + r7703.watched + ' vs 排行榜接口count=' + rankingList[rank7703Api]?.count);
}

main().catch(console.error);