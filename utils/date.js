const OFFSET = 8 * 60 * 60 * 1000;

function getBeijingDate(date = new Date()) {
  return new Date(date.getTime() + OFFSET);
}

function getBeijingStartOfDay(date = new Date()) {
  const beijingNow = date.getTime() + OFFSET;
  const dayStart = new Date(Math.floor(beijingNow / (24 * 60 * 60 * 1000)) * (24 * 60 * 60 * 1000));
  return new Date(dayStart.getTime() - OFFSET);
}

function getBeijingEndOfDay(date = new Date()) {
  const beijingNow = date.getTime() + OFFSET;
  const dayEnd = new Date((Math.floor(beijingNow / (24 * 60 * 60 * 1000)) + 1) * (24 * 60 * 60 * 1000) - 1);
  return new Date(dayEnd.getTime() - OFFSET);
}

function getBeijingDateString(date = new Date()) {
  const beijingDate = getBeijingDate(date);
  return beijingDate.toISOString().split('T')[0];
}

function getMonthStart(date = new Date()) {
  const beijingDate = getBeijingDate(date);
  const monthStart = new Date(beijingDate.getFullYear(), beijingDate.getMonth(), 1);
  return new Date(monthStart.getTime() - OFFSET);
}

function getMonthEnd(date = new Date()) {
  const beijingDate = getBeijingDate(date);
  const monthEnd = new Date(beijingDate.getFullYear(), beijingDate.getMonth() + 1, 0, 23, 59, 59, 999);
  return new Date(monthEnd.getTime() - OFFSET);
}

function getYesterdayStart(date = new Date()) {
  const beijingNow = date.getTime() + OFFSET;
  const yesterdayStart = new Date(Math.floor(beijingNow / (24 * 60 * 60 * 1000)) * (24 * 60 * 60 * 1000) - 24 * 60 * 60 * 1000);
  return new Date(yesterdayStart.getTime() - OFFSET);
}

function getYesterdayEnd(date = new Date()) {
  const beijingNow = date.getTime() + OFFSET;
  const yesterdayEnd = new Date(Math.floor(beijingNow / (24 * 60 * 60 * 1000)) * (24 * 60 * 60 * 1000) - 1);
  return new Date(yesterdayEnd.getTime() - OFFSET);
}

module.exports = {
  getBeijingDate,
  getBeijingStartOfDay,
  getBeijingEndOfDay,
  getBeijingDateString,
  getMonthStart,
  getMonthEnd,
  getYesterdayStart,
  getYesterdayEnd
};