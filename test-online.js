const https = require('https');

async function login() {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ username: 'admin', password: 'admin123456' });
    const options = {
      hostname: 'wfqmaepvjkdd.sealoshzh.site',
      path: '/api/admin/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
    };
    const req = https.request(options, res => {
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
    const options = {
      hostname: 'wfqmaepvjkdd.sealoshzh.site',
      path,
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    };
    const req = https.request(options, res => {
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

  console.log('=== 排行榜接口 /api/ranking/today-ranking ===');
  const rankingData = await fetch('/api/ranking/today-ranking', token);
  const ranking = rankingData.data.ranking;
  console.log('排行榜前5:');
  ranking.slice(0, 5).forEach((r, i) => {
    console.log(`${i+1}. ${r.employeeId}: count=${r.count}, earnings=${r.earnings}`);
  });

  console.log('\n=== 首页接口 /api/admin/dashboard/users?range=today ===');
  const usersData = await fetch('/api/admin/dashboard/users?range=today', token);
  const users = usersData.data || [];

  const empStats = {};
  users.forEach(u => {
    if (!empStats[u.employeeId]) empStats[u.employeeId] = { watched: 0, earnings: 0 };
    empStats[u.employeeId].watched += u.watched;
    empStats[u.employeeId].earnings += u.earnings;
  });

  const homeRanking = Object.entries(empStats)
    .map(([eid, s]) => ({ employeeId: eid, ...s }))
    .sort((a, b) => b.earnings - a.earnings);

  console.log('首页按employeeId汇总前5:');
  homeRanking.slice(0, 5).forEach((r, i) => {
    console.log(`${i+1}. ${r.employeeId}: watched=${r.watched}, earnings=${r.earnings.toFixed(2)}`);
  });

  console.log('\n=== 对比7703 ===');
  const home7703 = homeRanking.find(r => r.employeeId === '7703');
  const rank7703 = ranking.find(r => r.employeeId === '7703');
  const homeIdx = homeRanking.findIndex(r => r.employeeId === '7703');
  const rankIdx = ranking.findIndex(r => r.employeeId === '7703');
  console.log('首页: 排名' + (homeIdx + 1) + ', watched=' + home7703.watched + ', earnings=' + home7703.earnings.toFixed(2));
  console.log('排行榜: 排名' + (rankIdx + 1) + ', count=' + rank7703.count + ', earnings=' + rank7703.earnings);
}

main().catch(console.error);