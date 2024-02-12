const express = require("express");
const router = express.Router();
const jaguarAuthController = require("../controllers/jaguarAuthController");
const jaguarRequestTargetController = require("../controllers/jaguarRequestTargetController");

//List of routes
router.post("/auth", jaguarAuthController.authentication);
router.post("/req-module", jaguarRequestTargetController.requestModule);
//End list

module.exports = router;
