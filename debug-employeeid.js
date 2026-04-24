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

  // 首页接口返回的用户数据
  const usersData = await fetch('/api/admin/dashboard/users?range=today', token);
  const users = usersData.data || [];

  // 7703员工的数据
  const u7703 = users.find(u => u.employeeId === '7703');
  console.log('首页接口7703数据:');
  console.log('  userId:', u7703?.userId);
  console.log('  employeeId:', u7703?.employeeId);
  console.log('  name:', u7703?.name);
  console.log('  watched:', u7703?.watched);

  // 排行榜接口返回的数据
  const rankingData = await fetch('/api/ranking/today-ranking', token);
  const r7703 = rankingData.data.ranking.find(r => r.employeeId === '7703');
  console.log('\n排行榜接口7703数据:');
  console.log('  employeeId:', r7703?.employeeId);
  console.log('  count:', r7703?.count);

  // 查看GoldLog中employeeId=7703的前几条记录
  // 排行榜是按employeeId统计的
  console.log('\n问题分析:');
  console.log('1. 首页接口是按userId统计，然后匹配到employeeId');
  console.log('2. 排行榜接口是直接按GoldLog.employeeId统计');
  console.log('3. 如果GoldLog中某条记录的employeeId是7703，但该记录的userId并不属于7703员工下的userId，就会产生差异');

  // 检查GoldLog中employeeId=7703的记录
  // 需要直接查询数据库来验证
}

main().catch(console.error);