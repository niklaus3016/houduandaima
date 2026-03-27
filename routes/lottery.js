const express = require('express');
const router = express.Router();
const LotteryPool = require('../models/LotteryPool');
const LotteryTicket = require('../models/LotteryTicket');
const LotteryHistory = require('../models/LotteryHistory');
const LotterySettings = require('../models/LotterySettings');
const UserGold = require('../models/UserGold');
const GoldLog = require('../models/GoldLog');


// 生成期号（使用简单的数字递增）
async function generateIssueNumber() {
  try {
    // 查找最新的开奖记录，只考虑数字格式的期号
    const latestHistory = await LotteryHistory.findOne(
      { issueNumber: { $regex: /^\d+$/ } }
    ).sort({ drawTime: -1 });
    
    if (latestHistory) {
      // 如果有数字格式的开奖记录，期号为最新期号 + 1
      const latestIssueNumber = parseInt(latestHistory.issueNumber);
      return (latestIssueNumber + 1).toString();
    } else {
      // 如果没有数字格式的开奖记录，期号为1
      return '1';
    }
  } catch (error) {
    console.error('生成期号错误:', error);
    return '1';
  }
}

// 生成6位随机数字奖券号码
function generateTicketNumber() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// 获取奖金池状态
router.get('/pool', async (req, res) => {
  try {
    let pool = await LotteryPool.findOne();
    if (!pool) {
      pool = new LotteryPool();
      await pool.save();
    }
    
    res.json({
      success: true,
      data: {
        currentAmount: pool.currentAmount,
        totalAmount: pool.totalAmount,
        lastDrawTime: pool.lastDrawTime
      }
    });
  } catch (error) {
    console.error('获取奖金池状态错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 向奖金池添加金币
router.post('/add-to-pool', async (req, res) => {
  try {
    const { amount, userId, employeeId } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: '金额必须大于0' });
    }
    
    let pool = await LotteryPool.findOne();
    if (!pool) {
      pool = new LotteryPool();
    }
    
    pool.currentAmount += amount;
    pool.totalAmount += amount;
    await pool.save();
    
    res.json({
      success: true,
      data: {
        currentAmount: pool.currentAmount
      }
    });
  } catch (error) {
    console.error('向奖金池添加金币错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 生成奖券
router.post('/generate-ticket', async (req, res) => {
  try {
    const { userId, employeeId } = req.body;
    
    if (!userId || !employeeId) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }
    
    // 生成期号
    const issueNumber = await generateIssueNumber();
    
    // 获取彩票设置
    let settings = await LotterySettings.findOne();
    if (!settings) {
      settings = new LotterySettings();
      await settings.save();
    }
    
    // 生成奖券号码
    const ticketNumber = generateTicketNumber();
    
    // 计算有效期（下一次开奖时间，使用北京时间）
    const now = new Date();
    const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000); // 转换为北京时间
    
    // 创建有效期日期对象（使用北京时间）
    const validUntilBeijing = new Date(beijingTime);
    const [hours, minutes] = settings.drawTime.split(':').map(Number);
    validUntilBeijing.setHours(hours, minutes, 0, 0);
    
    // 如果当前时间已经过了今天的开奖时间，则设置为明天的开奖时间
    if (beijingTime >= validUntilBeijing) {
      validUntilBeijing.setDate(validUntilBeijing.getDate() + 1);
    }
    
    // 转换回UTC时间
    const validUntilUTC = new Date(validUntilBeijing.getTime() - 8 * 60 * 60 * 1000);
    
    // 创建奖券
    const ticket = new LotteryTicket({
      userId,
      employeeId,
      ticketNumber,
      status: '有效',
      issueNumber,
      validUntil: validUntilUTC
    });
    
    await ticket.save();
    
    res.json({
      success: true,
      data: {
        ticketNumber,
        issueNumber
      }
    });
  } catch (error) {
    console.error('生成奖券错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取用户奖券列表
router.get('/tickets', async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ success: false, message: '缺少用户ID' });
    }
    
    const tickets = await LotteryTicket.find({ userId }).sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: {
        tickets: tickets.map(ticket => ({
          ticketNumber: ticket.ticketNumber,
          issueNumber: ticket.issueNumber,
          status: ticket.status,
          validUntil: ticket.validUntil,
          createdAt: ticket.createdAt
        }))
      }
    });
  } catch (error) {
    console.error('获取用户奖券列表错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取历史开奖记录
router.get('/history', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    
    // 计算总记录数
    const total = await LotteryHistory.countDocuments();
    
    // 计算分页参数
    const skip = (page - 1) * limit;
    
    // 查询开奖记录
    const history = await LotteryHistory.find()
      .sort({ drawTime: -1 })
      .skip(skip)
      .limit(Number(limit));
    
    res.json({
      success: true,
      data: {
        history: history.map(item => ({
          issueNumber: item.issueNumber,
          drawTime: item.drawTime,
          poolAmount: item.poolAmount,
          firstPrize: item.firstPrize,
          secondPrize: item.secondPrize,
          thirdPrize: item.thirdPrize,
          winners: item.winners,
          drawType: item.drawType
        })),
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('获取历史开奖记录错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取最新开奖结果
router.get('/result', async (req, res) => {
  try {
    const latestResult = await LotteryHistory.findOne().sort({ drawTime: -1 });
    
    if (!latestResult) {
      return res.json({
        success: true,
        data: null
      });
    }
    
    res.json({
      success: true,
      data: {
        issueNumber: latestResult.issueNumber,
        drawTime: latestResult.drawTime,
        poolAmount: latestResult.poolAmount,
        winners: latestResult.winners,
        firstPrize: latestResult.firstPrize,
        secondPrize: latestResult.secondPrize,
        thirdPrize: latestResult.thirdPrize
      }
    });
  } catch (error) {
    console.error('获取最新开奖结果错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取当前期号
router.get('/current-issue', async (req, res) => {
  try {
    // 生成当前期号
    const issueNumber = await generateIssueNumber();
    
    res.json({
      success: true,
      data: {
        issueNumber
      }
    });
  } catch (error) {
    console.error('获取当前期号错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取用户本期奖券（未开奖的）
router.get('/tickets/current', async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ success: false, message: '缺少用户ID' });
    }
    
    // 查找用户的所有有效奖券（状态为有效）
    const currentTickets = await LotteryTicket.find({ 
      userId, 
      status: '有效' 
    }).sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: {
        tickets: currentTickets.map(ticket => ({
          ticketNumber: ticket.ticketNumber,
          issueNumber: ticket.issueNumber,
          status: '未开奖',
          validUntil: ticket.validUntil,
          createdAt: ticket.createdAt
        }))
      }
    });
  } catch (error) {
    console.error('获取用户本期奖券错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取用户上一期奖券（最近一次开奖的）
router.get('/tickets/last', async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ success: false, message: '缺少用户ID' });
    }
    
    // 查找用户的所有已开奖奖券（状态为"中奖"或"作废"）
    const userTickets = await LotteryTicket.find({ 
      userId, 
      status: { $in: ['中奖', '作废'] } 
    }).sort({ createdAt: -1 });
    
    if (userTickets.length === 0) {
      return res.json({
        success: true,
        data: {
          tickets: []
        }
      });
    }
    
    // 获取最近的一条奖券的期号
    const latestIssueNumber = userTickets[0].issueNumber;
    
    // 查找该期号的开奖记录
    const latestHistory = await LotteryHistory.findOne({ issueNumber: latestIssueNumber });
    
    // 查找该期号下用户的所有奖券
    const lastTickets = await LotteryTicket.find({ 
      userId, 
      issueNumber: latestIssueNumber,
      status: { $in: ['中奖', '作废'] } 
    }).sort({ createdAt: -1 });
    
    // 处理奖券状态，添加具体奖项信息
    const processedTickets = lastTickets.map(ticket => {
      let status = ticket.status;
      
      // 如果是中奖状态，查找具体奖项
      if (ticket.status === '中奖' && latestHistory) {
        // 检查一等奖
        const firstPrize = latestHistory.winners.firstPrize.find(winner => winner.ticketNumber === ticket.ticketNumber);
        if (firstPrize) {
          status = '中奖（一等奖）';
        }
        
        // 检查二等奖
        const secondPrize = latestHistory.winners.secondPrize.find(winner => winner.ticketNumber === ticket.ticketNumber);
        if (secondPrize) {
          status = '中奖（二等奖）';
        }
        
        // 检查三等奖
        const thirdPrize = latestHistory.winners.thirdPrize.find(winner => winner.ticketNumber === ticket.ticketNumber);
        if (thirdPrize) {
          status = '中奖（三等奖）';
        }
      }
      
      return {
        ticketNumber: ticket.ticketNumber,
        issueNumber: ticket.issueNumber,
        status: status,
        validUntil: ticket.validUntil,
        createdAt: ticket.createdAt
      };
    });
    
    res.json({
      success: true,
      data: {
        tickets: processedTickets
      }
    });
  } catch (error) {
    console.error('获取用户上一期奖券错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取彩票设置
router.get('/settings', async (req, res) => {
  try {
    let settings = await LotterySettings.findOne();
    if (!settings) {
      settings = new LotterySettings();
      await settings.save();
    }
    
    res.json({
      success: true,
      data: {
        poolPercentage: settings.poolPercentage,
        drawTime: settings.drawTime,
        adCountThreshold: settings.adCountThreshold,
        enabled: settings.enabled,
        firstPrizePercentage: settings.firstPrizePercentage,
        secondPrizePercentage: settings.secondPrizePercentage,
        thirdPrizePercentage: settings.thirdPrizePercentage,
        firstPrizeCount: settings.firstPrizeCount,
        secondPrizeCount: settings.secondPrizeCount,
        thirdPrizeCount: settings.thirdPrizeCount
      }
    });
  } catch (error) {
    console.error('获取彩票设置错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;