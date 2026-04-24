const mongoose = require('mongoose');

// MongoDB连接字符串
const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

// 直接使用原生MongoDB客户端
const { MongoClient } = require('mongodb');

async function checkFanjieEmployees() {
  try {
    console.log('=== 检查fanjie组的员工 ===\n');

    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    console.log('MongoDB连接成功\n');

    const db = client.db();
    
    // fanjie的用户ID
    const fanjieUserId = '69cd2b814b7bff2403ab4f70';
    
    // 1. 检查fanjie的组
    console.log('1. 检查fanjie的组:');
    const fanjieGroup = await db.collection('teamgroups').findOne({ groupLeaderId: fanjieUserId });
    if (fanjieGroup) {
      console.log(`组名: ${fanjieGroup.groupName}`);
      console.log(`_id: ${fanjieGroup._id}`);
      console.log(`teamLeaderId: "${fanjieGroup.teamLeaderId}"`);
      console.log(`groupLeaderId: "${fanjieGroup.groupLeaderId}"`);
      console.log('');
    }

    // 2. 检查fanjie组的员工
    console.log('2. 检查fanjie组的员工:');
    
    // 可能的ID
    const possibleIds = [
      fanjieUserId, // fanjie的ID
      fanjieGroup?._id.toString() // 组的ID
    ].filter(id => id);
    
    console.log(`查询teamGroupId在: ${possibleIds}`);
    
    const fanjieEmployees = await db.collection('employees').find({
      teamGroupId: { $in: possibleIds }
    }).toArray();
    
    console.log(`找到 ${fanjieEmployees.length} 个员工`);
    
    if (fanjieEmployees.length > 0) {
      console.log('前10个员工的teamGroupId:');
      fanjieEmployees.slice(0, 10).forEach((emp, i) => {
        console.log(`${i+1}. ${emp.employeeId}: "${emp.teamGroupId}"`);
      });
    }

    // 3. 检查fanjie组的员工数量
    console.log('\n3. 检查fanjie组的员工数量:');
    console.log(`fanjie组共有 ${fanjieEmployees.length} 个员工`);

    await client.close();

  } catch (error) {
    console.error('检查失败:', error.message);
  }
}

checkFanjieEmployees();
