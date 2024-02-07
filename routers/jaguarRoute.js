const express = require("express");
const router = express.Router();
const jaguarController = require("../controllers/jaguarController");

//List of routes
router.post("/auth", jaguarController.authentication);
//End list

module.exports = router;
