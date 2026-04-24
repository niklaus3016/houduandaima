const express = require('express');
const GoldLog = require('./models/GoldLog');

// 模拟user.js中的函数
function getBeijingDate() {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}

function getCurrentWeek() {
  const now = getBeijingDate();
  const year = now.getFullYear();
  const firstDayOfYear = new Date(year, 0, 1);
  const dayOfWeek = firstDayOfYear.getUTCDay() || 7;
  const daysToFirstMonday = (8 - dayOfWeek) % 7;
  const firstMonday = new Date(firstDayOfYear);
  firstMonday.setDate(firstMonday.getDate() + daysToFirstMonday);
  
  const diffTime = now - firstMonday;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const weekNumber = Math.floor(diffDays / 7) + 1;
  return `${year}-${weekNumber.toString().padStart(2, '0')}`;
}

function getWeekRange(week) {
  const [year, weekNumber] = week.split('-').map(Number);
  const firstDayOfYear = new Date(year, 0, 1);
  const dayOfWeek = firstDayOfYear.getUTCDay() || 7;
  const daysToFirstMonday = (8 - dayOfWeek) % 7;
  const firstMonday = new Date(firstDayOfYear);
  firstMonday.setDate(firstMonday.getDate() + daysToFirstMonday);
  
  const weekStart = new Date(firstMonday);
  weekStart.setDate(weekStart.getDate() + (weekNumber - 1) * 7);
  weekStart.setHours(0, 0, 0, 0);
  
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  weekEnd.setHours(0, 0, 0, 0);
  
  // 转换为UTC时间
  return {
    start: new Date(weekStart.getTime() - 8 * 60 * 60 * 1000),
    end: new Date(weekEnd.getTime() - 8 * 60 * 60 * 1000)
  };
}

// 测试函数
async function testWeeklyCount() {
  try {
    const employeeId = '2222';
    const currentWeek = getCurrentWeek();
    const weekRange = getWeekRange(currentWeek);
    
    console.log('=== 测试信息 ===');
    console.log('当前周:', currentWeek);
    console.log('本周开始(UTC):', weekRange.start.toISOString());
    console.log('本周结束(UTC):', weekRange.end.toISOString());
    console.log('员工ID:', employeeId);
    
    // 测试1: 直接查询employeeId
    console.log('\n=== 测试1: 直接查询employeeId ===');
    const count1 = await GoldLog.countDocuments({
      employeeId: employeeId,
      createTime: {
        $gte: weekRange.start,
        $lt: weekRange.end
      }
    });
    console.log('结果:', count1);
    
    // 测试2: 查询employeeId为字符串
    console.log('\n=== 测试2: 查询employeeId为字符串 ===');
    const count2 = await GoldLog.countDocuments({
      employeeId: String(employeeId),
      createTime: {
        $gte: weekRange.start,
        $lt: weekRange.end
      }
    });
    console.log('结果:', count2);
    
    // 测试3: 不限制时间范围，只查询employeeId
    console.log('\n=== 测试3: 不限制时间范围 ===');
    const count3 = await GoldLog.countDocuments({
      employeeId: employeeId
    });
    console.log('结果:', count3);
    
    // 测试4: 查看前10条记录
    console.log('\n=== 测试4: 前10条记录 ===');
    const logs = await GoldLog.find({
      employeeId: employeeId
    }).sort({ createTime: -1 }).limit(10);
    console.log('记录数:', logs.length);
    if (logs.length > 0) {
      console.log('第一条记录的employeeId:', logs[0].employeeId);
      console.log('类型:', typeof logs[0].employeeId);
    }
    
  } catch (error) {
    console.error('测试错误:', error);
  }
}

// 连接数据库并测试
const mongoose = require('mongoose');
mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(() => {
    console.log('MongoDB连接成功');
    return testWeeklyCount();
  })
  .then(() => {
    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });