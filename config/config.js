require("dotenv").config();

module.exports = {
    development: {
        username: process.env.EXPRESS_DB_USERNAME,
        password: process.env.EXPRESS_DB_PASSWORD,
        database: process.env.EXPRESS_DB_NAME,
        host: process.env.EXPRESS_DB_HOST,
        dialect: "mysql",
        port: process.env.EXPRESS_DB_PORT,
        pool: {
            max: 10, // Jumlah maksimum koneksi dalam pool
            min: 0, // Jumlah minimum koneksi dalam pool
            acquire: 30000, // Waktu maksimum dalam milidetik untuk mencoba mendapatkan koneksi sebelum melempar kesalahan
            idle: 10000 // Waktu maksimum dalam milidetik untuk koneksi tetap tidak aktif sebelum dihapus dari pool
        }
    },
    production: {
        username: process.env.AURORA_DB_USERNAME,
        password: process.env.AURORA_DB_PASSWORD,
        database: process.env.AURORA_DB_NAME,
        host: process.env.AURORA_DB_HOST,
        dialect: "mysql",
        port: process.env.AURORA_DB_PORT,
        pool: {
            max: 10, // Jumlah maksimum koneksi dalam pool
            min: 0, // Jumlah minimum koneksi dalam pool
            acquire: 30000, // Waktu maksimum dalam milidetik untuk mencoba mendapatkan koneksi sebelum melempar kesalahan
            idle: 10000 // Waktu maksimum dalam milidetik untuk koneksi tetap tidak aktif sebelum dihapus dari pool
        }
    },
};