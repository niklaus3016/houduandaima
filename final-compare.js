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
  console.log('=== 使用最新token测试 ===\n');

  // 首页接口
  const usersData = await fetch('/api/admin/dashboard/users?range=today', token);
  const users = usersData.data || [];

  // 统计首页每个employeeId
  const empStats = {};
  users.forEach(u => {
    if (!empStats[u.employeeId]) {
      empStats[u.employeeId] = { watched: 0, earnings: 0 };
    }
    empStats[u.employeeId].watched += u.watched;
    empStats[u.employeeId].earnings += u.earnings;
  });

  const homeRanking = Object.entries(empStats)
    .map(([eid, s]) => ({ employeeId: eid, ...s }))
    .sort((a, b) => b.earnings - a.earnings);

  console.log('首页接口按employeeId汇总:');
  homeRanking.slice(0, 5).forEach((r, i) => {
    console.log(`${i+1}. ${r.employeeId}: watched=${r.watched}, earnings=${r.earnings.toFixed(2)}`);
  });

  // 排行榜接口
  const rankingData = await fetch('/api/ranking/today-ranking', token);
  const ranking = rankingData.data.ranking;

  console.log('\n排行榜接口:');
  ranking.slice(0, 5).forEach((r, i) => {
    console.log(`${i+1}. ${r.employeeId}: count=${r.count}, earnings=${r.earnings}`);
  });

  // 找出共同的employeeId
  const homeIds = new Set(homeRanking.map(r => r.employeeId));
  const rankingIds = new Set(ranking.map(r => r.employeeId));

  console.log('\n首页接口的employeeId数量:', homeIds.size);
  console.log('排行榜接口的employeeId数量:', rankingIds.size);

  const common = [...homeIds].filter(id => rankingIds.has(id));
  console.log('两者共同的employeeId数量:', common.length);

  const onlyHome = [...homeIds].filter(id => !rankingIds.has(id));
  const onlyRanking = [...rankingIds].filter(id => !homeIds.has(id));

  console.log('\n只在首页出现的employeeId:', onlyHome.slice(0, 5));
  console.log('只在排行榜出现的employeeId:', onlyRanking.slice(0, 5));
}

main().catch(console.error);