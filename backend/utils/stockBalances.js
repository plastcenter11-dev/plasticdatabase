'use strict';

// Every stock balance with its item, for the screens that warn before taking out more than a warehouse holds.
const { Stock, Item } = require('../models');

const listBalances = () => Stock.findAll({ include: [{ model: Item, attributes: ['id', 'name', 'is_stockable'] }] });

module.exports = { listBalances };
