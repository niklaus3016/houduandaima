const mongoose = require('mongoose');
const UserGold = require('./models/UserGold');

mongoose.connect('mongodb://localhost:27017', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function setLastMonthGold() {
  try {
    // 查找8202的用户记录
    const user = await UserGold.findOne({ employeeId: '8202' });
    if (user) {
      user.lastMonthGold = 100000;
      await user.save();
      console.log('8202上月金币已设置为100000');
    }
    mongoose.connection.close();
  } catch (error) {
    console.error('错误:', error);
    mongoose.connection.close();
  }
}

setLastMonthGold();
