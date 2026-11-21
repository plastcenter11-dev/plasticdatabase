const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    dialect: 'mysql',
    logging: false,
    // many branches at once: a roomier pool, and a request that cannot get a connection fails after 30 s
    pool: { max: Number(process.env.DB_POOL_MAX) || 20, min: 0, acquire: 30000, idle: 10000 },
    dialectOptions: {
      charset: 'utf8mb4',
      connectTimeout: 15000,
    },
    define: {
      timestamps: true,
      underscored: true,
    },
  }
);

module.exports = sequelize;
